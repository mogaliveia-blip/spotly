import { FieldPath, Timestamp } from 'firebase-admin/firestore';
import type { Firestore, Query, QueryDocumentSnapshot } from 'firebase-admin/firestore';
import type { SearchDiscoveryRequest } from './discovery-search-contract';
import type { CandidateWindow } from './discovery-time';
import type { GeohashRange } from './discovery-geo';

/** One query definition, reused by the engine and the real-Firestore Explain tool. */
export function buildDiscoverySearchQuery(
  firestore: Firestore, request: SearchDiscoveryRequest, range: GeohashRange,
  window: CandidateWindow, limit: number, after?: QueryDocumentSnapshot,
): Query {
  let query: Query = firestore.collection('discovery_public').where('contentType', '==', 'event');
  if (request.categoryId) query = query.where('categoryId', '==', request.categoryId);
  if (request.when.kind === 'now') query = query.where('timePrecision', '==', 'datetime');
  query = query.where('geohash', '>=', range[0]).where('geohash', '<=', range[1])
    .where('windowEndAt', '>=', new Timestamp(window.start.seconds, window.start.nanoseconds))
    .where('windowStartAt', '<=', new Timestamp(window.end.seconds, window.end.nanoseconds))
    .orderBy('geohash').orderBy('windowEndAt').orderBy('windowStartAt').orderBy(FieldPath.documentId())
    .limit(limit);
  return after ? query.startAfter(after) : query;
}
