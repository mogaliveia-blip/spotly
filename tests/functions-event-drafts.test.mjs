import assert from 'node:assert/strict'
import { after, before, beforeEach, describe, it } from 'node:test'
import { createRequire } from 'node:module'

import { initializeTestEnvironment } from '@firebase/rules-unit-testing'

import eventDraftsModule from '../functions/lib/event-drafts.js'
import eventTimeUpdateModule from '../functions/lib/event-time-update.js'
import eventDiscoveryUpdateModule from '../functions/lib/event-discovery-update.js'

const { updateEventCalendarTimeTransaction } = eventTimeUpdateModule
const { updateEventDiscoverySettingsTransaction } = eventDiscoveryUpdateModule
// Use the Functions SDK instance: FieldValue transforms cannot cross two SDK installations.
const functionsRequire = createRequire(new URL('../functions/package.json', import.meta.url))
const { deleteApp, getApps, initializeApp } = functionsRequire('firebase-admin/app')
const { getFirestore } = functionsRequire('firebase-admin/firestore')

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
    startDay: '2026-09-12',
    endDay: '2026-09-20',
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
    assert.equal(event.timePrecision, 'date')
    assert.equal(event.startDay, '2026-09-12')
    assert.equal(event.endDay, '2026-09-20')
    assert.equal(event.timezone, 'Europe/Paris')
    assert.equal('startDate' in event, false)
    assert.equal('endDate' in event, false)
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
      createEventDraftTransaction(db, identity(), payload({ startDay: undefined })),
      'INVALID_DATES'
    )
    await expectReason(
      createEventDraftTransaction(db, identity(), payload({
        startDay: '2026-09-21',
        endDay: '2026-09-20',
      })),
      'INVALID_DATES'
    )
    await expectReason(
      createEventDraftTransaction(db, identity(), payload({ startDay: '2026-02-30' })),
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

  it('creates a single calendar day in New York without synthetic instants', async () => {
    await createEventDraftTransaction(db, identity(), payload({
      startDay: '2026-10-10', endDay: '2026-10-10', timezone: 'America/New_York',
    }))
    const event = (await db.doc(`events/${REQUEST_ID_1}`).get()).data()
    assert.equal(event.startDay, '2026-10-10')
    assert.equal(event.endDay, '2026-10-10')
    assert.equal(event.timezone, 'America/New_York')
    assert.equal('startDate' in event, false)
    assert.equal('endDate' in event, false)
  })

  it('rejects invalid timezones and ambiguous old payloads without reserving anything', async () => {
    await expectReason(createEventDraftTransaction(db, identity(), payload({ timezone: 'Invalid/Zone' })), 'INVALID_TIMEZONE')
    await expectReason(createEventDraftTransaction(db, identity(), payload({ startDate: '2026-10-10' })), 'INVALID_PAYLOAD')
    assert.equal((await db.collection('events').get()).size, 0)
    assert.equal((await db.doc(`freeDraftSlots/${USER_UID}`).get()).exists, false)
    assert.equal((await db.collection('eventSlugs').get()).size, 0)
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

describe('updateEventCalendarTimeTransaction', () => {
  const time = {
    eventId: REQUEST_ID_1, timePrecision: 'date',
    startDay: '2026-10-10', endDay: '2026-10-12', timezone: 'Europe/Paris',
  }

  it('creates, rereads and edits the same days across browser timezones', async () => {
    await createEventDraftTransaction(db, identity(), payload({
      startDay: '2026-10-10', endDay: '2026-10-12',
    }))
    const previousTimezone = process.env.TZ
    try {
      for (const timezone of ['Europe/Paris', 'America/New_York']) {
        process.env.TZ = timezone
        const event = (await db.doc(`events/${REQUEST_ID_1}`).get()).data()
        await updateEventCalendarTimeTransaction(db, USER_UID, {
          ...time, startDay: event.startDay, endDay: event.endDay, timezone,
        })
        const updated = (await db.doc(`events/${REQUEST_ID_1}`).get()).data()
        assert.equal(updated.startDay, '2026-10-10')
        assert.equal(updated.endDay, '2026-10-12')
        assert.equal(updated.timezone, timezone)
        assert.equal('startDate' in updated, false)
        assert.equal('endDate' in updated, false)
      }
    } finally {
      if (previousTimezone === undefined) delete process.env.TZ
      else process.env.TZ = previousTimezone
    }
    await updateEventCalendarTimeTransaction(db, USER_UID, { ...time, endDay: time.startDay })
    assert.equal((await db.doc(`events/${REQUEST_ID_1}`).get()).data().endDay, '2026-10-10')
  })

  it('corrects legacy dates only explicitly, preserving content, points and commercial data', async () => {
    const source = {
      name: 'Historique', adminId: USER_UID, createdBy: 'someone-else',
      status: 'published', visibility: 'private',
      startDate: new Date('2026-10-09T18:00:00Z'), endDate: new Date('2026-10-13T00:00:00Z'),
      timezone: 'Europe/Paris', commercial: { state: 'active', offerCode: 'free_draft' },
    }
    await db.doc(`events/${REQUEST_ID_1}`).set(source)
    const pointRef = db.doc(`events/${REQUEST_ID_1}/pois/existing-point`)
    await pointRef.set({ title: 'Point conservé', categoryId: 'stage' })
    const pointBefore = (await pointRef.get()).data()
    await updateEventCalendarTimeTransaction(db, USER_UID, time)
    const after = (await db.doc(`events/${REQUEST_ID_1}`).get()).data()
    for (const key of ['name', 'adminId', 'createdBy', 'status', 'visibility', 'commercial']) {
      assert.deepEqual(after[key], source[key])
    }
    assert.equal(after.timePrecision, 'date')
    assert.equal(after.startDay, time.startDay)
    assert.equal('startDate' in after, false)
    assert.equal('endDate' in after, false)
    assert.deepEqual((await pointRef.get()).data(), pointBefore)
  })

  it('honors admin membership and owner authority, but not editors or createdBy', async () => {
    await db.doc(`events/${REQUEST_ID_1}`).set({ name: 'Test', adminId: 'legacy-admin', createdBy: USER_UID })
    await assert.rejects(updateEventCalendarTimeTransaction(db, USER_UID, time), { code: 'permission-denied' })
    await db.doc(`events/${REQUEST_ID_1}/members/${USER_UID}`).set({ role: 'editor' })
    await assert.rejects(updateEventCalendarTimeTransaction(db, USER_UID, time), { code: 'permission-denied' })
    await db.doc(`events/${REQUEST_ID_1}/members/${USER_UID}`).set({ role: 'admin' })
    await updateEventCalendarTimeTransaction(db, USER_UID, time)
    await updateEventCalendarTimeTransaction(db, OWNER_UID, { ...time, timezone: 'America/New_York' })
    assert.equal((await db.doc(`events/${REQUEST_ID_1}`).get()).data().timezone, 'America/New_York')
  })

  it('rejects unauthenticated calls and missing Events', async () => {
    await assert.rejects(updateEventCalendarTimeTransaction(db, '', time), { code: 'unauthenticated' })
    await assert.rejects(updateEventCalendarTimeTransaction(db, OWNER_UID, time), { code: 'not-found' })
  })

  it('rejects invalid or mixed temporal payloads atomically', async () => {
    await createEventDraftTransaction(db, identity(), payload())
    const before = (await db.doc(`events/${REQUEST_ID_1}`).get()).data()
    for (const changes of [
      { endDay: '2026-10-09' }, { startDay: '2026-02-30' },
      { timezone: 'Invalid/Zone' }, { timezone: '+02:00' },
      { startDate: new Date() }, { timePrecision: 'datetime' }, { commercial: {} },
    ]) {
      await assert.rejects(updateEventCalendarTimeTransaction(db, USER_UID, { ...time, ...changes }), { code: 'invalid-argument' })
      assert.deepEqual((await db.doc(`events/${REQUEST_ID_1}`).get()).data(), before)
    }
  })
})

describe('updateEventDiscoverySettingsTransaction', () => {
  const settings = {
    eventId: REQUEST_ID_1, discoveryPosition: { lat: 48.8566, lng: 2.3522 },
    typeId: 'festival', categoryId: 'culture', tags: ['outdoor', 'family', 'family'],
  }
  const eventRef = () => db.doc(`events/${REQUEST_ID_1}`)
  const update = (changes, uid = USER_UID) => updateEventDiscoverySettingsTransaction(db, uid, { eventId: REQUEST_ID_1, ...changes })

  it('accepts and rereads explicit position and classification, normalizing tags without duplicates', async () => {
    await createEventDraftTransaction(db, identity(), payload())
    const initial = (await eventRef().get()).data()
    for (const key of ['discoveryPosition', 'typeId', 'categoryId', 'tags']) assert.equal(key in initial, false)
    const result = await updateEventDiscoverySettingsTransaction(db, USER_UID, settings)
    const saved = (await eventRef().get()).data()
    assert.deepEqual(saved.discoveryPosition, settings.discoveryPosition)
    assert.equal(saved.typeId, 'festival')
    assert.equal(saved.categoryId, 'culture')
    assert.deepEqual(saved.tags, ['family', 'outdoor'])
    assert.deepEqual(result.tags, saved.tags)
    await update({ tags: ['outdoor', 'family'] })
    assert.deepEqual((await eventRef().get()).data().tags, saved.tags)
    for (const position of [{ lat: -90, lng: -180 }, { lat: 90, lng: 180 }]) {
      await update({ discoveryPosition: position })
      assert.deepEqual((await eventRef().get()).data().discoveryPosition, position)
    }
  })

  it('rejects invalid coordinates atomically', async () => {
    await createEventDraftTransaction(db, identity(), payload())
    const before = (await eventRef().get()).data()
    for (const position of [
      { lat: 90.01, lng: 0 }, { lat: -90.01, lng: 0 },
      { lat: 0, lng: 180.01 }, { lat: 0, lng: -180.01 },
      { lat: NaN, lng: 0 }, { lat: 0, lng: NaN },
      { lat: Infinity, lng: 0 }, { lat: 0, lng: -Infinity },
      { lat: '48.85', lng: 2.35 }, { lat: 0, lng: '2' },
      {}, { lat: 0 }, { lng: 0 }, [], { lat: 0, lng: 0, altitude: 100 },
    ]) {
      await assert.rejects(update({ discoveryPosition: position, typeId: 'concert' }), { code: 'invalid-argument' })
      assert.deepEqual((await eventRef().get()).data(), before)
    }
  })

  it('rejects unknown IDs, non-list tags and fields outside the bounded mutation', async () => {
    await createEventDraftTransaction(db, identity(), payload())
    const before = (await eventRef().get()).data()
    for (const changes of [
      { typeId: 'unknown' }, { categoryId: 'parking' }, { tags: ['unknown'] },
      { typeId: '' }, { typeId: 12 }, { categoryId: [] }, { tags: 'family' }, { tags: [null] },
      { typeId: undefined }, { discoveryPosition: undefined },
      { commercial: {} }, { poiCategories: [] }, { status: 'published' }, { startDay: '2026-01-01' }, {},
    ]) {
      await assert.rejects(update(changes), { code: 'invalid-argument' })
      assert.deepEqual((await eventRef().get()).data(), before)
    }
    for (const raw of [null, [], 'invalid', { ...settings, eventId: '../events' }, { ...settings, eventId: '' }]) {
      await assert.rejects(updateEventDiscoverySettingsTransaction(db, USER_UID, raw), { code: 'invalid-argument' })
    }
  })

  it('explicitly removes fields while preserving omitted settings, allowing empty tags', async () => {
    await createEventDraftTransaction(db, identity(), payload())
    await updateEventDiscoverySettingsTransaction(db, USER_UID, settings)
    await update({ discoveryPosition: null })
    let saved = (await eventRef().get()).data()
    assert.equal('discoveryPosition' in saved, false)
    assert.equal(saved.typeId, 'festival')
    assert.equal(saved.categoryId, 'culture')
    assert.deepEqual(saved.tags, ['family', 'outdoor'])
    await update({ typeId: null, categoryId: null, tags: [] })
    saved = (await eventRef().get()).data()
    assert.equal('typeId' in saved, false)
    assert.equal('categoryId' in saved, false)
    assert.deepEqual(saved.tags, [])
    await update({ tags: null, discoveryPosition: null })
    assert.equal('tags' in (await eventRef().get()).data(), false)
  })

  it('allows owner, member admin and legacy admin, denying editors, createdBy and non-members', async () => {
    await eventRef().set({ name: 'Historique', adminId: 'legacy-admin', createdBy: USER_UID })
    await assert.rejects(update({ typeId: 'concert' }), { code: 'permission-denied' })
    await db.doc(`events/${REQUEST_ID_1}/members/${USER_UID}`).set({ role: 'editor' })
    await assert.rejects(update({ typeId: 'concert' }), { code: 'permission-denied' })
    await assert.rejects(update({ typeId: 'concert' }, 'outsider'), { code: 'permission-denied' })
    await db.doc(`events/${REQUEST_ID_1}/members/${USER_UID}`).set({ role: 'admin' })
    await update({ typeId: 'concert' })
    await update({ categoryId: 'music' }, OWNER_UID)
    await update({ tags: ['free'] }, 'legacy-admin')
    const saved = (await eventRef().get()).data()
    assert.equal(saved.typeId, 'concert')
    assert.equal(saved.categoryId, 'music')
    assert.deepEqual(saved.tags, ['free'])
  })

  it('rejects unauthenticated calls and missing Events', async () => {
    await assert.rejects(update({ typeId: 'other' }, ''), { code: 'unauthenticated' })
    await assert.rejects(update({ typeId: 'other' }, OWNER_UID), { code: 'not-found' })
  })

  it('preserves all other Event fields, temporal V1-A, Points, photos, reviews, config and memberships', async () => {
    await createEventDraftTransaction(db, identity(), payload())
    await eventRef().update({
      status: 'published', visibility: 'public', defaultMapCenter: { lat: 12, lng: 34 },
      capabilities: { partnershipEnabled: true }, poiCategories: [{ id: 'stage', label: 'Scène', icon: 'Music' }],
    })
    const refs = [
      db.doc(`events/${REQUEST_ID_1}/pois/existing`),
      db.doc(`events/${REQUEST_ID_1}/pois/existing/reviews/review`),
      db.doc(`events/${REQUEST_ID_1}/pois_public/existing`),
      db.doc(`events/${REQUEST_ID_1}/members/${USER_UID}`),
      db.doc(`events/${REQUEST_ID_1}/config/main`),
      db.doc(`events/${REQUEST_ID_1}/config/marketing`),
    ]
    await refs[0].set({ title: 'Point', categoryId: 'stage', galleryUrls: [{ url: 'photo', path: 'existing.jpg' }], headerPhotoUrl: 'cover' })
    await refs[1].set({ rating: 5, comment: 'Avis conservé' })
    await refs[2].set({ title: 'Point', categoryId: 'stage' })
    const before = (await eventRef().get()).data()
    const childrenBefore = await Promise.all(refs.map(async (ref) => (await ref.get()).data()))
    await update({ typeId: 'other', categoryId: 'other' })
    // Neither the camera nor Points create an implicit discovery position.
    assert.equal('discoveryPosition' in (await eventRef().get()).data(), false)
    await updateEventDiscoverySettingsTransaction(db, USER_UID, settings)
    const after = (await eventRef().get()).data()
    for (const [key, value] of Object.entries(before)) {
      if (key !== 'updatedAt') assert.deepEqual(after[key], value, key)
    }
    assert.deepEqual(await Promise.all(refs.map(async (ref) => (await ref.get()).data())), childrenBefore)
    await updateEventCalendarTimeTransaction(db, USER_UID, {
      eventId: REQUEST_ID_1, timePrecision: 'date', startDay: '2026-10-10', endDay: '2026-10-12', timezone: 'Europe/Paris',
    })
    const afterTime = (await eventRef().get()).data()
    for (const key of ['discoveryPosition', 'typeId', 'categoryId', 'tags']) assert.deepEqual(afterTime[key], after[key])
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
