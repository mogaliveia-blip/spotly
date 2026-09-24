import assert from 'node:assert/strict'
import { after, before, beforeEach, describe, it } from 'node:test'

import { initializeTestEnvironment } from '@firebase/rules-unit-testing'
import { deleteApp, getApps, initializeApp } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'

import eventDraftsModule from '../functions/lib/event-drafts.js'

const {
  CreateEventDraftError,
  createEventDraftTransaction,
  deleteEventDocumentAndReservations,
} = eventDraftsModule

const PROJECT_ID = 'un-instant-ici-functions-test'
const USER_UID = 'organizer-user'
const OWNER_UID = 'platform-owner'
const REQUEST_ID_1 = '11111111-1111-4111-8111-111111111111'
const REQUEST_ID_2 = '22222222-2222-4222-8222-222222222222'
const REQUEST_ID_3 = '33333333-3333-4333-8333-333333333333'

let testEnv
let adminApp
let db

function payload(overrides = {}) {
  return {
    requestId: REQUEST_ID_1,
    name: 'Festival autonome',
    slug: 'Festival Autonome 2026',
    timezone: 'Europe/Paris',
    startDate: '2026-09-12',
    endDate: '2026-09-20',
    city: 'Lorient',
    departmentName: 'Morbihan',
    region: 'Bretagne',
    country: 'France',
    ...overrides,
  }
}

function identity(uid = USER_UID, emailVerified = true) {
  return {
    uid,
    emailVerified,
    email: `${uid}@example.test`,
    displayName: 'Organisateur Test',
    photoURL: null,
  }
}

async function seedUser(uid, role) {
  await db.doc(`users/${uid}`).set({
    uid,
    role,
    isApproved: false,
    email: `${uid}@example.test`,
    displayName: role === 'owner' ? 'Owner Test' : 'Organisateur Test',
    photoURL: null,
  })
}

async function expectReason(promise, reason) {
  await assert.rejects(promise, (error) => {
    assert.equal(error instanceof CreateEventDraftError, true)
    assert.equal(error.reason, reason)
    return true
  })
}

before(async () => {
  testEnv = await initializeTestEnvironment({ projectId: PROJECT_ID })
  adminApp = initializeApp({ projectId: PROJECT_ID }, 'event-drafts-tests')
  db = getFirestore(adminApp)
})

beforeEach(async () => {
  await testEnv.clearFirestore()
  await Promise.all([
    seedUser(USER_UID, 'user'),
    seedUser(OWNER_UID, 'owner'),
  ])
})

after(async () => {
  await testEnv.cleanup()
  if (getApps().includes(adminApp)) await deleteApp(adminApp)
})

describe('createEventDraftTransaction', () => {
  it('atomically creates the Event, admin membership, configs and reservations', async () => {
    const result = await createEventDraftTransaction(db, identity(), payload())

    assert.deepEqual(result, {
      eventId: REQUEST_ID_1,
      slug: 'festival-autonome-2026',
      idempotent: false,
    })

    const [eventSnap, memberSnap, mainSnap, marketingSnap, slugSnap, slotSnap] = await Promise.all([
      db.doc(`events/${REQUEST_ID_1}`).get(),
      db.doc(`events/${REQUEST_ID_1}/members/${USER_UID}`).get(),
      db.doc(`events/${REQUEST_ID_1}/config/main`).get(),
      db.doc(`events/${REQUEST_ID_1}/config/marketing`).get(),
      db.doc('eventSlugs/festival-autonome-2026').get(),
      db.doc(`freeDraftSlots/${USER_UID}`).get(),
    ])

    const event = eventSnap.data()
    assert.equal(event.status, 'draft')
    assert.equal(event.visibility, 'private')
    assert.equal(event.createdBy, USER_UID)
    assert.equal(event.adminId, USER_UID)
    assert.equal(event.creationRequestId, REQUEST_ID_1)
    assert.deepEqual(
      {
        offerCode: event.commercial.offerCode,
        offerVersion: event.commercial.offerVersion,
        state: event.commercial.state,
      },
      { offerCode: 'free_draft', offerVersion: 1, state: 'active' }
    )
    assert.equal(event.commercial.grantedAt.toDate() instanceof Date, true)
    assert.equal(event.startDate.toDate().toISOString(), '2026-09-12T12:00:00.000Z')
    assert.equal(event.endDate.toDate().toISOString(), '2026-09-20T12:00:00.000Z')
    assert.equal(event.capabilities.partnershipEnabled, false)

    assert.deepEqual(
      { uid: memberSnap.data().uid, role: memberSnap.data().role },
      { uid: USER_UID, role: 'admin' }
    )
    assert.deepEqual(mainSnap.data(), {
      isLandingPageActive: true,
      reviewsEnabled: true,
    })
    assert.equal(marketingSnap.data().heroEnabled, false)
    assert.equal(marketingSnap.data().heroTitle, 'Bienvenue à Festival autonome')
    assert.equal(slugSnap.data().eventId, REQUEST_ID_1)
    assert.equal(slotSnap.data().eventId, REQUEST_ID_1)
  })

  it('refuses a second active free draft for a user', async () => {
    await createEventDraftTransaction(db, identity(), payload())

    await expectReason(
      createEventDraftTransaction(db, identity(), payload({
        requestId: REQUEST_ID_2,
        slug: 'autre-festival',
      })),
      'FREE_DRAFT_EXISTS'
    )
  })

  it('replays the same requestId without creating duplicates', async () => {
    await createEventDraftTransaction(db, identity(), payload())
    const replay = await createEventDraftTransaction(db, identity(), payload())

    assert.equal(replay.eventId, REQUEST_ID_1)
    assert.equal(replay.idempotent, true)
    assert.equal((await db.collection('events').get()).size, 1)
  })

  it('serializes two concurrent calls with the same requestId', async () => {
    const results = await Promise.all([
      createEventDraftTransaction(db, identity(), payload()),
      createEventDraftTransaction(db, identity(), payload()),
    ])

    assert.deepEqual(results.map((result) => result.eventId), [REQUEST_ID_1, REQUEST_ID_1])
    assert.deepEqual(results.map((result) => result.idempotent).sort(), [false, true])
    assert.equal((await db.collection('events').get()).size, 1)
  })

  it('refuses a slug reserved by an existing Event', async () => {
    await db.doc('events/existing-event').set({ name: 'Existant' })
    await db.doc('eventSlugs/festival-autonome-2026').set({
      eventId: 'existing-event',
    })

    await expectReason(
      createEventDraftTransaction(db, identity(), payload()),
      'SLUG_TAKEN'
    )
  })

  it('repairs a stale slug reservation', async () => {
    await db.doc('eventSlugs/festival-autonome-2026').set({
      eventId: 'missing-event',
    })

    await createEventDraftTransaction(db, identity(), payload())

    assert.equal(
      (await db.doc('eventSlugs/festival-autonome-2026').get()).data().eventId,
      REQUEST_ID_1
    )
  })

  it('requires a verified email for global users', async () => {
    await expectReason(
      createEventDraftTransaction(db, identity(USER_UID, false), payload()),
      'EMAIL_VERIFICATION_REQUIRED'
    )
  })

  it('rejects missing, inverted and impossible calendar dates', async () => {
    await expectReason(
      createEventDraftTransaction(db, identity(), payload({ startDate: undefined })),
      'INVALID_DATES'
    )
    await expectReason(
      createEventDraftTransaction(db, identity(), payload({
        startDate: '2026-09-21',
        endDate: '2026-09-20',
      })),
      'INVALID_DATES'
    )
    await expectReason(
      createEventDraftTransaction(db, identity(), payload({ startDate: '2026-02-30' })),
      'INVALID_DATES'
    )
  })

  it('rejects client-controlled sensitive fields', async () => {
    await expectReason(
      createEventDraftTransaction(db, identity(), payload({
        commercial: { offerCode: 'public' },
      })),
      'INVALID_PAYLOAD'
    )
  })

  it('repairs a stale free draft slot', async () => {
    await db.doc(`freeDraftSlots/${USER_UID}`).set({ eventId: 'missing-event' })

    await createEventDraftTransaction(db, identity(), payload())

    assert.equal(
      (await db.doc(`freeDraftSlots/${USER_UID}`).get()).data().eventId,
      REQUEST_ID_1
    )
  })

  it('allows the owner to create multiple Events without a free draft slot', async () => {
    await createEventDraftTransaction(db, identity(OWNER_UID, false), payload())
    await createEventDraftTransaction(db, identity(OWNER_UID, false), payload({
      requestId: REQUEST_ID_2,
      slug: 'owner-demo-two',
    }))

    assert.equal((await db.collection('events').get()).size, 2)
    assert.equal((await db.doc(`freeDraftSlots/${OWNER_UID}`).get()).exists, false)
  })
})

describe('deleteEventDocumentAndReservations', () => {
  it('deletes matching Event, slug and free draft reservations idempotently', async () => {
    await createEventDraftTransaction(db, identity(), payload())
    const eventData = (await db.doc(`events/${REQUEST_ID_1}`).get()).data()

    await deleteEventDocumentAndReservations(db, REQUEST_ID_1, eventData)
    await deleteEventDocumentAndReservations(db, REQUEST_ID_1, eventData)

    const [eventSnap, slugSnap, slotSnap] = await Promise.all([
      db.doc(`events/${REQUEST_ID_1}`).get(),
      db.doc('eventSlugs/festival-autonome-2026').get(),
      db.doc(`freeDraftSlots/${USER_UID}`).get(),
    ])
    assert.equal(eventSnap.exists, false)
    assert.equal(slugSnap.exists, false)
    assert.equal(slotSnap.exists, false)
  })

  it('does not delete reservations that point to another Event', async () => {
    await createEventDraftTransaction(db, identity(), payload())
    const eventData = (await db.doc(`events/${REQUEST_ID_1}`).get()).data()
    await Promise.all([
      db.doc('eventSlugs/festival-autonome-2026').set({ eventId: REQUEST_ID_3 }),
      db.doc(`freeDraftSlots/${USER_UID}`).set({ eventId: REQUEST_ID_3 }),
    ])

    await deleteEventDocumentAndReservations(db, REQUEST_ID_1, eventData)

    assert.equal(
      (await db.doc('eventSlugs/festival-autonome-2026').get()).data().eventId,
      REQUEST_ID_3
    )
    assert.equal(
      (await db.doc(`freeDraftSlots/${USER_UID}`).get()).data().eventId,
      REQUEST_ID_3
    )
  })
})
