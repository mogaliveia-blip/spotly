import { createHash } from 'node:crypto';
import { classifyDatatourisme } from './datatourisme-classification';
import { canonicalDatatourismeUuid } from './datatourisme-detail';
import { assessDatatourismePeriods, definitiveExpirationAt, normalizeDatatourismePeriods } from './datatourisme-periods';
import type { NormalizedExternalPeriod } from './datatourisme-periods';
import { discoveryCategories, isCatalogId, isDiscoveryPosition } from './event-discovery';
import type { DiscoveryCategoryId } from './event-discovery';
import { isIanaTimezone } from './event-time';

const DEPARTMENTS = ['22', '29', '35', '56'] as const;
type Department = typeof DEPARTMENTS[number];
type Term = { key: string | null; label: string | null };
type RecordValue = Record<string, unknown>;
export type ExternalEvent = {
  id: string;
  origin: 'datatourisme';
  sourceUuid: string;
  sourceUrl: string | null;
  attribution: { producer: string; publisher: string | null; source: 'DATAtourisme' };
  editorial: {
    title: string; description: string; categoryId: DiscoveryCategoryId;
    editorialType: string | null; categoryMode: 'automatic' | 'manual';
    sourceTypes: Term[]; sourceThemes: Term[];
  };
  location: { city: string; department: Department; position: { lat: number; lng: number }; precision: 'source_coordinates' };
  timezone: string;
  periods: NormalizedExternalPeriod[];
  completeness: 'complete' | 'incomplete';
  sync: { state: 'complete' | 'incomplete' | 'error'; lastSuccessfulAt: string | null; sourceUpdatedAt: string | null };
  publication: { state: 'draft' | 'approved' | 'hidden' };
  projectionIds: string[];
  expiresAt: string | null;
};

export function externalEventId(uuid: unknown): string | null {
  const canonical = canonicalDatatourismeUuid(uuid);
  return canonical ? `dt_${createHash('sha256').update(canonical).digest('hex')}` : null;
}

export function externalEventPath(uuid: unknown): string | null {
  const id = externalEventId(uuid);
  return id ? `datatourisme_events/${id}` : null;
}

/** A future transaction must compare both identity fields before any create or update. */
export function matchesExternalIdentity(stored: unknown, uuid: unknown): boolean {
  const expectedId = externalEventId(uuid);
  if (!expectedId || !stored || typeof stored !== 'object' || Array.isArray(stored)) return false;
  const item = stored as RecordValue;
  return item.origin === 'datatourisme' && item.id === expectedId &&
    item.sourceUuid === canonicalDatatourismeUuid(uuid);
}

function record(value: unknown): RecordValue {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as RecordValue : {};
}
function first(value: unknown): unknown { return Array.isArray(value) ? value[0] : value; }
function short(value: unknown, max = 1000): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, max) : null;
}
function localized(value: unknown): string | null {
  if (typeof value === 'string') return short(value);
  const data = record(value);
  return short(data['@fr']) ?? short(data.fr) ?? short(data['@en']) ?? short(data.en) ??
    Object.values(data).map((item) => short(item)).find(Boolean) ?? null;
}
function termList(value: unknown): Term[] {
  const values = Array.isArray(value) ? value : value == null ? [] : [value];
  const seen = new Set<string>();
  return values.map((item) => {
    const entry = record(item);
    const uri = short(entry.uri, 500);
    const key = short(entry.key, 100) ?? (uri ? short(uri.split(/[\/#]/).pop(), 100) : null);
    return { key, label: localized(entry.label) ?? (typeof item === 'string' ? short(item) : null) ?? key };
  }).filter((entry) => {
    const key = entry.key ?? entry.label;
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
function sourceUrl(value: unknown): string | null {
  const raw = short(value, 2000);
  if (!raw) return null;
  try {
    const url = new URL(raw);
    return ['https:', 'http:'].includes(url.protocol) ? url.toString() : null;
  } catch { return null; }
}
function departmentOf(address: RecordValue): string | null {
  return short(record(record(address.hasAddressCity).isPartOfDepartment).insee, 3);
}
function validIso(value: unknown): value is string {
  return typeof value === 'string' && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value;
}
function validTerms(value: unknown): boolean {
  return Array.isArray(value) && value.length <= 100 && value.every((item) => {
    const term = record(item);
    return (term.key === null || short(term.key, 100) !== null) &&
      (term.label === null || short(term.label, 500) !== null) &&
      (term.key !== null || term.label !== null);
  });
}

/** Strict gate for future writes and dry-run cleanup; no Firestore path is accepted. */
export function isExternalEvent(value: unknown): value is ExternalEvent {
  const event = record(value);
  if (!matchesExternalIdentity(event, event.sourceUuid) ||
      !short(event.attribution && record(event.attribution).producer) ||
      record(event.attribution).source !== 'DATAtourisme' ||
      !(record(event.attribution).publisher === null || short(record(event.attribution).publisher)) ||
      !(event.sourceUrl === null || sourceUrl(event.sourceUrl) === event.sourceUrl) ||
      !short(record(event.editorial).title) || !short(record(event.editorial).description) ||
      !isCatalogId(discoveryCategories, record(event.editorial).categoryId) ||
      !(record(event.editorial).editorialType === null || short(record(event.editorial).editorialType)) ||
      !validTerms(record(event.editorial).sourceTypes) || !validTerms(record(event.editorial).sourceThemes) ||
      !['automatic', 'manual'].includes(String(record(event.editorial).categoryMode)) ||
      !short(record(event.location).city) || !DEPARTMENTS.includes(record(event.location).department as Department) ||
      !isDiscoveryPosition(record(event.location).position) ||
      record(event.location).precision !== 'source_coordinates' || !isIanaTimezone(event.timezone) ||
      !Array.isArray(event.periods) || !event.periods.length ||
      !['complete', 'incomplete'].includes(String(event.completeness)) ||
      !['complete', 'incomplete', 'error'].includes(String(record(event.sync).state)) ||
      !(record(event.sync).lastSuccessfulAt === null || validIso(record(event.sync).lastSuccessfulAt)) ||
      !(record(event.sync).sourceUpdatedAt === null || validIso(record(event.sync).sourceUpdatedAt)) ||
      !['draft', 'approved', 'hidden'].includes(String(record(event.publication).state)) ||
      !Array.isArray(event.projectionIds) || event.projectionIds.length > 1 ||
      !event.projectionIds.every((id) => id === `datatourisme_${event.id}`) ||
      !(event.expiresAt === null || validIso(event.expiresAt))) return false;
  const rawPeriods = event.periods.map((entry) => {
    const period = record(entry);
    return period.timePrecision === 'date'
      ? { startDate: period.startDay, endDate: period.endDay }
      : period.timePrecision === 'datetime'
        ? { startDate: period.startAt, endDate: period.endAt }
        : null;
  });
  const normalized = normalizeDatatourismePeriods(rawPeriods, event.timezone as string);
  return normalized !== null && JSON.stringify(normalized) === JSON.stringify(event.periods) &&
    event.expiresAt === definitiveExpirationAt(normalized, event.timezone as string);
}

export type PrepareInput = {
  expectedUuid: string;
  expectedDepartment: Department;
  complete: boolean;
  poi: unknown;
  timezone: string;
  now: Date;
  manualCategory?: DiscoveryCategoryId;
};
export type PreparedCandidate = { kind: 'accepted'; event: ExternalEvent } | { kind: 'rejected'; reasons: string[] };

/** Converts a complete detail response only; acceptance does not import or publish. */
export function prepareDatatourismeCandidate(input: PrepareInput): PreparedCandidate {
  const reasons: string[] = [];
  const expected = canonicalDatatourismeUuid(input.expectedUuid);
  const poi = record(input.poi);
  if (!expected || canonicalDatatourismeUuid(poi.uuid) !== expected) reasons.push('UUID_INCOHERENT');
  if (!DEPARTMENTS.includes(input.expectedDepartment)) reasons.push('DEPARTMENT_INVALID');
  if (!input.complete) reasons.push('SOURCE_INCOMPLETE');
  if (!isIanaTimezone(input.timezone)) reasons.push('TIMEZONE_INVALID');
  if (!(input.now instanceof Date) || !Number.isFinite(input.now.getTime())) reasons.push('REFERENCE_TIME_INVALID');

  const periods = poi.takesPlaceAt;
  const assessment = assessDatatourismePeriods(periods, input.timezone, input.now);
  const normalized = normalizeDatatourismePeriods(periods, input.timezone);
  if (!Array.isArray(periods) || periods.length !== 1) reasons.push('PERIOD_COUNT_UNSUPPORTED');
  if (!normalized) reasons.push('PERIOD_INVALID');
  if (assessment.openEndedCount || normalized?.some((period) => period.timePrecision === 'date' ? !period.endDay : !period.endAt)) reasons.push('PERIOD_END_MISSING');
  if (assessment.definitivelyExpired) reasons.push('EXPIRED');
  if (assessment.timing === 'indeterminate') reasons.push('PERIOD_UNCERTAIN');

  const title = localized(poi.label);
  const descriptionItems = Array.isArray(poi.hasDescription) ? poi.hasDescription : [];
  const description = descriptionItems.map((entry) => localized(record(entry).description) ?? localized(record(entry).shortDescription)).find(Boolean) ?? null;
  const producerData = record(poi.hasBeenCreatedBy);
  const producer = short(producerData.legalName) ?? short(producerData.identifier);
  const publisherData = record(first(poi.hasBeenPublishedBy));
  const publisher = short(publisherData.legalName) ?? short(publisherData.identifier);
  if (!title || !description || !producer) reasons.push('CONTENT_INCOMPLETE');

  const places = Array.isArray(poi.isLocatedAt) ? poi.isLocatedAt.map(record) : [];
  const place = places.find((entry) => Array.isArray(entry.address) && entry.address.some((item) => departmentOf(record(item)) === input.expectedDepartment)) ?? record(first(poi.isLocatedAt));
  const addresses = Array.isArray(place.address) ? place.address.map(record) : [];
  const address = addresses.find((item) => departmentOf(item) === input.expectedDepartment) ?? record(first(place.address));
  const city = localized(record(address.hasAddressCity).label) ?? short(address.addressLocality);
  const department = departmentOf(address);
  const geo = record(place.geo);
  const position = { lat: geo.latitude, lng: geo.longitude };
  if (department !== input.expectedDepartment || !city || !isDiscoveryPosition(position)) reasons.push('LOCATION_UNUSABLE');

  const types = termList(poi.type);
  const themes = termList(poi.hasTheme);
  if (!types.length) reasons.push('SOURCE_TYPES_MISSING');
  const proposal = classifyDatatourisme({ category: types[0]?.label ?? null, sourceTypes: types, sourceThemes: themes });
  const manual = input.manualCategory;
  if (manual !== undefined && !isCatalogId(discoveryCategories, manual)) reasons.push('CATEGORY_INVALID');
  if (!manual && (proposal.needsReview || !proposal.categoryId)) reasons.push('CLASSIFICATION_REVIEW_REQUIRED');
  if (reasons.length || !expected || !normalized || !title || !description || !producer || !city ||
      !isDiscoveryPosition(position) || !DEPARTMENTS.includes(department as Department)) return { kind: 'rejected', reasons };

  const categoryId = manual ?? proposal.categoryId!;
  const event: ExternalEvent = {
    id: externalEventId(expected)!, origin: 'datatourisme', sourceUuid: expected,
    sourceUrl: sourceUrl(poi.uri), attribution: { producer, publisher, source: 'DATAtourisme' },
    editorial: {
      title, description, categoryId, editorialType: proposal.editorialType,
      categoryMode: manual ? 'manual' : 'automatic', sourceTypes: types, sourceThemes: themes,
    },
    location: { city, department: department as Department, position, precision: 'source_coordinates' },
    timezone: input.timezone, periods: normalized, completeness: 'complete',
    sync: { state: 'complete', lastSuccessfulAt: input.now.toISOString(), sourceUpdatedAt: validIso(poi.lastUpdate) ? poi.lastUpdate : null },
    publication: { state: 'draft' }, projectionIds: [],
    expiresAt: definitiveExpirationAt(normalized, input.timezone),
  };
  return { kind: 'accepted', event };
}

/** Preserve editorial authority and detect an ID collision before a future transaction writes. */
export function reconcileExternalCandidate(existing: unknown, candidate: ExternalEvent): PreparedCandidate {
  if (!isExternalEvent(candidate)) return { kind: 'rejected', reasons: ['CANDIDATE_INVALID'] };
  if (existing === null) return { kind: 'accepted', event: candidate };
  if (!isExternalEvent(existing) || !matchesExternalIdentity(existing, candidate.sourceUuid)) {
    return { kind: 'rejected', reasons: ['IDENTITY_COLLISION_OR_INVALID_STORED_RECORD'] };
  }
  return { kind: 'accepted', event: {
    ...candidate,
    editorial: existing.editorial.categoryMode === 'manual'
      ? { ...candidate.editorial, categoryId: existing.editorial.categoryId, editorialType: existing.editorial.editorialType, categoryMode: 'manual' }
      : candidate.editorial,
    publication: existing.publication,
    projectionIds: existing.projectionIds,
  } };
}

export type CleanupDecision =
  | { action: 'keep' | 'defer_review'; reason: string }
  | { action: 'hide_publicly' | 'remove_external_projection' | 'purge_candidate'; reason: string; projectionId?: string };

/** The future reader must supply the projection document ID and its stored identity fields. */
function matchesExternalProjection(projection: unknown, event: ExternalEvent): boolean {
  const item = record(projection);
  return item.id === `datatourisme_${event.id}` && item.origin === 'datatourisme' &&
    item.sourceId === event.id;
}

/** Dry-run decision only; never accepts a Firestore path or produces a write operation. */
export function decideExternalCleanup(value: unknown, now: Date, retentionDays = 30, projection?: unknown): CleanupDecision {
  if (!isExternalEvent(value) || !(now instanceof Date) || !Number.isFinite(now.getTime()) ||
      !Number.isSafeInteger(retentionDays) || retentionDays < 1) return { action: 'defer_review', reason: 'INVALID_OR_UNCERTAIN_SOURCE' };
  const event = value;
  if (event.projectionIds.length && !matchesExternalProjection(projection, event)) {
    return { action: 'defer_review', reason: 'PROJECTION_ORIGIN_UNVERIFIED' };
  }
  if (event.publication.state === 'hidden' && event.projectionIds.length) {
    return { action: 'hide_publicly', reason: 'EDITORIAL_HIDE', projectionId: event.projectionIds[0] };
  }
  if (event.completeness !== 'complete' || event.sync.state !== 'complete' || !event.sync.lastSuccessfulAt ||
      !validIso(event.sync.lastSuccessfulAt) || !event.expiresAt) return { action: 'defer_review', reason: 'INCOMPLETE_OR_UNSYNCED' };
  if (Date.parse(event.sync.lastSuccessfulAt) > now.getTime()) return { action: 'defer_review', reason: 'SYNC_TIME_INVALID' };
  if (Date.parse(event.expiresAt) > now.getTime()) return { action: 'keep', reason: 'NOT_EXPIRED' };
  if (Date.parse(event.sync.lastSuccessfulAt) < Date.parse(event.expiresAt)) {
    return { action: 'defer_review', reason: 'RESYNC_AFTER_EXPIRY_REQUIRED' };
  }
  if (event.projectionIds.length) return { action: 'remove_external_projection', reason: 'EXPIRED', projectionId: event.projectionIds[0] };
  if (Date.parse(event.expiresAt) + retentionDays * 86_400_000 <= now.getTime()) {
    return { action: 'purge_candidate', reason: 'RETENTION_ELAPSED_VERIFIED' };
  }
  return { action: 'keep', reason: 'RETENTION_OR_RESYNC_PENDING' };
}
