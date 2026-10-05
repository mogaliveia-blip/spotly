import { discoveryCategories, discoveryTags, eventDiscoveryTypes, isCatalogId, isDiscoveryPosition } from './event-discovery';
import type { DiscoveryCategoryId, DiscoveryTagId, EventDiscoveryTypeId } from './event-discovery';
import { isCalendarRange, isIanaTimezone } from './event-time';
import { isEventName, isEventSlug } from './event-public-identity';

/** JSON transport only: neither runtime relies on an SDK instance crossing the callable. */
export type TimestampDto = { seconds: number; nanoseconds: number };
export type DiscoveryWhen = { kind: 'now' | 'today' | 'weekend' } | { kind: 'date'; day: string };
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
export type DiscoveryResultDto = {
  id: string; contentType: 'event'; sourceId: string; title: string; slug: string;
  position: { lat: number; lng: number };
  typeId: EventDiscoveryTypeId; categoryId: DiscoveryCategoryId; tags?: DiscoveryTagId[];
  timezone: string; windowStartAt: TimestampDto; windowEndAt: TimestampDto;
  thumbnail?: string; distanceMeters?: number;
} & (
  | { timePrecision: 'date'; startDay: string; endDay: string }
  | { timePrecision: 'datetime'; startDay?: never; endDay?: never }
);
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
    'id', 'contentType', 'sourceId', 'title', 'slug', 'position', 'typeId', 'categoryId', 'tags',
    'timePrecision', 'timezone', 'windowStartAt', 'windowEndAt', 'startDay', 'endDay', 'thumbnail', 'distanceMeters',
  ])) return false;
  if (value.contentType !== 'event' || typeof value.sourceId !== 'string' || !value.sourceId ||
      value.sourceId.includes('/') || value.id !== `event_${value.sourceId}` ||
      !isEventName(value.title) || !isEventSlug(value.slug) || !isDiscoveryPosition(value.position) ||
      !isCatalogId(eventDiscoveryTypes, value.typeId) || !isCatalogId(discoveryCategories, value.categoryId) ||
      !isIanaTimezone(value.timezone) || !isTimestampDto(value.windowStartAt) || !isTimestampDto(value.windowEndAt) ||
      compareInstants(value.windowStartAt, value.windowEndAt) > 0) return false;
  if (value.tags !== undefined && (!Array.isArray(value.tags) || value.tags.length > discoveryTags.length ||
      new Set(value.tags).size !== value.tags.length || !value.tags.every((tag) => isCatalogId(discoveryTags, tag)))) return false;
  if (value.thumbnail !== undefined && (typeof value.thumbnail !== 'string' || !value.thumbnail.trim() || value.thumbnail.length > 2048)) return false;
  if (value.distanceMeters !== undefined && (typeof value.distanceMeters !== 'number' || !Number.isFinite(value.distanceMeters) || value.distanceMeters < 0)) return false;
  return value.timePrecision === 'date' ? isCalendarRange(value.startDay, value.endDay) :
    value.timePrecision === 'datetime' && value.startDay === undefined && value.endDay === undefined;
}
