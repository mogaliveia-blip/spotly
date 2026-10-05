import { FieldValue, Firestore, Timestamp } from 'firebase-admin/firestore';
import { syncEventDiscoveryProjection } from './event-discovery-projection';
import { HttpsError } from 'firebase-functions/v2/https';
import {
  discoveryCategories, discoveryTags, eventDiscoveryTypes,
  EventDiscoverySettingsPatch, isCatalogId, isDiscoveryPosition,
} from './event-discovery';

function validatePayload(value: unknown): { eventId: string; settings: EventDiscoverySettingsPatch } {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new HttpsError('invalid-argument', 'INVALID_PAYLOAD');
  }
  const input = value as Record<string, unknown>;
  const fields = ['discoveryPosition', 'typeId', 'categoryId', 'tags'];
  if (Object.keys(input).some((key) => key !== 'eventId' && !fields.includes(key)) ||
      !fields.some((key) => Object.prototype.hasOwnProperty.call(input, key))) {
    throw new HttpsError('invalid-argument', 'INVALID_PAYLOAD');
  }
  if (typeof input.eventId !== 'string' || !input.eventId.trim() || input.eventId.includes('/') ||
      input.eventId === '.' || input.eventId === '..' || input.eventId.length > 1500) {
    throw new HttpsError('invalid-argument', 'EVENT_ID_REQUIRED');
  }
  const settings: EventDiscoverySettingsPatch = {};
  for (const key of fields) {
    if (!Object.prototype.hasOwnProperty.call(input, key)) continue;
    const field = input[key];
    if (field === null) {
      Object.assign(settings, { [key]: null });
    } else if (key === 'discoveryPosition' && isDiscoveryPosition(field)) {
      settings.discoveryPosition = { lat: field.lat, lng: field.lng };
    } else if (key === 'typeId' && isCatalogId(eventDiscoveryTypes, field)) {
      settings.typeId = field;
    } else if (key === 'categoryId' && isCatalogId(discoveryCategories, field)) {
      settings.categoryId = field;
    } else if (key === 'tags' && Array.isArray(field) &&
               field.every((tag) => isCatalogId(discoveryTags, tag))) {
      // Canonical catalog order: tag ordering has no business meaning.
      settings.tags = discoveryTags.filter((tag) => field.includes(tag.id)).map((tag) => tag.id);
    } else {
      throw new HttpsError('invalid-argument', `INVALID_${key.toUpperCase()}`);
    }
  }
  return { eventId: input.eventId, settings };
}

/** A bounded patch never replaces the Event or writes any of its subcollections. */
export async function updateEventDiscoverySettingsTransaction(
  firestore: Firestore, uid: string, rawPayload: unknown
): Promise<EventDiscoverySettingsPatch> {
  if (!uid) throw new HttpsError('unauthenticated', 'AUTH_REQUIRED');
  const { eventId, settings } = validatePayload(rawPayload);
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
    const nextEvent = { ...event.data(), updatedAt };
    const update: Record<string, unknown> = { updatedAt };
    for (const [key, value] of Object.entries(settings)) {
      update[key] = value === null ? FieldValue.delete() : value;
      if (value === null) delete (nextEvent as Record<string, unknown>)[key];
      else (nextEvent as Record<string, unknown>)[key] = value;
    }
    transaction.update(eventRef, update);
    syncEventDiscoveryProjection(transaction, firestore, eventId, nextEvent);
    return settings;
  });
}
