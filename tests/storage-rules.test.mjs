import assert from 'node:assert/strict'
import { after, before, beforeEach, it } from 'node:test'
import { readFileSync } from 'node:fs'

import { assertFails, assertSucceeds, initializeTestEnvironment } from '@firebase/rules-unit-testing'
import { deleteDoc, deleteField, doc, setDoc, updateDoc } from 'firebase/firestore'
import { deleteObject, getBytes, ref, uploadBytes } from 'firebase/storage'

const PROJECT_ID = 'un-instant-ici-storage-rules-test'
const EVENT_ID = 'storage-event'
const BUCKET = `${PROJECT_ID}.firebasestorage.app`
const PHOTO_A = `events/${EVENT_ID}/program/item/photo-11111111-1111-4111-8111-111111111111.jpg`
const PHOTO_B = `events/${EVENT_ID}/program/item/photo-22222222-2222-4222-8222-222222222222.png`
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

async function seedProgramPhoto({ published = true, photoPath = PHOTO_A } = {}) {
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore()
    await setDoc(doc(db, 'users/member-admin'), { role: 'user' })
    await setDoc(doc(db, `events/${EVENT_ID}/members/member-admin`), { uid: 'member-admin', role: 'admin' })
    await setDoc(doc(db, `events/${EVENT_ID}/members/editor`), { uid: 'editor', role: 'editor' })
    await setDoc(doc(db, `events/${EVENT_ID}/program/item`), {
      name: 'Artiste', published, sortOrder: 0, photoPath,
    })
    await uploadBytes(ref(context.storage(BUCKET), PHOTO_A), new Uint8Array([1]), { contentType: 'image/jpeg' })
  })
}

it('reads program photos with Event + item only; denies drafts, unpublishing and private Events', async () => {
  await seedProgramPhoto()
  const anonymous = testEnv.unauthenticatedContext().storage(BUCKET)
  const visitor = testEnv.authenticatedContext('visitor').storage(BUCKET)
  const admin = testEnv.authenticatedContext('member-admin').storage(BUCKET)
  for (const client of [anonymous, visitor, admin]) {
    assert.ok((await assertSucceeds(getBytes(ref(client, PHOTO_A)))).byteLength)
  }
  await testEnv.withSecurityRulesDisabled(async (context) => {
    await updateDoc(doc(context.firestore(), `events/${EVENT_ID}/program/item`), { published: false })
  })
  for (const client of [anonymous, visitor, admin]) await assertFails(getBytes(ref(client, PHOTO_A)))
  await testEnv.withSecurityRulesDisabled(async (context) => {
    await updateDoc(doc(context.firestore(), `events/${EVENT_ID}/program/item`), { published: true })
    await updateDoc(doc(context.firestore(), `events/${EVENT_ID}`), {
      visibility: 'private', 'commercial.offerCode': 'private',
    })
    await setDoc(doc(context.firestore(), `events/${EVENT_ID}/privateAccess/visitor`), {
      expiresAt: new Date('2099-01-01T00:00:00.000Z'), accessVersion: 1,
    })
    await updateDoc(doc(context.firestore(), `events/${EVENT_ID}`), { privateAccessVersion: 1 })
  })
  for (const client of [anonymous, visitor, admin]) await assertFails(getBytes(ref(client, PHOTO_A)))
})

it('writes program photos with Event + member only, never a global owner, editor or visitor', async () => {
  await seedProgramPhoto()
  const bytes = new Uint8Array([1, 2])
  const admin = testEnv.authenticatedContext('member-admin').storage(BUCKET)
  const denied = [testEnv.authenticatedContext('owner'), testEnv.authenticatedContext('editor'),
    testEnv.authenticatedContext('visitor'), testEnv.unauthenticatedContext()]
  await testEnv.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), 'users/owner'), { role: 'owner' })
    await updateDoc(doc(context.firestore(), `events/${EVENT_ID}`), { adminId: 'legacy' })
  })
  denied.push(testEnv.authenticatedContext('legacy'))
  for (const context of denied) {
    await assertFails(uploadBytes(ref(context.storage(BUCKET), PHOTO_B), bytes, { contentType: 'image/png' }))
    await assertFails(deleteObject(ref(context.storage(BUCKET), PHOTO_A)))
  }
  await assertSucceeds(uploadBytes(ref(admin, PHOTO_B), bytes, { contentType: 'image/png' }))
  await assertSucceeds(deleteObject(ref(admin, PHOTO_A)))
  const ownerAsMember = `events/${EVENT_ID}/program/item/photo-77777777-7777-4777-8777-777777777777.jpg`
  await assertSucceeds(setDoc(doc(testEnv.authenticatedContext('owner').firestore(), `events/${EVENT_ID}/members/owner`), {
    uid: 'owner', role: 'admin',
  }))
  await assertSucceeds(uploadBytes(ref(testEnv.authenticatedContext('owner').storage(BUCKET), ownerAsMember), bytes, { contentType: 'image/jpeg' }))
  await assertSucceeds(deleteObject(ref(testEnv.authenticatedContext('owner').storage(BUCKET), ownerAsMember)))
  await testEnv.withSecurityRulesDisabled(async (context) => {
    await updateDoc(doc(context.firestore(), `events/${EVENT_ID}`), { visibility: 'private' })
  })
  await assertFails(uploadBytes(ref(admin, PHOTO_A), bytes, { contentType: 'image/jpeg' }))
  await assertFails(deleteObject(ref(admin, PHOTO_B)))
})

it('rejects invalid program photo paths, MIME, size and in-place overwrite', async () => {
  await seedProgramPhoto()
  const admin = testEnv.authenticatedContext('member-admin').storage(BUCKET)
  const bytes = new Uint8Array([1])
  const validPath = `events/${EVENT_ID}/program/item/photo-55555555-5555-4555-8555-555555555555.png`
  await assertFails(uploadBytes(ref(admin, `events/${EVENT_ID}/program/other/random.jpg`), bytes, { contentType: 'image/jpeg' }))
  await assertFails(uploadBytes(ref(admin, `events/other-event/program/item/photo-88888888-8888-4888-8888-888888888888.jpg`), bytes, { contentType: 'image/jpeg' }))
  await assertFails(uploadBytes(ref(admin, `events/${EVENT_ID}/program/item/photo-33333333-3333-4333-8333-333333333333.png`), bytes, { contentType: 'image/jpeg' }))
  await assertFails(uploadBytes(ref(admin, `events/${EVENT_ID}/program/item/photo-44444444-4444-4444-8444-444444444444.png`), new Uint8Array(2 * 1024 * 1024 + 1), { contentType: 'image/png' }))
  await assertSucceeds(uploadBytes(ref(admin, validPath), bytes, { contentType: 'image/png' }))
  await assertFails(uploadBytes(ref(admin, PHOTO_A), bytes, { contentType: 'image/jpeg' }))
  await assertFails(getBytes(ref(testEnv.unauthenticatedContext().storage(BUCKET), validPath)))
})

it('supports replacement, removal and item deletion without exposing old files', async () => {
  await seedProgramPhoto()
  const replacement = `events/${EVENT_ID}/program/item/photo-66666666-6666-4666-8666-666666666666.png`
  const admin = testEnv.authenticatedContext('member-admin')
  const visitor = testEnv.unauthenticatedContext().storage(BUCKET)
  const programRef = doc(admin.firestore(), `events/${EVENT_ID}/program/item`)
  await assertSucceeds(uploadBytes(ref(admin.storage(BUCKET), replacement), new Uint8Array([2]), { contentType: 'image/png' }))
  await assertFails(getBytes(ref(visitor, replacement)))
  await assertSucceeds(updateDoc(programRef, { photoPath: replacement }))
  assert.ok((await assertSucceeds(getBytes(ref(visitor, replacement)))).byteLength)
  await assertFails(getBytes(ref(visitor, PHOTO_A)))
  await assertSucceeds(deleteObject(ref(admin.storage(BUCKET), PHOTO_A)))
  await assertSucceeds(updateDoc(programRef, { photoPath: deleteField() }))
  await assertFails(getBytes(ref(visitor, replacement)))
  await assertSucceeds(deleteObject(ref(admin.storage(BUCKET), replacement)))
  const deletionPhoto = `events/${EVENT_ID}/program/item/photo-99999999-9999-4999-8999-999999999999.jpg`
  await assertSucceeds(uploadBytes(ref(admin.storage(BUCKET), deletionPhoto), new Uint8Array([3]), { contentType: 'image/jpeg' }))
  await assertSucceeds(updateDoc(programRef, { photoPath: deletionPhoto }))
  await assertSucceeds(deleteDoc(programRef))
  await assertFails(getBytes(ref(visitor, deletionPhoto)))
  await assertSucceeds(deleteObject(ref(admin.storage(BUCKET), deletionPhoto)))
})

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
