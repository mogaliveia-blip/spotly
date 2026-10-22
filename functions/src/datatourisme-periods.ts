import { calendarDayInTimezone, isCalendarDay, isIanaTimezone } from './event-time';
import { calendarDaySegments } from './event-calendar-segments';

export type ExternalPeriodTiming = 'upcoming' | 'active' | 'between' | 'expired' | 'indeterminate';
export type ExternalPeriodsAssessment = {
  timing: ExternalPeriodTiming;
  validCount: number;
  invalidCount: number;
  openEndedCount: number;
  /** Only complete, coherent periods with known ends can authorize future cleanup. */
  definitivelyExpired: boolean;
  /** A calendar-day match never establishes the exact-hour Discovery “Now” condition. */
  activePrecision: 'date' | 'datetime' | null;
};

type ParsedPeriod = { precision: 'date' | 'datetime'; start: string | number; end: string | number | null };
export type NormalizedExternalPeriod =
  | { timePrecision: 'date'; startDay: string; endDay: string | null }
  | { timePrecision: 'datetime'; startAt: string; endAt: string | null };

function exactInstant(value: string): number | null {
  const match = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,3})?(Z|[+-]\d{2}:\d{2})$/.exec(value);
  if (!match || !isCalendarDay(match[1]) || Number(match[2]) > 23 || Number(match[3]) > 59 || Number(match[4]) > 59) return null;
  const offset = match[5];
  if (offset !== 'Z' && (Number(offset.slice(1, 3)) > 23 || Number(offset.slice(4, 6)) > 59)) return null;
  const instant = Date.parse(value);
  return Number.isFinite(instant) ? instant : null;
}

function parsePeriod(value: unknown, timezone: string): ParsedPeriod | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const { startDate, endDate } = value as Record<string, unknown>;
  if (typeof startDate !== 'string') return null;
  const hasEnd = endDate !== undefined && endDate !== null && endDate !== '';
  if (hasEnd && typeof endDate !== 'string') return null;
  if (isCalendarDay(startDate)) {
    if (hasEnd && !isCalendarDay(endDate)) return null;
    const end = hasEnd ? endDate as string : null;
    if (end !== null && end < startDate) return null;
    // A skipped civil day cannot be turned into a valid event instant.
    if (!calendarDaySegments(startDate, timezone).length ||
        (end !== null && !calendarDaySegments(end, timezone).length)) return null;
    return { precision: 'date', start: startDate, end };
  }
  const start = exactInstant(startDate);
  const end = hasEnd ? exactInstant(endDate as string) : null;
  if (start === null || (hasEnd && end === null) || (end !== null && end < start)) return null;
  return { precision: 'datetime', start, end };
}

/** Retain every validated source period; a malformed entry makes the set incomplete. */
export function normalizeDatatourismePeriods(periods: unknown, timezone: string): NormalizedExternalPeriod[] | null {
  if (!Array.isArray(periods) || !periods.length || !isIanaTimezone(timezone)) return null;
  const normalized: NormalizedExternalPeriod[] = [];
  for (const raw of periods) {
    const period = parsePeriod(raw, timezone);
    if (!period) return null;
    normalized.push(period.precision === 'date'
      ? { timePrecision: 'date', startDay: period.start as string, endDay: period.end as string | null }
      : { timePrecision: 'datetime', startAt: new Date(period.start as number).toISOString(),
        endAt: period.end === null ? null : new Date(period.end as number).toISOString() });
  }
  return normalized;
}

/** First instant after every known period; null if any end is unresolved. */
export function definitiveExpirationAt(periods: readonly NormalizedExternalPeriod[], timezone: string): string | null {
  if (!periods.length || !isIanaTimezone(timezone)) return null;
  let latest = -Infinity;
  for (const period of periods) {
    if (period.timePrecision === 'date') {
      if (!period.endDay) return null;
      if (!parsePeriod({ startDate: period.startDay, endDate: period.endDay }, timezone)) return null;
      const segments = calendarDaySegments(period.endDay, timezone);
      if (!segments.length) return null;
      latest = Math.max(latest, segments[segments.length - 1].endExclusive);
    } else if (period.timePrecision === 'datetime') {
      if (!period.endAt) return null;
      if (!parsePeriod({ startDate: period.startAt, endDate: period.endAt }, timezone)) return null;
      const end = exactInstant(period.endAt);
      if (end === null) return null;
      latest = Math.max(latest, end + 1); // Exact source precision is milliseconds.
    } else return null;
  }
  return Number.isFinite(latest) && latest <= 8_640_000_000_000_000 ? new Date(latest).toISOString() : null;
}

/** Evaluate all DATAtourisme takesPlaceAt entries, without collapsing disjoint sessions. */
export function assessDatatourismePeriods(periods: unknown, timezone: string, now: Date): ExternalPeriodsAssessment {
  const result: ExternalPeriodsAssessment = {
    timing: 'indeterminate', validCount: 0, invalidCount: 0, openEndedCount: 0,
    definitivelyExpired: false, activePrecision: null,
  };
  if (!Array.isArray(periods) || !isIanaTimezone(timezone) || !(now instanceof Date) || !Number.isFinite(now.getTime())) return result;
  const today = calendarDayInTimezone(now, timezone);
  let past = 0;
  let future = 0;
  let active = 0;
  let unknown = 0;
  for (const raw of periods) {
    const period = parsePeriod(raw, timezone);
    if (!period) { result.invalidCount++; continue; }
    result.validCount++;
    if (period.end === null) result.openEndedCount++;
    const reference = period.precision === 'date' ? today : now.getTime();
    if (reference < period.start) future++;
    else if (period.end === null) unknown++;
    else if (reference <= period.end) {
      active++;
      result.activePrecision = period.precision === 'datetime' ? 'datetime' : result.activePrecision ?? 'date';
    } else past++;
  }
  if (active) result.timing = 'active';
  else if (unknown) result.timing = 'indeterminate';
  else if (future && past) result.timing = 'between';
  else if (future) result.timing = 'upcoming';
  else if (past && !result.invalidCount) result.timing = 'expired';
  result.definitivelyExpired = result.timing === 'expired' && result.validCount > 0 &&
    result.invalidCount === 0 && result.openEndedCount === 0;
  return result;
}
