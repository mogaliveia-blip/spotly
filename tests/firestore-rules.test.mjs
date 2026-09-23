import assert from 'node:assert/strict'
import { after, before, beforeEach, describe, it } from 'node:test'
import { readFileSync } from 'node:fs'

import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} from '@firebase/rules-unit-testing'
import { doc, getDoc, setDoc, updateDoc } from 'firebase/firestore'

const PROJECT_ID = 'un-instant-ici-rules-test'
const EVENT_ID = 'event-sensitive-fields'
const ADMIN_UID = 'event-admin'
const OWNER_UID = 'platform-owner'

let testEnv

async function seedFixture() {
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore()

    await Promise.all([
      setDoc(doc(db, 'users', ADMIN_UID), {
        role: 'user',
        isApproved: true,
      }),
      setDoc(doc(db, 'users', OWNER_UID), {
        role: 'owner',
        isApproved: true,
      }),
      setDoc(doc(db, 'events', EVENT_ID), {
        name: 'Event de test',
        slug: 'event-de-test',
        adminId: ADMIN_UID,
        status: 'draft',
        visibility: 'public',
        startDate: new Date('2026-09-12T00:00:00.000Z'),
        endDate: new Date('2026-09-13T00:00:00.000Z'),
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
        updatedAt: new Date('2026-01-01T00:00:00.000Z'),
      }),
      setDoc(doc(db, `events/${EVENT_ID}/members`, ADMIN_UID), {
        uid: ADMIN_UID,
        role: 'admin',
        joinedAt: new Date('2026-01-01T00:00:00.000Z'),
      }),
    ])
  })
}

function eventRefFor(uid) {
  return doc(testEnv.authenticatedContext(uid).firestore(), 'events', EVENT_ID)
}

before(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: {
      rules: readFileSync('firestore.rules', 'utf8'),
    },
  })
})

beforeEach(async () => {
  await testEnv.clearFirestore()
  await seedFixture()
})

after(async () => {
  await testEnv.cleanup()
})

describe('Event protected fields', () => {
  it('allows an Event admin to update name', async () => {
    await assertSucceeds(updateDoc(eventRefFor(ADMIN_UID), { name: 'Nouveau nom' }))
  })

  it('allows an Event admin to update endDate', async () => {
    await assertSucceeds(updateDoc(eventRefFor(ADMIN_UID), {
      endDate: new Date('2026-09-20T00:00:00.000Z'),
    }))
  })

  it('allows an Event admin to update visibility under current rules', async () => {
    await assertSucceeds(updateDoc(eventRefFor(ADMIN_UID), { visibility: 'private' }))
  })

  it('denies an Event admin changing commercial', async () => {
    await assertFails(updateDoc(eventRefFor(ADMIN_UID), {
      commercial: {
        offerCode: 'public',
        offerVersion: 1,
        state: 'active',
        grantedAt: new Date('2026-09-23T00:00:00.000Z'),
      },
    }))
  })

  it('denies an Event admin changing createdBy', async () => {
    await assertFails(updateDoc(eventRefFor(ADMIN_UID), { createdBy: ADMIN_UID }))
  })

  it('denies an Event admin changing adminId', async () => {
    await assertFails(updateDoc(eventRefFor(ADMIN_UID), { adminId: 'another-user' }))
  })

  it('denies an Event admin enabling Partnership', async () => {
    await assertFails(updateDoc(eventRefFor(ADMIN_UID), {
      capabilities: { partnershipEnabled: true },
    }))
  })

  it('allows the global owner to manage the privileged Event fields', async () => {
    const ownerEventRef = eventRefFor(OWNER_UID)

    await assertSucceeds(updateDoc(ownerEventRef, {
      createdBy: ADMIN_UID,
      adminId: ADMIN_UID,
      commercial: {
        offerCode: 'public',
        offerVersion: 1,
        state: 'active',
        grantedAt: new Date('2026-09-23T00:00:00.000Z'),
      },
      capabilities: { partnershipEnabled: true },
    }))

    const snapshot = await assertSucceeds(getDoc(ownerEventRef))
    assert.equal(snapshot.data().capabilities.partnershipEnabled, true)
  })
})

describe('future server-only reservation collections', () => {
  it('denies ordinary client access to freeDraftSlots', async () => {
    const clientDb = testEnv.authenticatedContext(ADMIN_UID).firestore()
    const slotRef = doc(clientDb, 'freeDraftSlots', ADMIN_UID)

    await assertFails(getDoc(slotRef))
    await assertFails(setDoc(slotRef, { eventId: EVENT_ID, reservedAt: new Date() }))
  })

  it('denies global owner client access to eventSlugs', async () => {
    const ownerDb = testEnv.authenticatedContext(OWNER_UID).firestore()
    const slugRef = doc(ownerDb, 'eventSlugs', 'event-de-test')

    await assertFails(getDoc(slugRef))
    await assertFails(setDoc(slugRef, { eventId: EVENT_ID, reservedAt: new Date() }))
  })
})
