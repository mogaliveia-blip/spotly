import { calendarDayInTimezone } from './event-time';
import { calendarDaySegments } from './event-calendar-segments';
import type { UtcSegment } from './event-calendar-segments';
import { compareInstants, instantFromMillis } from './discovery-search-contract';
import type { DiscoveryResultDto, DiscoveryWhen, TimestampDto } from './discovery-search-contract';

const DAY = 86_400_000;
const MIN = -62135596800000;
const MAX = 253402300800000;
export type CandidateWindow = { start: TimestampDto; end: TimestampDto };

function shiftDay(day: string, days: number): string {
  return new Date(Date.parse(`${day}T00:00:00Z`) + days * DAY).toISOString().slice(0, 10);
}
/** Conservative index envelope across IANA zones; never a business calendar conversion. */
export function discoveryCandidateWindow(when: DiscoveryWhen, now: TimestampDto): CandidateWindow {
  if (when.kind === 'now') return { start: { ...now }, end: { ...now } };
  const anchor = when.kind === 'date' ? Date.parse(`${when.day}T00:00:00Z`) : now.seconds * 1000;
  // Two-day offset margin matches the historical calendar primitive. Tomorrow adds
  // one civil day beyond today; a weekend can fall up to seven days after the reference instant.
  const start = when.kind === 'date' ? anchor - 2 * DAY : anchor - 3 * DAY;
  const end = when.kind === 'date' ? anchor + 3 * DAY : anchor + (when.kind === 'weekend' ? 10 : when.kind === 'tomorrow' ? 4 : 3) * DAY;
  return {
    start: instantFromMillis(Math.max(MIN, start)),
    end: end >= MAX ? { seconds: 253402300799, nanoseconds: 999999999 } : instantFromMillis(end),
  };
}

/** Exact civil-day membership, including disconnected historical UTC portions. */
export function matchesDiscoveryWhen(
  projection: DiscoveryResultDto, when: DiscoveryWhen, now: TimestampDto,
  segmentsFor: (day: string, timezone: string) => UtcSegment[] = calendarDaySegments,
): boolean {
  const start = projection.windowStartAt;
  const end = projection.windowEndAt;
  if (when.kind === 'now') return projection.timePrecision === 'datetime' &&
    compareInstants(start, now) <= 0 && compareInstants(now, end) <= 0;
  const today = calendarDayInTimezone(new Date(now.seconds * 1000 + Math.floor(now.nanoseconds / 1_000_000)), projection.timezone);
  const weekday = new Date(`${today}T00:00:00Z`).getUTCDay();
  let days = [when.kind === 'date' ? when.day : when.kind === 'tomorrow' ? shiftDay(today, 1) : today];
  const remainingSunday = when.kind === 'weekend' && weekday === 0;
  if (when.kind === 'weekend' && !remainingSunday) {
    const saturday = shiftDay(today, weekday === 6 ? 0 : 6 - weekday);
    days = [saturday, shiftDay(saturday, 1)];
  }
  if (projection.timePrecision === 'date') {
    return days.some((day) => projection.startDay <= day && day <= projection.endDay);
  }
  // A chosen date equal to today and a weekend in progress must obey Today's exact-hour rule.
  const includesToday = days.includes(today);
  if (includesToday && compareInstants(end, now) < 0) return false;
  return days.some((day) => segmentsFor(day, projection.timezone).some((segment) => {
    const lower = day === today && compareInstants(now, instantFromMillis(segment.start)) > 0 ? now : instantFromMillis(segment.start);
    return compareInstants(start, instantFromMillis(segment.endExclusive)) < 0 && compareInstants(end, lower) >= 0;
  }));
}
