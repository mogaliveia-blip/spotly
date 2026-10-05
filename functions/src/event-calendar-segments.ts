import { isCalendarDay, isIanaTimezone } from './event-time';

export type UtcSegment = { start: number; endExclusive: number };

/** Actual UTC portions of one civil day. A skipped date has no portions. */
export function calendarDaySegments(day: string, timezone: string): UtcSegment[] {
  if (!isCalendarDay(day) || !isIanaTimezone(timezone)) return [];
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
  const dayBounds = (day: string): UtcSegment[] => {
    const civilStart = new Date(`${day}T00:00:00Z`).getTime();
    const civilEnd = civilStart + dayLength;
    // This margin encloses every IANA offset, including historical date-line changes.
    let segmentStart = civilStart - 2 * dayLength;
    const limit = civilEnd + 2 * dayLength;
    let offset = offsetAt(segmentStart);
    const segments: UtcSegment[] = [];
    const includeSegment = (segmentEnd: number) => {
      // Civil time advances linearly within a constant-offset segment. Intersect it
      // with the requested day, preserving gaps belonging to another civil day.
      const start = Math.max(segmentStart, civilStart - offset);
      const end = Math.min(segmentEnd, civilEnd - offset);
      if (start < end) {
        const previous = segments[segments.length - 1];
        if (previous && previous.endExclusive === start) previous.endExclusive = end;
        else segments.push({ start, endExclusive: end });
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
    return segments;
  };
  return dayBounds(day);
}
