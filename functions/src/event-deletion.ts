import { Firestore, Timestamp } from 'firebase-admin/firestore';
import { HttpsError } from 'firebase-functions/v2/https';

/** Remove public exposure before slow Storage/subcollection cleanup, including retries. */
export async function markEventDeletionStartedTransaction(
  firestore: Firestore, eventId: string, uid: string
): Promise<void> {
  if (!uid) throw new HttpsError('unauthenticated', 'AUTH_REQUIRED');
  const eventRef = firestore.doc(`events/${eventId}`);
  await firestore.runTransaction(async (transaction) => {
    const [event, user, member] = await Promise.all([
      transaction.get(eventRef), transaction.get(firestore.doc(`users/${uid}`)),
      transaction.get(firestore.doc(`events/${eventId}/members/${uid}`)),
    ]);
    const data = event.data();
    if (user.data()?.role !== 'owner' && (!event.exists ||
        (member.data()?.role !== 'admin' && data?.adminId !== uid && data?.deletionRequestedBy !== uid))) {
      throw new HttpsError('permission-denied', 'EVENT_ADMIN_REQUIRED');
    }
    if (event.exists) {
      transaction.update(eventRef, { deletionRequestedBy: uid, deletionRequestedAt: Timestamp.now() });
    }
    transaction.delete(firestore.doc(`discovery_public/event_${eventId}`));
  });
}
