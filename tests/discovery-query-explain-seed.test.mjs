import assert from 'node:assert/strict'
import { after, before, beforeEach, describe, it } from 'node:test'
import { createRequire } from 'node:module'
import { initializeTestEnvironment } from '@firebase/rules-unit-testing'
import { commitDiscoverySeedBatch } from '../functions/scripts/discovery-query-explain-seed.mjs'

const requireFunctions = createRequire(new URL('../functions/package.json', import.meta.url))
const { initializeApp, deleteApp } = requireFunctions('firebase-admin/app')
const { getFirestore } = requireFunctions('firebase-admin/firestore')
const PROJECT_ID = 'demo-discovery-d1'
let environment, app, db
before(async () => {
  assert.match(process.env.FIRESTORE_EMULATOR_HOST ?? '', /^(127\.0\.0\.1|localhost):\d+$/, 'Local Firestore is mandatory')
  environment = await initializeTestEnvironment({ projectId: PROJECT_ID })
  app = initializeApp({ projectId: PROJECT_ID }, 'discovery-seed-tests')
  db = getFirestore(app)
})
beforeEach(async () => environment.clearFirestore())
after(async () => { await environment.cleanup(); await deleteApp(app) })
const fixture = (index, title = 'Synthetic fixture') => ({ id: `d1_explain_${index}`, projection: { title, synthetic: true } })
const ref = (index) => db.doc(`discovery_public/event_d1_explain_${index}`)

describe('Query Explain seed create-only batches on local Firestore', () => {
  it('creates an absent set of fixtures', async () => {
    const fixtures = [fixture(0), fixture(1)]
    await commitDiscoverySeedBatch(db, fixtures)
    for (let i = 0; i < fixtures.length; i++) assert.deepEqual((await ref(i).get()).data(), fixtures[i].projection)
  })
  it('refuses a collision without overwrite, merge, or any other write from the batch', async () => {
    const original = { sentinel: 'Keep this document', nested: { value: 42 } }
    await ref(1).create(original)
    await assert.rejects(commitDiscoverySeedBatch(db, [fixture(0), fixture(1)]), /DISCOVERY_SEED_COLLISION/)
    assert.deepEqual((await ref(1).get()).data(), original)
    assert.equal((await ref(0).get()).exists, false)
  })
  it('protects a document created after the empty-collection check and before commit', async () => {
    assert.equal((await db.collection('discovery_public').limit(1).get()).empty, true)
    const original = { sentinel: 'Concurrent document' }
    const racingDb = {
      doc: (path) => db.doc(path),
      batch() {
        const batch = db.batch()
        return {
          create: (...args) => batch.create(...args),
          async commit() {
            await ref(1).create(original)
            return batch.commit()
          },
        }
      },
    }
    await assert.rejects(commitDiscoverySeedBatch(racingDb, [fixture(0), fixture(1)]), /DISCOVERY_SEED_COLLISION/)
    assert.deepEqual((await ref(1).get()).data(), original)
    assert.equal((await ref(0).get()).exists, false)
  })
  it('allows only one of two concurrent batches targeting the same fixture', async () => {
    const results = await Promise.allSettled([
      commitDiscoverySeedBatch(db, [fixture(0, 'First')]),
      commitDiscoverySeedBatch(db, [fixture(0, 'Second')]),
    ])
    assert.equal(results.filter((result) => result.status === 'fulfilled').length, 1)
    const failure = results.find((result) => result.status === 'rejected')
    assert.match(failure.reason.message, /DISCOVERY_SEED_COLLISION/)
    const winner = results[0].status === 'fulfilled' ? 'First' : 'Second'
    assert.deepEqual((await ref(0).get()).data(), fixture(0, winner).projection)
  })
})
