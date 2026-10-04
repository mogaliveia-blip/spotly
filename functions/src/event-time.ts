/** Pure temporal contract, shared with the browser without Firebase dependencies. */
export type CalendarEventTime = {
  timePrecision: 'date';
  startDay: string;
  endDay: string;
  timezone: string;
  startDate?: never;
  endDate?: never;
};

export type ExactEventTime = {
  timePrecision: 'datetime';
  startDate: Date;
  endDate: Date;
  timezone: string;
  startDay?: never;
  endDay?: never;
};

/** Missing precision is historical data, never evidence of exact hours. */
export type LegacyEventTime = {
  timePrecision?: undefined;
  startDate?: Date;
  endDate?: Date;
  timezone?: string;
  startDay?: never;
  endDay?: never;
};

export type EventTime = CalendarEventTime | ExactEventTime | LegacyEventTime;

type TimeFields = {
  timePrecision?: unknown;
  startDay?: unknown;
  endDay?: unknown;
  startDate?: unknown;
  endDate?: unknown;
  timezone?: unknown;
};

export function isCalendarDay(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  if (year < 1 || month < 1 || month > 12 || day < 1) return false;
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return day <= days[month - 1];
}

export function isIanaTimezone(value: unknown): value is string {
  // Exclude numeric offsets even on runtimes that accept them as timeZone options.
  if (typeof value !== 'string' || value.length > 100 || !/^[A-Za-z][A-Za-z0-9_+\-/]*$/.test(value)) return false;
  try {
    new Intl.DateTimeFormat('en', { timeZone: value }).format(0);
    return true;
  } catch {
    return false;
  }
}

export function isCalendarRange(start: unknown, end: unknown): boolean {
  return isCalendarDay(start) && isCalendarDay(end) && start <= end;
}

function isInstant(value: unknown): value is Date {
  return value instanceof Date && Number.isFinite(value.getTime());
}

export function getEventTimeState(event: TimeFields): 'date' | 'datetime' | 'legacy' | 'invalid' {
  if (event.timePrecision === undefined) return 'legacy';
  if (!isIanaTimezone(event.timezone)) return 'invalid';
  if (event.timePrecision === 'date') {
    return isCalendarRange(event.startDay, event.endDay) &&
      event.startDate === undefined && event.endDate === undefined ? 'date' : 'invalid';
  }
  if (event.timePrecision === 'datetime') {
    return isInstant(event.startDate) && isInstant(event.endDate) &&
      event.startDate <= event.endDate &&
      event.startDay === undefined && event.endDay === undefined ? 'datetime' : 'invalid';
  }
  return 'invalid';
}

export function calendarDayInTimezone(instant: Date, timezone: string): string {
  const parts = new Intl.DateTimeFormat('en', {
    timeZone: timezone, calendar: 'gregory', numberingSystem: 'latn',
    year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(instant);
  const part = (type: string) => parts.find((entry) => entry.type === type)!.value;
  return `${part('year').padStart(4, '0')}-${part('month')}-${part('day')}`;
}

export function getEventCalendarRange(event: TimeFields): { startDay: string; endDay: string } | null {
  const state = getEventTimeState(event);
  if (state === 'date') return { startDay: event.startDay as string, endDay: event.endDay as string };
  if (state === 'datetime') {
    return {
      startDay: calendarDayInTimezone(event.startDate as Date, event.timezone as string),
      endDay: calendarDayInTimezone(event.endDate as Date, event.timezone as string),
    };
  }
  return null;
}

export function isEventNow(event: TimeFields, now: Date): boolean {
  return getEventTimeState(event) === 'datetime' && isInstant(now) &&
    (event.startDate as Date) <= now && now <= (event.endDate as Date);
}

/** Calendar arithmetic uses UTC only as a computation tool, never stored as Event instants. */
function weekendDays(today: string): { startDay: string; endDay: string } {
  const date = new Date(`${today}T00:00:00Z`);
  const weekday = date.getUTCDay();
  const offset = weekday === 0 ? -1 : 6 - weekday;
  date.setUTCDate(date.getUTCDate() + offset);
  const startDay = date.toISOString().slice(0, 10);
  date.setUTCDate(date.getUTCDate() + 1);
  return { startDay, endDay: date.toISOString().slice(0, 10) };
}

export type EventPeriod = { kind: 'now' | 'today' | 'weekend' } | { kind: 'date'; day: string };

export function matchesEventPeriod(event: TimeFields, period: EventPeriod, now: Date): boolean {
  if (period.kind === 'now') return isEventNow(event, now);
  const range = getEventCalendarRange(event);
  if (!range || !isInstant(now)) return false;
  const today = calendarDayInTimezone(now, event.timezone as string);
  const window = period.kind === 'weekend' ? weekendDays(today) : {
    startDay: period.kind === 'date' ? period.day : today,
    endDay: period.kind === 'date' ? period.day : today,
  };
  return isCalendarRange(window.startDay, window.endDay) &&
    range.startDay <= window.endDay && range.endDay >= window.startDay;
}

export function getEventTiming(event: TimeFields, now: Date): 'ongoing' | 'upcoming' | 'past' | 'unknown' {
  const range = getEventCalendarRange(event);
  if (!range || !isInstant(now)) return 'unknown';
  const today = calendarDayInTimezone(now, event.timezone as string);
  if (range.endDay < today) return 'past';
  if (range.startDay > today) return 'upcoming';
  return 'ongoing';
}

/** Monitor intervals use exact hours when known; portal "Today" grouping remains calendar-based. */
export function getEventMonitorTiming(event: TimeFields, now: Date): 'ongoing' | 'upcoming' | 'ended' | 'unknown' {
  if (!isInstant(now)) return 'unknown';
  if (getEventTimeState(event) === 'datetime') {
    if (now < (event.startDate as Date)) return 'upcoming';
    if ((event.endDate as Date) < now) return 'ended';
    return 'ongoing';
  }
  const timing = getEventTiming(event, now);
  return timing === 'past' ? 'ended' : timing;
}

export function formatEventDateRange(event: TimeFields): string {
  const state = getEventTimeState(event);
  if (state === 'legacy' || state === 'invalid') return 'Dates à vérifier';
  if (state === 'date') {
    const display = (day: string) => day.split('-').reverse().join('/');
    const start = display(event.startDay as string);
    return event.startDay === event.endDay ? start : `${start} – ${display(event.endDay as string)}`;
  }
  const formatter = new Intl.DateTimeFormat('fr-FR', {
    timeZone: event.timezone as string, dateStyle: 'short', timeStyle: 'short',
  });
  return `${formatter.format(event.startDate as Date)} – ${formatter.format(event.endDate as Date)} (${event.timezone})`;
}
