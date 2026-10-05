import { FieldValue, Firestore, Timestamp } from 'firebase-admin/firestore';
import { syncEventDiscoveryProjection } from './event-discovery-projection';
import { HttpsError } from 'firebase-functions/v2/https';
import { CalendarEventTime, isCalendarRange, isIanaTimezone } from './event-time';

export type UpdateEventCalendarTimePayload = CalendarEventTime & { eventId: string };

function validatePayload(value: unknown): UpdateEventCalendarTimePayload {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new HttpsError('invalid-argument', 'INVALID_PAYLOAD');
  }
  const input = value as Record<string, unknown>;
  const keys = ['eventId', 'timePrecision', 'startDay', 'endDay', 'timezone'];
  if (Object.keys(input).some((key) => !keys.includes(key)) || input.timePrecision !== 'date') {
    throw new HttpsError('invalid-argument', 'INVALID_PAYLOAD');
  }
  if (typeof input.eventId !== 'string' || !input.eventId.trim() || input.eventId.includes('/') ||
    input.eventId === '.' || input.eventId === '..' || input.eventId.length > 1500) {
    throw new HttpsError('invalid-argument', 'EVENT_ID_REQUIRED');
  }
  if (!isCalendarRange(input.startDay, input.endDay)) {
    throw new HttpsError('invalid-argument', 'INVALID_DATES');
  }
  if (!isIanaTimezone(input.timezone)) {
    throw new HttpsError('invalid-argument', 'INVALID_TIMEZONE');
  }
  return input as UpdateEventCalendarTimePayload;
}

/** Only temporal fields use this mutation; other Event administration stays in its existing flow. */
export async function updateEventCalendarTimeTransaction(
  firestore: Firestore,
  uid: string,
  rawPayload: unknown
): Promise<CalendarEventTime> {
  if (!uid) throw new HttpsError('unauthenticated', 'AUTH_REQUIRED');
  const { eventId, ...time } = validatePayload(rawPayload);
  const eventRef = firestore.doc(`events/${eventId}`);
  return firestore.runTransaction(async (transaction) => {
    const [event, user, member] = await Promise.all([
      transaction.get(eventRef),
      transaction.get(firestore.doc(`users/${uid}`)),
      transaction.get(firestore.doc(`events/${eventId}/members/${uid}`)),
    ]);
    if (!event.exists) throw new HttpsError('not-found', 'EVENT_NOT_FOUND');
    if (user.data()?.role !== 'owner' && member.data()?.role !== 'admin' && event.data()?.adminId !== uid) {
      throw new HttpsError('permission-denied', 'EVENT_ADMIN_REQUIRED');
    }
    const updatedAt = Timestamp.now();
    const nextEvent: Record<string, unknown> = { ...event.data(), ...time, updatedAt };
    delete nextEvent.startDate;
    delete nextEvent.endDate;
    transaction.update(eventRef, {
      ...time,
      // Explicit manual correction replaces the old temporal fields, not the Event content.
      startDate: FieldValue.delete(),
      endDate: FieldValue.delete(),
      updatedAt,
    });
    syncEventDiscoveryProjection(transaction, firestore, eventId, nextEvent);
    return time;
  });
}
