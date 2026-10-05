import { FieldValue, Firestore, Timestamp } from 'firebase-admin/firestore';
import { HttpsError } from 'firebase-functions/v2/https';
import { syncEventDiscoveryProjection } from './event-discovery-projection';
import { isEventName } from './event-public-identity';

export type EventPublicDetailsPatch = {
  name?: string;
  status?: 'draft' | 'published' | 'paused';
  visibility?: 'private' | 'public';
  eventCoverUrl?: string | null;
};

function payload(value: unknown, fields: string[]): Record<string, unknown> & { eventId: string } {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new HttpsError('invalid-argument', 'INVALID_PAYLOAD');
  }
  const input = value as Record<string, unknown>;
  if (Object.keys(input).some((key) => key !== 'eventId' && !fields.includes(key)) ||
      !fields.some((key) => Object.prototype.hasOwnProperty.call(input, key))) {
    throw new HttpsError('invalid-argument', 'INVALID_PAYLOAD');
  }
  if (typeof input.eventId !== 'string' || !input.eventId.trim() || input.eventId.includes('/') ||
      input.eventId === '.' || input.eventId === '..' || input.eventId.length > 1500) {
    throw new HttpsError('invalid-argument', 'EVENT_ID_REQUIRED');
  }
  return input as Record<string, unknown> & { eventId: string };
}

async function applyPatch(
  firestore: Firestore, uid: string, eventId: string, patch: Record<string, unknown>, ownerOnly = false
): Promise<void> {
  const eventRef = firestore.doc(`events/${eventId}`);
  await firestore.runTransaction(async (transaction) => {
    const [event, user, member] = await Promise.all([
      transaction.get(eventRef), transaction.get(firestore.doc(`users/${uid}`)),
      transaction.get(firestore.doc(`events/${eventId}/members/${uid}`)),
    ]);
    if (!event.exists) throw new HttpsError('not-found', 'EVENT_NOT_FOUND');
    const owner = user.data()?.role === 'owner';
    if (!owner && (ownerOnly || (member.data()?.role !== 'admin' && event.data()?.adminId !== uid))) {
      throw new HttpsError('permission-denied', ownerOnly ? 'PLATFORM_OWNER_REQUIRED' : 'EVENT_ADMIN_REQUIRED');
    }
    const updatedAt = Timestamp.now();
    const nextEvent: Record<string, unknown> = { ...event.data(), updatedAt };
    const update: Record<string, unknown> = { updatedAt };
    for (const [key, value] of Object.entries(patch)) {
      update[key] = value === null ? FieldValue.delete() : value;
      if (value === null) delete nextEvent[key];
      else nextEvent[key] = value;
    }
    transaction.update(eventRef, update);
    syncEventDiscoveryProjection(transaction, firestore, eventId, nextEvent);
  });
}

/** Publication is still allowed without Discovery data; only the projection has eligibility rules. */
export async function updateEventPublicDetailsTransaction(
  firestore: Firestore, uid: string, rawPayload: unknown
): Promise<EventPublicDetailsPatch> {
  if (!uid) throw new HttpsError('unauthenticated', 'AUTH_REQUIRED');
  const { eventId, ...patch } = payload(rawPayload, ['name', 'status', 'visibility', 'eventCoverUrl']);
  if ('name' in patch) {
    if (!isEventName(patch.name)) throw new HttpsError('invalid-argument', 'INVALID_NAME');
    patch.name = patch.name.trim();
  }
  if ('status' in patch && !['draft', 'published', 'paused'].includes(patch.status as string)) {
    throw new HttpsError('invalid-argument', 'INVALID_STATUS');
  }
  if ('visibility' in patch && !['private', 'public'].includes(patch.visibility as string)) {
    throw new HttpsError('invalid-argument', 'INVALID_VISIBILITY');
  }
  if ('eventCoverUrl' in patch && patch.eventCoverUrl !== null &&
      (typeof patch.eventCoverUrl !== 'string' || patch.eventCoverUrl.length > 2048)) {
    throw new HttpsError('invalid-argument', 'INVALID_COVER');
  }
  await applyPatch(firestore, uid, eventId, patch);
  return patch as EventPublicDetailsPatch;
}

/** Replaces the existing owner-only commercial summary; no pricing/payment logic is introduced. */
export async function updateEventCommercialTransaction(
  firestore: Firestore, uid: string, rawPayload: unknown
): Promise<void> {
  if (!uid) throw new HttpsError('unauthenticated', 'AUTH_REQUIRED');
  const { eventId, commercial } = payload(rawPayload, ['commercial']);
  if (commercial === null) {
    await applyPatch(firestore, uid, eventId, { commercial: null }, true);
    return;
  }
  if (!commercial || typeof commercial !== 'object' || Array.isArray(commercial)) {
    throw new HttpsError('invalid-argument', 'INVALID_COMMERCIAL');
  }
  const input = commercial as Record<string, unknown>;
  const dates = ['grantedAt', 'purchasedAt', 'coveredFrom', 'coveredEndDate',
    'eventStartDateAtPurchase', 'eventEndDateAtPurchase'];
  if (Object.keys(input).some((key) => !['offerCode', 'offerVersion', 'state', ...dates].includes(key)) ||
      !['free_draft', 'private', 'public'].includes(input.offerCode as string) ||
      !['active', 'revoked'].includes(input.state as string) ||
      !Number.isInteger(input.offerVersion) || (input.offerVersion as number) < 1 || !('grantedAt' in input)) {
    throw new HttpsError('invalid-argument', 'INVALID_COMMERCIAL');
  }
  const summary = { ...input };
  for (const key of dates) {
    if (!(key in input)) continue;
    const value = input[key];
    // Callable transport uses explicit ISO instants, not local calendar dates or numeric coercion.
    const match = typeof value === 'string' ?
      /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})(?:\.(\d{1,3}))?Z$/.exec(value) : null;
    const instant = match ? new Date(value as string) : null;
    // Compare the requested civil components after parsing: Date otherwise normalizes
    // impossible days (or 24:00) silently. Fractional zero-padding preserves valid ISO forms.
    if (!match || !instant || !Number.isFinite(instant.getTime()) || instant.getUTCFullYear() < 1 ||
        instant.toISOString() !== `${match[1]}.${(match[2] ?? '').padEnd(3, '0')}Z`) {
      throw new HttpsError('invalid-argument', 'INVALID_COMMERCIAL_DATE');
    }
    summary[key] = Timestamp.fromDate(instant);
  }
  await applyPatch(firestore, uid, eventId, { commercial: summary }, true);
}
