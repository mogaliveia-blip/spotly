import { httpsCallable } from 'firebase/functions'
import { functions } from './firebase'
import type { CalendarEventTime } from './event-time'

export async function updateEventCalendarTime(eventId: string, time: CalendarEventTime): Promise<CalendarEventTime> {
  const update = httpsCallable<CalendarEventTime & { eventId: string }, CalendarEventTime>(
    functions, 'updateEventCalendarTime'
  )
  return (await update({ eventId, ...time })).data
}
