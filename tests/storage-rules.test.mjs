import assert from 'node:assert/strict'
import { after, before, beforeEach, it } from 'node:test'
import { readFileSync } from 'node:fs'

import { assertFails, assertSucceeds, initializeTestEnvironment } from '@firebase/rules-unit-testing'
import { doc, setDoc, updateDoc } from 'firebase/firestore'
import { getBytes, ref, uploadBytes } from 'firebase/storage'

const PROJECT_ID = 'un-instant-ici-storage-rules-test'
const EVENT_ID = 'storage-event'
const BUCKET = `${PROJECT_ID}.firebasestorage.app`
let testEnv

before(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: { rules: readFileSync('firestore.rules', 'utf8') },
    storage: { rules: readFileSync('storage.rules', 'utf8') },
  })
})

beforeEach(async () => {
  await testEnv.clearFirestore()
  await testEnv.clearStorage()
  await testEnv.withSecurityRulesDisabled(async (context) => {
    await Promise.all([
      setDoc(doc(context.firestore(), 'users', 'admin'), { role: 'user' }),
      setDoc(doc(context.firestore(), `events/${EVENT_ID}`), {
        adminId: 'admin', status: 'published', visibility: 'public',
        commercial: { offerCode: 'public', state: 'active' },
      }),
    ])
    await uploadBytes(ref(context.storage(BUCKET), `events/${EVENT_ID}/poi-images/point.jpg`), new Uint8Array([1]))
    await uploadBytes(ref(context.storage(BUCKET), `events/${EVENT_ID}/marketing/hero.jpg`), new Uint8Array([2]))
  })
})

after(async () => { await testEnv.cleanup() })

it('denies visitor Storage reads after suspension while retaining admin access', async () => {
  const visitor = testEnv.unauthenticatedContext().storage(BUCKET)
  const admin = testEnv.authenticatedContext('admin').storage(BUCKET)
  for (const path of [`events/${EVENT_ID}/poi-images/point.jpg`, `events/${EVENT_ID}/marketing/hero.jpg`]) {
    assert.ok((await assertSucceeds(getBytes(ref(visitor, path)))).byteLength)
  }
  await testEnv.withSecurityRulesDisabled(async (context) => {
    await updateDoc(doc(context.firestore(), `events/${EVENT_ID}`), { 'commercial.state': 'revoked' })
  })
  for (const path of [`events/${EVENT_ID}/poi-images/point.jpg`, `events/${EVENT_ID}/marketing/hero.jpg`]) {
    await assertFails(getBytes(ref(visitor, path)))
    assert.ok((await assertSucceeds(getBytes(ref(admin, path)))).byteLength)
  }
})

it('ends private link Storage access on suspension', async () => {
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore()
    await updateDoc(doc(db, `events/${EVENT_ID}`), {
      visibility: 'private', 'commercial.offerCode': 'private',
    })
    await setDoc(doc(db, `events/${EVENT_ID}/privateLinks/link`), {
      expiresAt: new Date('2099-01-01T00:00:00.000Z'),
    })
    await setDoc(doc(db, `events/${EVENT_ID}/privateAccess/visitor`), {
      linkId: 'link', expiresAt: new Date('2099-01-01T00:00:00.000Z'),
    })
  })
  const visitor = testEnv.authenticatedContext('visitor').storage(BUCKET)
  const image = ref(visitor, `events/${EVENT_ID}/poi-images/point.jpg`)
  assert.ok((await assertSucceeds(getBytes(image))).byteLength)
  await testEnv.withSecurityRulesDisabled(async (context) => {
    await updateDoc(doc(context.firestore(), `events/${EVENT_ID}`), { 'commercial.state': 'revoked' })
  })
  await assertFails(getBytes(image))
})
