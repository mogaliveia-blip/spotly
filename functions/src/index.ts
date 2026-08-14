import { initializeApp } from 'firebase-admin/app';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import {
  onDocumentCreated,
  onDocumentDeleted,
  onDocumentUpdated
} from 'firebase-functions/v2/firestore';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { createHash, randomBytes, timingSafeEqual } from 'crypto';

initializeApp();

const db = getFirestore();
const region = 'europe-west1';
const reviewDocument = 'events/{eventId}/pois/{poiId}/reviews/{reviewId}';
const privateAccessTokenBytes = 32;
const privateAccessGrantDurationMs = 30 * 24 * 60 * 60 * 1000;
const privateAccessCallableOptions = {
  region,
  cors: [
    'http://localhost:9002',
    'https://spotly.anavastudio.fr'
  ]
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

    if (!uid) {
      throw new HttpsError('unauthenticated', 'AUTH_REQUIRED');
    }

    if (!eventId) {
      throw new HttpsError('invalid-argument', 'EVENT_ID_REQUIRED');
    }

    await assertEventAdmin(eventId, uid);

    const token = randomBytes(privateAccessTokenBytes).toString('base64url');
    const tokenHash = hashPrivateAccessToken(eventId, token);
    const eventRef = db.doc(`events/${eventId}`);
    const eventSnap = await eventRef.get();
    const currentVersion = Number(eventSnap.data()?.privateAccessVersion ?? 0);
    const nextVersion = Number.isFinite(currentVersion) ? currentVersion + 1 : 1;

    await eventRef.update({
      privateAccessTokenHash: tokenHash,
      privateAccessVersion: nextVersion,
      privateAccessTokenUpdatedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp()
    });

    return {
      token,
      accessVersion: nextVersion,
      grantDurationSeconds: Math.floor(privateAccessGrantDurationMs / 1000)
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
    const tokenHash = typeof eventData.privateAccessTokenHash === 'string'
      ? eventData.privateAccessTokenHash
      : '';
    const accessVersion = Number(eventData.privateAccessVersion ?? 0);
    const candidateHash = hashPrivateAccessToken(eventDoc.id, token);

    if (
      eventData.status !== 'published' ||
      eventData.visibility !== 'private' ||
      !Number.isFinite(accessVersion) ||
      accessVersion < 1 ||
      !timingSafeHexEqual(candidateHash, tokenHash)
    ) {
      throw new HttpsError('permission-denied', 'PRIVATE_LINK_INVALID');
    }

    const expiresAt = new Date(Date.now() + privateAccessGrantDurationMs);

    await db.doc(`events/${eventDoc.id}/privateAccess/${uid}`).set({
      uid,
      eventId: eventDoc.id,
      accessVersion,
      createdAt: FieldValue.serverTimestamp(),
      expiresAt
    }, { merge: true });

    return {
      eventId: eventDoc.id,
      expiresAt: expiresAt.toISOString(),
      accessVersion
    };
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
