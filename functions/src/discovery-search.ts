import { HttpsError } from 'firebase-functions/v2/https';
import { Timestamp } from 'firebase-admin/firestore';
import type { Firestore, QueryDocumentSnapshot } from 'firebase-admin/firestore';
import { discoveryCategories, discoveryTags, eventDiscoveryTypes, isCatalogId } from './event-discovery';
import {
  isDataObject, isRecord, isDiscoveryResultDto, isTimestampDto,
} from './discovery-search-contract';
import type {
  DiscoveryArea, DiscoveryResultDto, SearchDiscoveryRequest, SearchDiscoveryResponse, TimestampDto,
} from './discovery-search-contract';
import {
  geographicQueryRanges, isLatLng, isMapBounds, isAllowedBounds, pointInBounds,
  distanceMeters, DISCOVERY_RADIUS_METERS,
} from './discovery-geo';
import type { GeohashRange } from './discovery-geo';
import { isCalendarDay } from './event-time';
import { discoveryCandidateWindow, matchesDiscoveryWhen } from './discovery-time';
import type { CandidateWindow } from './discovery-time';
import { calendarDaySegments } from './event-calendar-segments';
import type { UtcSegment } from './event-calendar-segments';
import { buildDiscoverySearchQuery } from './discovery-search-query';

export const MAX_CANDIDATE_READS = 500;
export const MAX_PUBLIC_RESULTS = 100;
export type RangeExplorationState = 'exhausted' | 'budget_limited' | 'failed';
export type CandidateDocument = { id: string; data: Record<string, unknown> };
export type CandidatePage = { documents: CandidateDocument[]; cursor?: unknown };
export type RangePageReader = (range: GeohashRange, limit: number, cursor?: unknown) => Promise<CandidatePage>;

function invalid(reason = 'INVALID_DISCOVERY_REQUEST'): never {
  throw new HttpsError('invalid-argument', reason, { reason });
}
export function validateSearchDiscoveryRequest(value: unknown): SearchDiscoveryRequest {
  if (!isDataObject(value, ['area', 'when'], ['categoryId', 'typeIds', 'tags'])) invalid();
  const area = value.area;
  if (!isDataObject(area, ['kind'], ['center', 'north', 'south', 'east', 'west'])) invalid();
  let normalizedArea: DiscoveryArea;
  if (area.kind === 'radius') {
    if (!isDataObject(area, ['kind', 'center']) || !isLatLng(area.center)) invalid();
    normalizedArea = { kind: 'radius', center: { lat: area.center.lat, lng: area.center.lng } };
  } else if (area.kind === 'bounds') {
    if (!isDataObject(area, ['kind', 'north', 'south', 'east', 'west']) || !isMapBounds(area)) invalid();
    if (!isAllowedBounds(area)) invalid('DISCOVERY_AREA_TOO_LARGE');
    normalizedArea = { kind: 'bounds', north: area.north, south: area.south, east: area.east, west: area.west };
  } else invalid();
  const when = value.when;
  if (!isDataObject(when, ['kind'], ['day'])) invalid();
  if (when.kind === 'date') {
    if (!isDataObject(when, ['kind', 'day']) || !isCalendarDay(when.day)) invalid();
  } else if (!['now', 'today', 'weekend'].includes(when.kind as string) || !isDataObject(when, ['kind'])) invalid();
  if ('categoryId' in value && value.categoryId !== null && !isCatalogId(discoveryCategories, value.categoryId)) invalid();
  for (const [key, catalog] of [['typeIds', eventDiscoveryTypes], ['tags', discoveryTags]] as const) {
    if (!(key in value)) continue;
    const ids = value[key];
    if (!Array.isArray(ids) || Object.getPrototypeOf(ids) !== Array.prototype || ids.length > catalog.length ||
        Reflect.ownKeys(ids).length !== ids.length + 1) invalid();
    for (let i = 0; i < ids.length; i++) {
      const field = Object.getOwnPropertyDescriptor(ids, String(i));
      if (!field?.enumerable || !Object.prototype.hasOwnProperty.call(field, 'value') ||
          !isCatalogId(catalog, field.value)) invalid();
    }
  }
  // Copy the request so a caller cannot mutate its context during an asynchronous read.
  return {
    area: normalizedArea,
    when: when.kind === 'date' ? { kind: 'date', day: when.day as string } : { kind: when.kind as 'now' | 'today' | 'weekend' },
    categoryId: value.categoryId as SearchDiscoveryRequest['categoryId'] ?? null,
    typeIds: [...new Set(value.typeIds as SearchDiscoveryRequest['typeIds'] ?? [])],
    tags: [...new Set(value.tags as SearchDiscoveryRequest['tags'] ?? [])],
  };
}

/** Explicit projection-to-network allowlist. Extra source fields are never copied. */
export function projectionResultDto(document: CandidateDocument): DiscoveryResultDto {
  const p = document.data;
  const timestampDto = (value: unknown): TimestampDto => {
    if (!isRecord(value)) throw new Error('INVALID_DISCOVERY_PROJECTION');
    const dto = { seconds: value.seconds as number, nanoseconds: value.nanoseconds as number };
    if (!isTimestampDto(dto)) throw new Error('INVALID_DISCOVERY_PROJECTION');
    return dto;
  };
  const position = p.position as { lat?: unknown; lng?: unknown } | undefined;
  const result: Record<string, unknown> = {
    id: document.id, contentType: p.contentType, sourceId: p.sourceId, title: p.title, slug: p.slug,
    position: { lat: position?.lat, lng: position?.lng }, typeId: p.typeId, categoryId: p.categoryId,
    timePrecision: p.timePrecision, timezone: p.timezone,
    windowStartAt: timestampDto(p.windowStartAt), windowEndAt: timestampDto(p.windowEndAt),
  };
  if (p.timePrecision === 'date') { result.startDay = p.startDay; result.endDay = p.endDay; }
  if (p.tags !== undefined) result.tags = Array.isArray(p.tags) ? [...p.tags] : p.tags;
  if (p.thumbnail !== undefined) result.thumbnail = p.thumbnail;
  if (!isDiscoveryResultDto(result)) throw new Error('INVALID_DISCOVERY_PROJECTION');
  return result;
}

export function allocateRangeBudgets(rangeCount: number): number[] {
  if (!Number.isInteger(rangeCount) || rangeCount <= 0 || rangeCount > MAX_CANDIDATE_READS) throw new Error('INVALID_RANGE_COUNT');
  return Array.from({ length: rangeCount }, (_, i) => Math.floor(MAX_CANDIDATE_READS / rangeCount) + (i < MAX_CANDIDATE_READS % rangeCount ? 1 : 0));
}

/** The reader seam is local to this bounded engine; it permits deterministic failure/budget tests. */
export async function executeDiscoverySearch(
  request: SearchDiscoveryRequest, now: TimestampDto, ranges: GeohashRange[], readPage: RangePageReader,
  onRangeFailure: (error: unknown) => void = () => {},
): Promise<SearchDiscoveryResponse> {
  const budgets = allocateRangeBudgets(ranges.length);
  const explorations = await Promise.all(ranges.map(async (range, index) => {
    const documents: CandidateDocument[] = [];
    let cursor: unknown;
    let state: RangeExplorationState = 'budget_limited';
    try {
      while (documents.length < budgets[index]) {
        const limit = Math.min(100, budgets[index] - documents.length);
        const page = await readPage(range, limit, cursor);
        if (page.documents.length > limit) throw new Error('CANDIDATE_READER_EXCEEDED_LIMIT');
        documents.push(...page.documents);
        if (page.documents.length < limit) { state = 'exhausted'; break; }
        if (documents.length >= budgets[index]) break;
        if (!page.cursor || page.cursor === cursor) throw new Error('INVALID_CANDIDATE_CURSOR');
        cursor = page.cursor;
      }
      // Validate before deduplication: a corrupt projection must not certify an exhaustive zero.
      return { state, results: documents.map(projectionResultDto) };
    } catch (error) {
      onRangeFailure(error);
      return { state: 'failed' as RangeExplorationState, results: [] as DiscoveryResultDto[] };
    }
  }));
  if (explorations.every((range) => range.state === 'failed')) {
    throw new HttpsError('unavailable', 'DISCOVERY_SEARCH_UNAVAILABLE', { reason: 'DISCOVERY_SEARCH_UNAVAILABLE' });
  }
  const candidates = new Map<string, DiscoveryResultDto>();
  for (const exploration of explorations) for (const result of exploration.results) candidates.set(result.id, result);
  const segmentCache = new Map<string, UtcSegment[]>();
  const segmentsFor = (day: string, timezone: string) => {
    const key = `${timezone}:${day}`;
    if (!segmentCache.has(key)) segmentCache.set(key, calendarDaySegments(day, timezone));
    return segmentCache.get(key)!;
  };
  const matching: DiscoveryResultDto[] = [];
  for (const result of candidates.values()) {
    if (request.categoryId && result.categoryId !== request.categoryId) continue;
    if (request.typeIds?.length && !request.typeIds.includes(result.typeId)) continue;
    if (request.tags?.some((tag) => !result.tags?.includes(tag))) continue;
    if (request.area.kind === 'radius') {
      const distance = distanceMeters(result.position, request.area.center);
      if (distance > DISCOVERY_RADIUS_METERS) continue;
      result.distanceMeters = distance;
    } else if (!pointInBounds(result.position, request.area)) continue;
    if (matchesDiscoveryWhen(result, request.when, now, segmentsFor)) matching.push(result);
  }
  matching.sort((a, b) => (request.area.kind === 'radius' ? a.distanceMeters! - b.distanceMeters! : 0) ||
    (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const partialFailure = explorations.some((range) => range.state === 'failed');
  const truncated = explorations.some((range) => range.state === 'budget_limited') || matching.length > MAX_PUBLIC_RESULTS;
  const results = matching.slice(0, MAX_PUBLIC_RESULTS);
  return { results, meta: { complete: !partialFailure && !truncated, partialFailure, truncated, returnedCount: results.length } };
}

export async function searchDiscovery(
  firestore: Firestore, raw: unknown, clock: () => TimestampDto = () => Timestamp.now(),
  onRangeFailure: (error: unknown) => void = () => {},
): Promise<SearchDiscoveryResponse> {
  const captured = clock();
  const now = { seconds: captured.seconds, nanoseconds: captured.nanoseconds };
  if (!isTimestampDto(now)) throw new HttpsError('internal', 'INVALID_SEARCH_CLOCK');
  const request = validateSearchDiscoveryRequest(raw);
  const ranges = geographicQueryRanges(request.area);
  const window: CandidateWindow = discoveryCandidateWindow(request.when, now);
  return executeDiscoverySearch(request, now, ranges, async (range, limit, cursor) => {
    const snapshot = await buildDiscoverySearchQuery(firestore, request, range, window, limit, cursor as QueryDocumentSnapshot | undefined).get();
    return {
      documents: snapshot.docs.map((doc) => ({ id: doc.id, data: doc.data() })),
      cursor: snapshot.docs[snapshot.docs.length - 1],
    };
  }, onRangeFailure);
}
