import { initializeApp } from 'firebase-admin/app';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import {
  onDocumentCreated,
  onDocumentDeleted,
  onDocumentUpdated
} from 'firebase-functions/v2/firestore';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { createHash, randomBytes, timingSafeEqual } from 'crypto';

const app = initializeApp();

const db = getFirestore();
const storageBucket = getStorage(app).bucket();
const region = 'europe-west1';
const reviewDocument = 'events/{eventId}/pois/{poiId}/reviews/{reviewId}';
const privateAccessTokenBytes = 32;
const privateAccessGrantDurationMs = 30 * 24 * 60 * 60 * 1000;
const PRIVATE_ACCESS_CORS = [
  'http://localhost:9002',
  'https://uninstantici.com'
];
const privateAccessCallableOptions = {
  region,
  cors: PRIVATE_ACCESS_CORS
};

type ReviewDocumentData = {
  rating?: unknown;
};

type ReviewParams = {
  eventId: string;
  poiId: string;
};

type EventDocumentData = {
  adminId?: unknown;
  slug?: unknown;
  status?: unknown;
  visibility?: unknown;
  privateAccessTokenHash?: unknown;
  privateAccessVersion?: unknown;
  deletionRequestedBy?: unknown;
};

type PrivateLinkDocumentData = {
  tokenHash?: unknown;
  createdAt?: unknown;
  expiresAt?: unknown;
  revokedAt?: unknown;
  createdBy?: unknown;
  revokedBy?: unknown;
  title?: unknown;
  description?: unknown;
};

type EventDeletePermission = {
  eventExists: boolean;
};

function hashPrivateAccessToken(eventId: string, token: string): string {
  return createHash('sha256')
    .update(`${eventId}:${token}`, 'utf8')
    .digest('hex');
}

function timingSafeHexEqual(a: string, b: string): boolean {
  if (!/^[a-f0-9]{64}$/i.test(a) || !/^[a-f0-9]{64}$/i.test(b)) {
    return false;
  }

  const aBuffer = Buffer.from(a, 'hex');
  const bBuffer = Buffer.from(b, 'hex');

  return aBuffer.length === bBuffer.length && timingSafeEqual(aBuffer, bBuffer);
}

function normalizeSlug(value: unknown): string {
  return typeof value === 'string' ? value.toLowerCase().trim() : '';
}

function normalizeToken(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeOptionalText(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim();
  return normalized || null;
}

function normalizeEventId(value: unknown): string {
  if (typeof value !== 'string') return '';

  const eventId = value.trim();
  if (!eventId || eventId.length > 128 || eventId.includes('/')) {
    return '';
  }

  return eventId;
}

function toDate(value: unknown): Date | null {
  if (value instanceof Date) return value;
  if (value && typeof value === 'object' && 'toDate' in value && typeof value.toDate === 'function') {
    return value.toDate();
  }
  return null;
}

function isActivePrivateLink(data: PrivateLinkDocumentData, now = new Date()): boolean {
  const expiresAt = toDate(data.expiresAt);
  return !!expiresAt && expiresAt > now && !data.revokedAt;
}

async function assertEventAdmin(eventId: string, uid: string): Promise<EventDocumentData> {
  const [eventSnap, userSnap, memberSnap] = await Promise.all([
    db.doc(`events/${eventId}`).get(),
    db.doc(`users/${uid}`).get(),
    db.doc(`events/${eventId}/members/${uid}`).get()
  ]);

  if (!eventSnap.exists) {
    throw new HttpsError('not-found', 'EVENT_NOT_FOUND');
  }

  const eventData = eventSnap.data() as EventDocumentData;
  const isOwner = userSnap.data()?.role === 'owner';
  const isAdmin =
    eventData.adminId === uid ||
    memberSnap.data()?.role === 'admin' ||
    isOwner;

  if (!isAdmin) {
    throw new HttpsError('permission-denied', 'EVENT_ADMIN_REQUIRED');
  }

  return eventData;
}

async function assertEventDeletePermission(eventId: string, uid: string): Promise<EventDeletePermission> {
  const [eventSnap, userSnap, memberSnap] = await Promise.all([
    db.doc(`events/${eventId}`).get(),
    db.doc(`users/${uid}`).get(),
    db.doc(`events/${eventId}/members/${uid}`).get()
  ]);

  const isOwner = userSnap.data()?.role === 'owner';

  if (!eventSnap.exists) {
    if (isOwner) {
      return { eventExists: false };
    }

    throw new HttpsError('not-found', 'EVENT_NOT_FOUND');
  }

  const eventData = eventSnap.data() as EventDocumentData;
  const deletionRequestedBy = typeof eventData.deletionRequestedBy === 'string'
    ? eventData.deletionRequestedBy
    : '';
  const isAdmin =
    eventData.adminId === uid ||
    memberSnap.data()?.role === 'admin' ||
    isOwner;

  if (!isAdmin && deletionRequestedBy !== uid) {
    throw new HttpsError('permission-denied', 'EVENT_ADMIN_REQUIRED');
  }

  return { eventExists: true };
}

async function markEventDeletionStarted(eventId: string, uid: string): Promise<void> {
  await db.doc(`events/${eventId}`).set({
    deletionRequestedBy: uid,
    deletionRequestedAt: FieldValue.serverTimestamp()
  }, { merge: true });
}

async function deleteEventChildCollections(eventId: string): Promise<number> {
  const eventRef = db.doc(`events/${eventId}`);
  const childCollections = await eventRef.listCollections();

  await Promise.all(
    childCollections.map((childCollection) => db.recursiveDelete(childCollection))
  );

  return childCollections.length;
}

async function deleteEventStoragePrefix(eventId: string): Promise<void> {
  await storageBucket.deleteFiles({
    prefix: `events/${eventId}/`,
    force: true
  });
}

function readReviewParams(params: Record<string, string>): ReviewParams {
  return {
    eventId: params.eventId,
    poiId: params.poiId
  };
}

async function recalculatePoiReviewStats({ eventId, poiId }: ReviewParams): Promise<void> {
  const reviewsSnap = await db
    .collection(`events/${eventId}/pois/${poiId}/reviews`)
    .get();

  let ratingTotal = 0;
  let reviewCount = 0;

  reviewsSnap.forEach((reviewDoc) => {
    const { rating } = reviewDoc.data() as ReviewDocumentData;

    if (typeof rating === 'number' && Number.isFinite(rating)) {
      ratingTotal += rating;
      reviewCount += 1;
    }
  });

  const averageRating = reviewCount > 0
    ? Number((ratingTotal / reviewCount).toFixed(2))
    : 0;

  const stats = {
    averageRating,
    reviewCount,
    updatedAt: FieldValue.serverTimestamp()
  };

  const poiRef = db.doc(`events/${eventId}/pois/${poiId}`);
  const publicPoiRef = db.doc(`events/${eventId}/pois_public/${poiId}`);

  await db.runTransaction(async (tx) => {
    const poiSnap = await tx.get(poiRef);

    if (!poiSnap.exists) {
      return;
    }

    tx.update(poiRef, stats);

    const publicPoiSnap = await tx.get(publicPoiRef);

    if (publicPoiSnap.exists) {
      tx.update(publicPoiRef, stats);
    }
  });
}

export const rotatePrivateEventToken = onCall(
  privateAccessCallableOptions,
  async (request) => {
    const uid = request.auth?.uid;
    const eventId = typeof request.data?.eventId === 'string' ? request.data.eventId.trim() : '';
    const title = normalizeOptionalText(request.data?.title);
    const description = normalizeOptionalText(request.data?.description);

    if (!uid) {
      throw new HttpsError('unauthenticated', 'AUTH_REQUIRED');
    }

    if (!eventId) {
      throw new HttpsError('invalid-argument', 'EVENT_ID_REQUIRED');
    }

    await assertEventAdmin(eventId, uid);

    const token = randomBytes(privateAccessTokenBytes).toString('base64url');
    const tokenHash = hashPrivateAccessToken(eventId, token);
    const expiresAt = new Date(Date.now() + privateAccessGrantDurationMs);
    const linkRef = db.collection(`events/${eventId}/privateLinks`).doc();

    await linkRef.set({
      tokenHash,
      createdAt: FieldValue.serverTimestamp(),
      expiresAt,
      createdBy: uid,
      ...(title ? { title } : {}),
      ...(description ? { description } : {})
    });

    return {
      linkId: linkRef.id,
      token,
      expiresAt: expiresAt.toISOString(),
      grantDurationSeconds: Math.floor(privateAccessGrantDurationMs / 1000)
    };
  }
);

export const revokePrivateEventLink = onCall(
  privateAccessCallableOptions,
  async (request) => {
    const uid = request.auth?.uid;
    const eventId = typeof request.data?.eventId === 'string' ? request.data.eventId.trim() : '';
    const linkId = typeof request.data?.linkId === 'string' ? request.data.linkId.trim() : '';

    if (!uid) {
      throw new HttpsError('unauthenticated', 'AUTH_REQUIRED');
    }

    if (!eventId || !linkId) {
      throw new HttpsError('invalid-argument', 'PRIVATE_LINK_REQUIRED');
    }

    await assertEventAdmin(eventId, uid);

    const linkRef = db.doc(`events/${eventId}/privateLinks/${linkId}`);
    const linkSnap = await linkRef.get();

    if (!linkSnap.exists) {
      throw new HttpsError('not-found', 'PRIVATE_LINK_NOT_FOUND');
    }

    await linkRef.update({
      revokedAt: FieldValue.serverTimestamp(),
      revokedBy: uid
    });

    return { revoked: true };
  }
);

export const listPrivateEventLinks = onCall(
  privateAccessCallableOptions,
  async (request) => {
    const uid = request.auth?.uid;
    const eventId = typeof request.data?.eventId === 'string' ? request.data.eventId.trim() : '';

    if (!uid) {
      throw new HttpsError('unauthenticated', 'AUTH_REQUIRED');
    }

    if (!eventId) {
      throw new HttpsError('invalid-argument', 'EVENT_ID_REQUIRED');
    }

    await assertEventAdmin(eventId, uid);

    const linksSnap = await db
      .collection(`events/${eventId}/privateLinks`)
      .orderBy('createdAt', 'desc')
      .get();

    return {
      links: linksSnap.docs.map((doc) => {
        const data = doc.data() as PrivateLinkDocumentData;

        return {
          id: doc.id,
          createdAt: toDate(data.createdAt)?.toISOString() ?? null,
          expiresAt: toDate(data.expiresAt)?.toISOString() ?? null,
          revokedAt: toDate(data.revokedAt)?.toISOString() ?? null,
          createdBy: typeof data.createdBy === 'string' ? data.createdBy : null,
          revokedBy: typeof data.revokedBy === 'string' ? data.revokedBy : null,
          title: typeof data.title === 'string' ? data.title : null,
          description: typeof data.description === 'string' ? data.description : null
        };
      })
    };
  }
);

export const revokePrivateEventToken = onCall(
  privateAccessCallableOptions,
  async (request) => {
    const uid = request.auth?.uid;
    const eventId = typeof request.data?.eventId === 'string' ? request.data.eventId.trim() : '';

    if (!uid) {
      throw new HttpsError('unauthenticated', 'AUTH_REQUIRED');
    }

    if (!eventId) {
      throw new HttpsError('invalid-argument', 'EVENT_ID_REQUIRED');
    }

    await assertEventAdmin(eventId, uid);

    await db.doc(`events/${eventId}`).update({
      privateAccessTokenHash: FieldValue.delete(),
      privateAccessVersion: FieldValue.increment(1),
      privateAccessTokenRevokedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp()
    });

    return { revoked: true };
  }
);

export const redeemPrivateEventAccess = onCall(
  privateAccessCallableOptions,
  async (request) => {
    const uid = request.auth?.uid;
    const eventSlug = normalizeSlug(request.data?.eventSlug);
    const token = normalizeToken(request.data?.token);

    if (!uid) {
      throw new HttpsError('unauthenticated', 'AUTH_REQUIRED');
    }

    if (!eventSlug || !token) {
      throw new HttpsError('invalid-argument', 'PRIVATE_LINK_REQUIRED');
    }

    const eventSnap = await db
      .collection('events')
      .where('slug', '==', eventSlug)
      .limit(1)
      .get();

    if (eventSnap.empty) {
      throw new HttpsError('not-found', 'EVENT_NOT_FOUND');
    }

    const eventDoc = eventSnap.docs[0];
    const eventData = eventDoc.data() as EventDocumentData;
    const candidateHash = hashPrivateAccessToken(eventDoc.id, token);

    if (
      eventData.status !== 'published' ||
      eventData.visibility !== 'private'
    ) {
      throw new HttpsError('permission-denied', 'PRIVATE_LINK_INVALID');
    }

    const now = new Date();
    const linkSnap = await db
      .collection(`events/${eventDoc.id}/privateLinks`)
      .where('tokenHash', '==', candidateHash)
      .limit(1)
      .get();

    const linkDoc = linkSnap.docs.find((doc) => {
      return isActivePrivateLink(doc.data() as PrivateLinkDocumentData, now);
    });
    const legacyTokenHash = typeof eventData.privateAccessTokenHash === 'string'
      ? eventData.privateAccessTokenHash
      : '';
    const legacyAccessVersion = Number(eventData.privateAccessVersion ?? 0);
    const hasLegacyToken =
      Number.isFinite(legacyAccessVersion) &&
      legacyAccessVersion > 0 &&
      timingSafeHexEqual(candidateHash, legacyTokenHash);

    if (!linkDoc && !hasLegacyToken) {
      throw new HttpsError('permission-denied', 'PRIVATE_LINK_INVALID');
    }

    const linkData = linkDoc?.data() as PrivateLinkDocumentData | undefined;
    const linkExpiresAt = toDate(linkData?.expiresAt);
    const grantExpiresAt = new Date(Date.now() + privateAccessGrantDurationMs);
    const expiresAt = linkExpiresAt && linkExpiresAt < grantExpiresAt ? linkExpiresAt : grantExpiresAt;

    await db.doc(`events/${eventDoc.id}/privateAccess/${uid}`).set({
      uid,
      eventId: eventDoc.id,
      ...(linkDoc
        ? { linkId: linkDoc.id, accessVersion: FieldValue.delete() }
        : { accessVersion: legacyAccessVersion, linkId: FieldValue.delete() }),
      createdAt: FieldValue.serverTimestamp(),
      expiresAt
    }, { merge: true });

    return {
      eventId: eventDoc.id,
      expiresAt: expiresAt.toISOString(),
      ...(linkDoc ? { linkId: linkDoc.id } : { accessVersion: legacyAccessVersion })
    };
  }
);

export const deleteEventCompletely = onCall(
  privateAccessCallableOptions,
  async (request) => {
    const uid = request.auth?.uid;
    const eventId = normalizeEventId(request.data?.eventId);

    if (!uid) {
      throw new HttpsError('unauthenticated', 'AUTH_REQUIRED');
    }

    if (!eventId) {
      throw new HttpsError('invalid-argument', 'EVENT_ID_REQUIRED');
    }

    const permission = await assertEventDeletePermission(eventId, uid);

    try {
      if (permission.eventExists) {
        await markEventDeletionStarted(eventId, uid);
      }

      const deletedChildCollectionCount = await deleteEventChildCollections(eventId);
      await deleteEventStoragePrefix(eventId);
      await db.doc(`events/${eventId}`).delete();

      return {
        deleted: true,
        eventId,
        eventExisted: permission.eventExists,
        deletedChildCollectionCount
      };
    } catch (error) {
      console.error('[deleteEventCompletely] cleanup failed', {
        eventId,
        uid,
        eventExisted: permission.eventExists,
        errorCode: (error as { code?: unknown })?.code ?? null,
        errorMessage: (error as { message?: unknown })?.message ?? null
      });

      throw new HttpsError('internal', 'EVENT_DELETE_FAILED');
    }
  }
);

export const updatePoiReviewStatsOnCreate = onDocumentCreated(
  { document: reviewDocument, region },
  async (event) => {
    await recalculatePoiReviewStats(readReviewParams(event.params));
  }
);

export const updatePoiReviewStatsOnDelete = onDocumentDeleted(
  { document: reviewDocument, region },
  async (event) => {
    await recalculatePoiReviewStats(readReviewParams(event.params));
  }
);

export const updatePoiReviewStatsOnRatingChange = onDocumentUpdated(
  { document: reviewDocument, region },
  async (event) => {
    const beforeRating = event.data?.before.data()?.rating;
    const afterRating = event.data?.after.data()?.rating;

    if (beforeRating !== afterRating) {
      await recalculatePoiReviewStats(readReviewParams(event.params));
    }
  }
);
