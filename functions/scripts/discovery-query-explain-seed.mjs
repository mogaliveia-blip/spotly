/** Each batch is create-only and atomic, including collisions after the empty-collection check. */
export async function commitDiscoverySeedBatch(db, fixtures) {
  const batch = db.batch()
  for (const { id, projection } of fixtures) {
    batch.create(db.doc(`discovery_public/event_${id}`), projection)
  }
  try {
    await batch.commit()
  } catch (error) {
    if (error?.code === 6) {
      throw new Error('DISCOVERY_SEED_COLLISION: batch refused; existing documents preserved', { cause: error })
    }
    throw error
  }
}
