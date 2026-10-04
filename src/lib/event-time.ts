// The pure contract lives inside the Functions build root so both runtimes use identical rules.
export {
  isCalendarDay, isCalendarRange, isIanaTimezone, getEventTimeState,
  calendarDayInTimezone, getEventCalendarRange, isEventNow,
  matchesEventPeriod, getEventTiming, getEventMonitorTiming, formatEventDateRange,
} from '../../functions/src/event-time'
export type { EventTime, CalendarEventTime, ExactEventTime, EventPeriod } from '../../functions/src/event-time'
