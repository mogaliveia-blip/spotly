import { Firestore, Timestamp, Transaction } from 'firebase-admin/firestore';
import { canCommercialPublishPublic } from './commercial-policy';
import {
  discoveryCategories, discoveryTags, eventDiscoveryTypes, isCatalogId, isDiscoveryPosition,
} from './event-discovery';
import { getEventTimeState } from './event-time';
import { isEventName, isEventSlug } from './event-public-identity';

export type EventDiscoveryProjection = {
  contentType: 'event';
  sourceId: string;
  title: string;
  slug: string;
  position: { lat: number; lng: number };
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

/** Bound all occurrences of each civil day, including historical clock reversals across midnight. */
function calendarWindow(startDay: string, endDay: string, timezone: string): [Timestamp, Timestamp] | null {
  const hour = 60 * 60 * 1000;
  const dayLength = 24 * hour;
  const formatter = new Intl.DateTimeFormat('en', {
    timeZone: timezone, calendar: 'gregory', numberingSystem: 'latn',
    era: 'short', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  });
  const offsetAt = (milliseconds: number) => {
    const parts = formatter.formatToParts(new Date(milliseconds));
    const part = (type: string) => parts.find((entry) => entry.type === type)!.value;
    const year = part('era') === 'BC' ? 1 - Number(part('year')) : Number(part('year'));
    // UTC here is only a coordinate system for civil arithmetic, not an Event instant.
    const civil = new Date(0);
    civil.setUTCFullYear(year, Number(part('month')) - 1, Number(part('day')));
    civil.setUTCHours(Number(part('hour')), Number(part('minute')), Number(part('second')), 0);
    return civil.getTime() - milliseconds;
  };
  const dayBounds = (day: string): [number, number] | null => {
    const civilStart = new Date(`${day}T00:00:00Z`).getTime();
    const civilEnd = civilStart + dayLength;
    // This margin encloses every IANA offset, including historical date-line changes.
    let segmentStart = civilStart - 2 * dayLength;
    const limit = civilEnd + 2 * dayLength;
    let offset = offsetAt(segmentStart);
    let first = Infinity;
    let last = -Infinity;
    const includeSegment = (segmentEnd: number) => {
      // Civil time advances linearly within a constant-offset segment. Intersect it
      // with the requested day, then take the hull of all occurrences of that day.
      const start = Math.max(segmentStart, civilStart - offset);
      const end = Math.min(segmentEnd, civilEnd - offset);
      if (start < end) {
        first = Math.min(first, start);
        last = Math.max(last, end);
      }
    };
    // Isolate IANA offset transitions with hourly probes. Only the offset transition
    // is searched within a probe interval; the local calendar date need not be monotone.
    for (let probe = segmentStart + hour; probe <= limit; probe += hour) {
      const nextOffset = offsetAt(probe);
      if (nextOffset === offset) continue;
      let low = probe - hour;
      let high = probe;
      while (high - low > 1000) {
        const middle = Math.floor((low + high) / 2000) * 1000;
        if (offsetAt(middle) === offset) low = middle;
        else high = middle;
      }
      includeSegment(high);
      segmentStart = high;
      offset = nextOffset;
    }
    includeSegment(limit);
    // A skipped civil day has no interval; never invent a position in time for it.
    return first < last ? [first, last] : null;
  };
  const firstDay = dayBounds(startDay);
  const lastDay = startDay === endDay ? firstDay : dayBounds(endDay);
  if (!firstDay || !lastDay || firstDay[0] >= lastDay[1]) return null;
  try {
    const finalSecond = Timestamp.fromMillis(lastDay[1] - 1).seconds;
    // Firestore stores microseconds: use the last persistable instant, without round-trip truncation.
    return [Timestamp.fromMillis(firstDay[0]), new Timestamp(finalSecond, 999999000)];
  }
  catch { return null; }
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
    typeId: event.typeId, categoryId: event.categoryId,
    timePrecision: state, timezone: event.timezone as string,
    windowStartAt: window[0], windowEndAt: window[1],
    // Old sources may lack updatedAt; an epoch is deterministic and not an eligibility rule.
    updatedAt: timestamp(event.updatedAt) ?? Timestamp.fromMillis(0),
  };
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
