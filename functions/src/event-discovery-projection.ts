import { Firestore, Timestamp, Transaction } from 'firebase-admin/firestore';
import { canCommercialPublishPublic } from './commercial-policy';
import {
  discoveryCategories, discoveryTags, eventDiscoveryTypes, isCatalogId, isDiscoveryPosition,
} from './event-discovery';
import { getEventTimeState } from './event-time';
import { calendarDaySegments } from './event-calendar-segments';
import { discoveryGeohash } from './discovery-geo';
import { isEventName, isEventSlug } from './event-public-identity';

export type EventDiscoveryProjection = {
  contentType: 'event';
  sourceId: string;
  title: string;
  slug: string;
  position: { lat: number; lng: number };
  geohash: string;
  startDay?: string;
  endDay?: string;
  typeId: string;
  categoryId: string;
  tags?: string[];
  timePrecision: 'date' | 'datetime';
  timezone: string;
  windowStartAt: Timestamp;
  windowEndAt: Timestamp;
  thumbnail?: string;
  updatedAt: Timestamp;
};

/** Accept persisted instants, never implicit numeric/string dates. Preserve nanoseconds. */
function timestamp(value: unknown): Timestamp | null {
  try {
    if (value instanceof Date) return Timestamp.fromDate(value);
    if (value && typeof value === 'object' && 'seconds' in value && 'nanoseconds' in value &&
        Number.isInteger(value.seconds) && Number.isInteger(value.nanoseconds)) {
      return new Timestamp(value.seconds as number, value.nanoseconds as number);
    }
  } catch { /* Invalid or out-of-range instant is not eligible. */ }
  return null;
}

/** Preserve the V1-C envelope and inclusive last persistable microsecond. */
function calendarWindow(startDay: string, endDay: string, timezone: string): [Timestamp, Timestamp] | null {
  const first = calendarDaySegments(startDay, timezone);
  const last = startDay === endDay ? first : calendarDaySegments(endDay, timezone);
  if (!first.length || !last.length) return null;
  const start = first[0].start;
  const end = last[last.length - 1].endExclusive;
  if (start >= end) return null;
  try {
    return [Timestamp.fromMillis(start), new Timestamp(Timestamp.fromMillis(end - 1).seconds, 999999000)];
  } catch { return null; }
}

/** Single eligibility definition and explicit public allowlist. No current-time test. */
export function buildEventDiscoveryProjection(
  eventId: string, event: Record<string, unknown>
): EventDiscoveryProjection | null {
  if (event.status !== 'published' || event.visibility !== 'public' ||
      event.deletionRequestedAt !== undefined || event.deletionRequestedBy !== undefined ||
      !isEventName(event.name) || !isEventSlug(event.slug) ||
      !isDiscoveryPosition(event.discoveryPosition) ||
      !isCatalogId(eventDiscoveryTypes, event.typeId) ||
      !isCatalogId(discoveryCategories, event.categoryId)) return null;
  const commercial = event.commercial as { offerCode?: unknown; state?: unknown } | undefined;
  if (!commercial || typeof commercial.offerCode !== 'string' ||
      !['free_draft', 'private', 'public'].includes(commercial.offerCode) ||
      !canCommercialPublishPublic(commercial as Parameters<typeof canCommercialPublishPublic>[0])) return null;
  if (event.tags !== undefined && (!Array.isArray(event.tags) ||
      !event.tags.every((tag) => isCatalogId(discoveryTags, tag)))) return null;

  const start = timestamp(event.startDate);
  const end = timestamp(event.endDate);
  const state = getEventTimeState({
    ...event,
    startDate: event.startDate === undefined ? undefined : start?.toDate(),
    endDate: event.endDate === undefined ? undefined : end?.toDate(),
  });
  // Failed timestamp decoding must not hide competing temporal fields in date mode.
  if (state === 'legacy' || state === 'invalid' ||
      (event.startDate !== undefined && !start) || (event.endDate !== undefined && !end)) return null;
  const window = state === 'datetime' && start && end ? [start, end] :
    calendarWindow(event.startDay as string, event.endDay as string, event.timezone as string);
  if (!window || (state === 'datetime' &&
      (window[0].seconds > window[1].seconds ||
       (window[0].seconds === window[1].seconds && window[0].nanoseconds > window[1].nanoseconds)))) return null;

  const projection: EventDiscoveryProjection = {
    contentType: 'event', sourceId: eventId, title: event.name.trim(), slug: event.slug,
    position: { lat: event.discoveryPosition.lat, lng: event.discoveryPosition.lng },
    geohash: discoveryGeohash(event.discoveryPosition),
    typeId: event.typeId, categoryId: event.categoryId,
    timePrecision: state, timezone: event.timezone as string,
    windowStartAt: window[0], windowEndAt: window[1],
    // Old sources may lack updatedAt; an epoch is deterministic and not an eligibility rule.
    updatedAt: timestamp(event.updatedAt) ?? Timestamp.fromMillis(0),
  };
  if (state === 'date') {
    projection.startDay = event.startDay as string;
    projection.endDay = event.endDay as string;
  }
  if (event.tags !== undefined) {
    projection.tags = discoveryTags.filter((tag) => (event.tags as string[]).includes(tag.id)).map((tag) => tag.id);
  }
  if (typeof event.eventCoverUrl === 'string' && event.eventCoverUrl.trim() && event.eventCoverUrl.length <= 2048) {
    projection.thumbnail = event.eventCoverUrl;
  }
  return projection;
}

/** Called with the post-mutation source, in the same transaction as the Event write. */
export function syncEventDiscoveryProjection(
  transaction: Transaction, firestore: Firestore, eventId: string, nextEvent: Record<string, unknown>
): void {
  const reference = firestore.doc(`discovery_public/event_${eventId}`);
  const projection = buildEventDiscoveryProjection(eventId, nextEvent);
  if (projection) transaction.set(reference, projection);
  else transaction.delete(reference);
}
