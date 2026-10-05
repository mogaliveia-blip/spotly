import assert from 'node:assert/strict'
import { after, before, beforeEach, describe, it } from 'node:test'
import { readFileSync } from 'node:fs'

import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} from '@firebase/rules-unit-testing'
import { deleteField, doc, getDoc, setDoc, updateDoc } from 'firebase/firestore'

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

  it('requires server validation even for historical temporal fields', async () => {
    await assertFails(updateDoc(eventRefFor(ADMIN_UID), {
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

describe('Event discovery authority', () => {
  const settings = {
    discoveryPosition: { lat: 48.8566, lng: 2.3522 }, typeId: 'festival', categoryId: 'culture', tags: ['family'],
  }
  async function seedDiscovery() {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await updateDoc(doc(context.firestore(), 'events', EVENT_ID), settings)
    })
  }

  for (const uid of [ADMIN_UID, OWNER_UID]) {
    it(`denies ${uid} adding, changing, deleting or replacing discovery fields directly`, async () => {
      for (const [key, value] of Object.entries(settings)) {
        await assertFails(updateDoc(eventRefFor(uid), { [key]: value }))
      }
      await seedDiscovery()
      for (const change of [
        { discoveryPosition: { lat: 0, lng: 0 } }, { 'discoveryPosition.lat': 0 },
        { typeId: 'concert' }, { categoryId: 'music' }, { tags: ['free'] },
        ...Object.keys(settings).map((key) => ({ [key]: deleteField() })),
      ]) await assertFails(updateDoc(eventRefFor(uid), change))
      const existing = (await getDoc(eventRefFor(uid))).data()
      const { discoveryPosition, typeId, categoryId, tags, ...withoutDiscovery } = existing
      await assertFails(setDoc(eventRefFor(uid), { ...withoutDiscovery, name: 'Remplacement involontaire' }))
    })

    it(`preserves discovery during allowed ${uid} metadata edits and unchanged document replacement`, async () => {
      await seedDiscovery()
      await assertSucceeds(updateDoc(eventRefFor(uid), { name: 'Nouveau nom', description: 'Informations modifiées' }))
      await assertSucceeds(updateDoc(eventRefFor(uid), { status: 'published', visibility: 'private' }))
      const existing = (await getDoc(eventRefFor(uid))).data()
      await assertSucceeds(setDoc(eventRefFor(uid), { ...existing, name: 'Champs conservés' }))
      const saved = (await getDoc(eventRefFor(uid))).data()
      for (const [key, value] of Object.entries(settings)) assert.deepEqual(saved[key], value)
    })
  }

  it('does not require discovery for historical Events or publication', async () => {
    await assertSucceeds(updateDoc(eventRefFor(ADMIN_UID), { status: 'published' }))
    const saved = (await getDoc(eventRefFor(ADMIN_UID))).data()
    for (const key of Object.keys(settings)) assert.equal(key in saved, false)
  })

  it('denies editor, non-member and unauthenticated direct discovery writes', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), `events/${EVENT_ID}/members`, 'event-editor'), { role: 'editor' })
      await setDoc(doc(context.firestore(), 'users', 'event-editor'), { role: 'user', isApproved: true })
      await setDoc(doc(context.firestore(), 'users', 'outsider'), { role: 'user', isApproved: true })
    })
    for (const uid of ['event-editor', 'outsider']) await assertFails(updateDoc(eventRefFor(uid), settings))
    await assertFails(updateDoc(doc(testEnv.unauthenticatedContext().firestore(), 'events', EVENT_ID), settings))
  })
})

describe('Event temporal contract', () => {
  async function seedTime(time) {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await updateDoc(doc(context.firestore(), 'events', EVENT_ID), {
        startDate: deleteField(), endDate: deleteField(), ...time,
      })
    })
  }

  const calendarTime = {
    timePrecision: 'date', startDay: '2026-10-10', endDay: '2026-10-12', timezone: 'Europe/Paris',
  }

  it('keeps a calendar Event administrable without altering its dates', async () => {
    await seedTime(calendarTime)
    await assertSucceeds(updateDoc(eventRefFor(ADMIN_UID), { name: 'Dates conservées' }))
    const data = (await getDoc(eventRefFor(ADMIN_UID))).data()
    assert.equal(data.startDay, '2026-10-10')
    assert.equal(data.endDay, '2026-10-12')
    assert.equal('startDate' in data, false)
  })

  it('keeps an exact-time Event administrable without reinterpreting its instants', async () => {
    await seedTime({
      timePrecision: 'datetime', timezone: 'America/New_York',
      startDate: new Date('2026-11-01T05:30:00Z'), endDate: new Date('2026-11-01T06:30:00Z'),
    })
    await assertSucceeds(updateDoc(eventRefFor(ADMIN_UID), { description: 'Heures conservées' }))
    const data = (await getDoc(eventRefFor(ADMIN_UID))).data()
    assert.equal(data.startDate.toDate().toISOString(), '2026-11-01T05:30:00.000Z')
    assert.equal(data.endDate.toDate().toISOString(), '2026-11-01T06:30:00.000Z')
  })

  it('requires the server for all temporal changes, including owner changes and deletions', async () => {
    await seedTime(calendarTime)
    for (const uid of [ADMIN_UID, OWNER_UID]) {
      for (const change of [
        { timePrecision: 'datetime' }, { timePrecision: deleteField() },
        { startDay: '2026-10-11' }, { endDay: '2026-10-13' },
        { timezone: 'America/New_York' }, { startDate: new Date() }, { endDate: new Date() },
      ]) {
        await assertFails(updateDoc(eventRefFor(uid), change))
      }
    }
  })

  it('rejects manifestly incoherent explicit modes on ordinary metadata updates', async () => {
    for (const time of [
      { ...calendarTime, timePrecision: 'unknown' },
      { ...calendarTime, startDay: '10/10/2026' },
      { ...calendarTime, endDay: '2026-10-09' },
      { ...calendarTime, endDay: deleteField() },
      { ...calendarTime, startDate: new Date() },
      { ...calendarTime, timezone: '' },
    ]) {
      await seedTime(time)
      await assertFails(updateDoc(eventRefFor(ADMIN_UID), { name: 'Interdit' }))
    }
  })
})

describe('exact-time Event invariants', () => {
  it('rejects inverted instants and competing calendar days', async () => {
    for (const time of [
      {
        startDate: new Date('2026-10-10T18:00:00Z'), endDate: new Date('2026-10-10T16:00:00Z'),
      },
      {
        startDate: new Date('2026-10-10T16:00:00Z'), endDate: new Date('2026-10-10T18:00:00Z'),
        startDay: '2026-10-10', endDay: '2026-10-10',
      },
    ]) {
      await testEnv.withSecurityRulesDisabled(async (context) => {
        await updateDoc(doc(context.firestore(), 'events', EVENT_ID), {
          timePrecision: 'datetime', timezone: 'Europe/Paris', ...time,
        })
      })
      await assertFails(updateDoc(eventRefFor(ADMIN_UID), { name: 'Interdit' }))
    }
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

describe('Event creation authority', () => {
  function directEventData(adminId) {
    return {
      name: 'Création directe interdite',
      slug: `direct-${adminId}`,
      adminId,
      status: 'draft',
      visibility: 'private',
      createdAt: new Date(),
      updatedAt: new Date(),
    }
  }

  it('denies a global user creating an Event directly', async () => {
    const userDb = testEnv.authenticatedContext(ADMIN_UID).firestore()

    await assertFails(setDoc(
      doc(userDb, 'events', 'direct-user-event'),
      directEventData(ADMIN_UID)
    ))
  })

  it('denies the global owner creating an Event directly', async () => {
    const ownerDb = testEnv.authenticatedContext(OWNER_UID).firestore()

    await assertFails(setDoc(
      doc(ownerDb, 'events', 'direct-owner-event'),
      directEventData(OWNER_UID)
    ))
  })
})
