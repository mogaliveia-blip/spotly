import { Timestamp } from 'firebase-admin/firestore';
import { isExternalEvent } from './datatourisme-external';
import type { ExternalEvent } from './datatourisme-external';
import { externalProjectionResultDto, isSafeExternalSourceUrl } from './discovery-search-contract';
import { discoveryGeohash } from './discovery-geo';
import { calendarDaySegments } from './event-calendar-segments';
import { isEventName } from './event-public-identity';

type PublicExternalProjection = {
  contentType: 'event'; origin: 'datatourisme'; sourceId: string;
  title: string; description: string; editorialType: string | null;
  city: string; department: string; positionPrecision: 'source_coordinates';
  attribution: { source: 'DATAtourisme'; producer: string; publisher: string | null };
  sourceUrl: string | null;
  position: { lat: number; lng: number }; geohash: string;
  typeId: 'concert' | 'festival' | 'market' | 'other';
  categoryId: ExternalEvent['editorial']['categoryId'];
  timePrecision: 'date' | 'datetime'; timezone: string;
  startDay?: string; endDay?: string;
  windowStartAt: Timestamp; windowEndAt: Timestamp; updatedAt: Timestamp;
};

function publicType(editorialType: string | null): PublicExternalProjection['typeId'] {
  if (editorialType === 'Concert') return 'concert';
  if (editorialType === 'Festival') return 'festival';
  if (editorialType === 'Marché') return 'market';
  return 'other';
}

/** Pure allowlist. A future transaction will write this only after approval and identity checks. */
export function buildDatatourismeDiscoveryProjection(source: unknown, now: Date):
  { id: string; data: PublicExternalProjection } | null {
  if (!isExternalEvent(source) || source.publication.state !== 'approved' ||
      source.completeness !== 'complete' || source.sync.state !== 'complete' ||
      !source.sync.lastSuccessfulAt || source.periods.length !== 1 ||
      !source.expiresAt || !(now instanceof Date) || !Number.isFinite(now.getTime()) ||
      Date.parse(source.expiresAt) <= now.getTime() ||
      !isEventName(source.editorial.title) || source.editorial.description.length > 1000 ||
      source.editorial.editorialType !== null && source.editorial.editorialType.length > 100 ||
      source.attribution.producer.length > 200 ||
      source.attribution.publisher !== null && source.attribution.publisher.length > 200 ||
      source.location.city.length > 120) return null;
  const period = source.periods[0];
  if (period.timePrecision === 'date' && !period.endDay ||
      period.timePrecision === 'datetime' && !period.endAt) return null;
  let windowStartAt: Timestamp;
  let windowEndAt: Timestamp;
  if (period.timePrecision === 'date') {
    const first = calendarDaySegments(period.startDay, source.timezone);
    const last = calendarDaySegments(period.endDay!, source.timezone);
    if (!first.length || !last.length) return null;
    windowStartAt = Timestamp.fromMillis(first[0].start);
    const endExclusive = last[last.length - 1].endExclusive;
    windowEndAt = new Timestamp(Timestamp.fromMillis(endExclusive - 1).seconds, 999999000);
  } else {
    windowStartAt = Timestamp.fromDate(new Date(period.startAt));
    windowEndAt = Timestamp.fromDate(new Date(period.endAt!));
  }
  const id = `datatourisme_${source.id}`;
  const data: PublicExternalProjection = {
    contentType: 'event', origin: 'datatourisme', sourceId: source.id,
    title: source.editorial.title, description: source.editorial.description,
    editorialType: source.editorial.editorialType,
    city: source.location.city, department: source.location.department,
    positionPrecision: 'source_coordinates', attribution: { ...source.attribution },
    sourceUrl: isSafeExternalSourceUrl(source.sourceUrl) ? source.sourceUrl : null,
    position: { ...source.location.position }, geohash: discoveryGeohash(source.location.position),
    typeId: publicType(source.editorial.editorialType), categoryId: source.editorial.categoryId,
    timePrecision: period.timePrecision, timezone: source.timezone,
    windowStartAt, windowEndAt, updatedAt: Timestamp.fromDate(new Date(source.sync.lastSuccessfulAt)),
  };
  if (period.timePrecision === 'date') {
    data.startDay = period.startDay;
    data.endDay = period.endDay!;
  }
  // The same allowlist also validates the payload that search and detail may disclose.
  externalProjectionResultDto(id, data as unknown as Record<string, unknown>);
  return { id, data };
}
