import { initializeApp } from 'firebase-admin/app';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import {
  onDocumentCreated,
  onDocumentDeleted,
  onDocumentUpdated
} from 'firebase-functions/v2/firestore';

initializeApp();

const db = getFirestore();
const region = 'europe-west1';
const reviewDocument = 'events/{eventId}/pois/{poiId}/reviews/{reviewId}';

type ReviewDocumentData = {
  rating?: unknown;
};

type ReviewParams = {
  eventId: string;
  poiId: string;
};

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
