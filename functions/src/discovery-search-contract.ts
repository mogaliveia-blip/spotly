import { discoveryCategories, discoveryTags, eventDiscoveryTypes, isCatalogId, isDiscoveryPosition } from './event-discovery';
import type { DiscoveryCategoryId, DiscoveryTagId, EventDiscoveryTypeId } from './event-discovery';
import { isCalendarRange, isIanaTimezone } from './event-time';
import { isEventName, isEventSlug } from './event-public-identity';

/** JSON transport only: neither runtime relies on an SDK instance crossing the callable. */
export type TimestampDto = { seconds: number; nanoseconds: number };
export type DiscoveryWhen = { kind: 'now' | 'today' | 'tomorrow' | 'weekend' } | { kind: 'date'; day: string };
export type DiscoveryArea =
  | { kind: 'radius'; center: { lat: number; lng: number } }
  | { kind: 'bounds'; north: number; south: number; east: number; west: number };
export type SearchDiscoveryRequest = {
  area: DiscoveryArea;
  when: DiscoveryWhen;
  categoryId?: DiscoveryCategoryId | null;
  typeIds?: EventDiscoveryTypeId[];
  tags?: DiscoveryTagId[];
};
type DiscoveryResultBase = {
  id: string; contentType: 'event'; sourceId: string; title: string;
  position: { lat: number; lng: number };
  typeId: EventDiscoveryTypeId; categoryId: DiscoveryCategoryId; tags?: DiscoveryTagId[];
  timezone: string; windowStartAt: TimestampDto; windowEndAt: TimestampDto;
  thumbnail?: string; distanceMeters?: number;
};
type DiscoveryResultTime =
  | { timePrecision: 'date'; startDay: string; endDay: string }
  | { timePrecision: 'datetime'; startDay?: never; endDay?: never };
export type NativeDiscoveryResultDto = DiscoveryResultBase & { origin?: 'native'; slug: string } & DiscoveryResultTime;
export type ExternalDiscoveryResultDto = DiscoveryResultBase & {
  origin: 'datatourisme'; description: string; editorialType: string | null; startTime?: string;
  city: string; department: string; positionPrecision: 'source_coordinates';
  attribution: { source: 'DATAtourisme'; producer: string | null; publisher: string | null };
  sourceUrl: string | null;
} & DiscoveryResultTime;
export type DiscoveryResultDto = NativeDiscoveryResultDto | ExternalDiscoveryResultDto;
export type SearchDiscoveryResponse = {
  results: DiscoveryResultDto[];
  meta: { complete: boolean; truncated: boolean; partialFailure: boolean; returnedCount: number };
};

export function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
/** Inspect the original callable JSON: Firebase's decoder can lose this reserved key. */
export function hasReservedDiscoveryKey(value: unknown): boolean {
  const pending: unknown[] = [value];
  const visited = new Set<object>();
  while (pending.length) {
    const current = pending.pop();
    if (current === null || typeof current !== 'object' || visited.has(current)) continue;
    visited.add(current);
    if (Object.prototype.hasOwnProperty.call(current, '__proto__')) return true;
    for (const field of Object.values(Object.getOwnPropertyDescriptors(current))) {
      if (Object.prototype.hasOwnProperty.call(field, 'value')) pending.push(field.value);
    }
  }
  return false;
}
/** JSON boundaries accept own enumerable data properties, never inherited values/accessors. */
export function isDataObject(
  value: unknown, required: readonly string[], optional: readonly string[] = [],
): value is Record<string, unknown> {
  if (!isRecord(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) return false;
  const descriptors = Object.getOwnPropertyDescriptors(value);
  return required.every((key) => Object.prototype.hasOwnProperty.call(descriptors, key)) &&
    Reflect.ownKeys(descriptors).every((key) => typeof key === 'string' &&
      (required.includes(key) || optional.includes(key)) &&
      descriptors[key].enumerable && Object.prototype.hasOwnProperty.call(descriptors[key], 'value'));
}
export function hasOnlyKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  return Object.keys(value).every((key) => keys.includes(key));
}
export function isTimestampDto(value: unknown): value is TimestampDto {
  return isRecord(value) && hasOnlyKeys(value, ['seconds', 'nanoseconds']) &&
    Number.isInteger(value.seconds) && Number.isInteger(value.nanoseconds) &&
    (value.seconds as number) >= -62135596800 && (value.seconds as number) <= 253402300799 &&
    (value.nanoseconds as number) >= 0 && (value.nanoseconds as number) < 1_000_000_000;
}
export function compareInstants(a: TimestampDto, b: TimestampDto): number {
  return a.seconds - b.seconds || a.nanoseconds - b.nanoseconds;
}
export function instantFromMillis(milliseconds: number): TimestampDto {
  const seconds = Math.floor(milliseconds / 1000);
  return { seconds, nanoseconds: (milliseconds - seconds * 1000) * 1_000_000 };
}

/** Validate the public allowlist before accepting any network result or serving a projection. */
export function isDiscoveryResultDto(value: unknown): value is DiscoveryResultDto {
  if (!isRecord(value) || !hasOnlyKeys(value, [
    'id', 'contentType', 'origin', 'sourceId', 'title', 'slug', 'description', 'editorialType',
    'city', 'department', 'positionPrecision', 'attribution', 'sourceUrl', 'position', 'typeId', 'categoryId', 'tags',
    'timePrecision', 'timezone', 'windowStartAt', 'windowEndAt', 'startDay', 'endDay', 'startTime', 'thumbnail', 'distanceMeters',
  ])) return false;
  if (value.contentType !== 'event' || typeof value.sourceId !== 'string' || !value.sourceId ||
      value.sourceId.includes('/') || !isEventName(value.title) || !isDiscoveryPosition(value.position) ||
      !isCatalogId(eventDiscoveryTypes, value.typeId) || !isCatalogId(discoveryCategories, value.categoryId) ||
      !isIanaTimezone(value.timezone) || !isTimestampDto(value.windowStartAt) || !isTimestampDto(value.windowEndAt) ||
      compareInstants(value.windowStartAt, value.windowEndAt) > 0) return false;
  if (value.origin === 'datatourisme') {
    if (!/^dt_[0-9a-f]{64}$/.test(value.sourceId) || value.id !== `datatourisme_${value.sourceId}` ||
        value.slug !== undefined || typeof value.description !== 'string' ||
        value.description.length > 1000 ||
        !(value.editorialType === null || (typeof value.editorialType === 'string' &&
          !!value.editorialType.trim() && value.editorialType.length <= 100)) ||
        typeof value.city !== 'string' || !value.city.trim() || value.city.length > 120 ||
        typeof value.department !== 'string' || !/^(?:[0-9]{2,3}|2A|2B)$/.test(value.department) ||
        value.positionPrecision !== 'source_coordinates' ||
        !isDataObject(value.attribution, ['source', 'producer', 'publisher']) ||
        value.attribution.source !== 'DATAtourisme' ||
        !(value.attribution.producer === null || typeof value.attribution.producer === 'string' &&
          !!value.attribution.producer.trim() && value.attribution.producer.length <= 200) ||
        !(value.startTime === undefined || value.timePrecision === 'date' &&
          typeof value.startTime === 'string' && /^(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/.test(value.startTime)) ||
        !(value.attribution.publisher === null || (typeof value.attribution.publisher === 'string' &&
          !!value.attribution.publisher.trim() && value.attribution.publisher.length <= 200)) ||
        !(value.sourceUrl === null || isSafeExternalSourceUrl(value.sourceUrl))) return false;
  } else if ((value.origin !== undefined && value.origin !== 'native') ||
      value.id !== `event_${value.sourceId}` || !isEventSlug(value.slug) ||
      ['description', 'editorialType', 'city', 'department', 'positionPrecision', 'attribution', 'sourceUrl', 'startTime']
        .some((key) => key in value)) return false;
  if (value.tags !== undefined && (!Array.isArray(value.tags) || value.tags.length > discoveryTags.length ||
      new Set(value.tags).size !== value.tags.length || !value.tags.every((tag) => isCatalogId(discoveryTags, tag)))) return false;
  if (value.thumbnail !== undefined && (typeof value.thumbnail !== 'string' || !value.thumbnail.trim() || value.thumbnail.length > 2048)) return false;
  if (value.distanceMeters !== undefined && (typeof value.distanceMeters !== 'number' || !Number.isFinite(value.distanceMeters) || value.distanceMeters < 0)) return false;
  return value.timePrecision === 'date' ? isCalendarRange(value.startDay, value.endDay) :
    value.timePrecision === 'datetime' && value.startDay === undefined && value.endDay === undefined;
}

export function isSafeExternalSourceUrl(value: unknown): value is string {
  if (typeof value !== 'string' || value.length > 2000) return false;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !!url.hostname && !url.username && !url.password;
  } catch { return false; }
}

/** Browser detail reads and server search use the same public-field allowlist. */
export function externalProjectionResultDto(id: string, source: Record<string, unknown>): ExternalDiscoveryResultDto {
  const timestamp = (value: unknown): TimestampDto => {
    const entry = isRecord(value) ? value : {};
    return { seconds: entry.seconds as number, nanoseconds: entry.nanoseconds as number };
  };
  const position = isRecord(source.position) ? source.position : {};
  const attribution = isRecord(source.attribution) ? source.attribution : {};
  const value: Record<string, unknown> = {
    id, contentType: source.contentType, origin: source.origin, sourceId: source.sourceId,
    title: source.title, description: source.description, editorialType: source.editorialType,
    city: source.city, department: source.department, positionPrecision: source.positionPrecision,
    attribution: { source: attribution.source, producer: attribution.producer, publisher: attribution.publisher },
    sourceUrl: source.sourceUrl,
    position: { lat: position.lat, lng: position.lng }, typeId: source.typeId, categoryId: source.categoryId,
    timePrecision: source.timePrecision, timezone: source.timezone,
    windowStartAt: timestamp(source.windowStartAt), windowEndAt: timestamp(source.windowEndAt),
  };
  if (source.timePrecision === 'date') {
    value.startDay = source.startDay;
    value.endDay = source.endDay;
    if (source.startTime !== undefined) value.startTime = source.startTime;
  }
  if (source.tags !== undefined) value.tags = source.tags;
  if (source.thumbnail !== undefined) value.thumbnail = source.thumbnail;
  if (!isDiscoveryResultDto(value) || value.origin !== 'datatourisme') throw new Error('INVALID_DISCOVERY_PROJECTION');
  return value;
}
