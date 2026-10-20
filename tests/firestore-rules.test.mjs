import assert from 'node:assert/strict'
import { after, before, beforeEach, describe, it } from 'node:test'
import { readFileSync } from 'node:fs'

import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} from '@firebase/rules-unit-testing'
import { collection, deleteDoc, deleteField, doc, getDoc, getDocs, limit, query, runTransaction, setDoc, updateDoc, where, writeBatch } from 'firebase/firestore'

const PROJECT_ID = 'un-instant-ici-rules-test'
const EVENT_ID = 'event-sensitive-fields'
const ADMIN_UID = 'event-admin'
const EDITOR_UID = 'event-editor'
const LEGACY_UID = 'legacy-admin'
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
      setDoc(doc(db, 'users', EDITOR_UID), { role: 'user', isApproved: true }),
      setDoc(doc(db, 'users', LEGACY_UID), { role: 'user', isApproved: true }),
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
      setDoc(doc(db, `events/${EVENT_ID}/members`, EDITOR_UID), {
        uid: EDITOR_UID, role: 'editor', joinedAt: new Date('2026-01-01T00:00:00.000Z'),
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
  it('allows an Event admin to update unprojected metadata', async () => {
    await assertSucceeds(updateDoc(eventRefFor(ADMIN_UID), { description: 'Nouvelles informations' }))
  })

  it('requires server validation even for historical temporal fields', async () => {
    await assertFails(updateDoc(eventRefFor(ADMIN_UID), {
      endDate: new Date('2026-09-20T00:00:00.000Z'),
    }))
  })

  it('requires server synchronization for visibility', async () => {
    await assertFails(updateDoc(eventRefFor(ADMIN_UID), { visibility: 'private' }))
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
      capabilities: { partnershipEnabled: true },
    }))

    const snapshot = await assertSucceeds(getDoc(ownerEventRef))
    assert.equal(snapshot.data().capabilities.partnershipEnabled, true)
  })
})

describe('Platform-owned Point partnerships', () => {
  const sponsor = { enabled: true, level: 'premium', priority: 7 }
  const point = { title: 'Point test', description: 'Description du Point', categoryId: 'parking',
    location: { lat: 48.85, lng: 2.35 }, galleryUrls: [], averageRating: 0, reviewCount: 0 }
  const paths = ['pois', 'pois_public']

  const pointRef = (uid, kind, id = 'point') =>
    doc(testEnv.authenticatedContext(uid).firestore(), `events/${EVENT_ID}/${kind}`, id)

  async function seedPoint(withSponsor = true) {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore()
      const data = withSponsor ? { ...point, sponsor } : point
      await Promise.all(paths.map((kind) => setDoc(doc(db, `events/${EVENT_ID}/${kind}`, 'point'), data)))
    })
  }

  it('allows an ordinary organizer creation of both Point copies in one transaction', async () => {
    const db = testEnv.authenticatedContext(ADMIN_UID).firestore()
    const batch = writeBatch(db)
    for (const kind of paths) batch.set(doc(db, `events/${EVENT_ID}/${kind}`, 'created'), point)
    await assertSucceeds(batch.commit())
    for (const kind of paths) {
      assert.equal((await assertSucceeds(getDoc(doc(db, `events/${EVENT_ID}/${kind}`, 'created')))).exists(), true)
    }
  })

  it('keeps sponsorship during ordinary transactional updates and removes it from both copies for the owner', async () => {
    await seedPoint()
    const adminDb = testEnv.authenticatedContext(ADMIN_UID).firestore()
    const privateRef = doc(adminDb, `events/${EVENT_ID}/pois`, 'point')
    const publicRef = doc(adminDb, `events/${EVENT_ID}/pois_public`, 'point')
    await assertSucceeds(runTransaction(adminDb, async (tx) => {
      await tx.get(privateRef)
      tx.update(privateRef, { title: 'Titre ordinaire' })
      tx.set(publicRef, { title: 'Titre ordinaire' }, { merge: true })
    }))
    for (const ref of [privateRef, publicRef]) {
      const data = (await assertSucceeds(getDoc(ref))).data()
      assert.equal(data.title, 'Titre ordinaire')
      assert.deepEqual(data.sponsor, sponsor)
    }

    const ownerDb = testEnv.authenticatedContext(OWNER_UID).firestore()
    const ownerPrivateRef = doc(ownerDb, `events/${EVENT_ID}/pois`, 'point')
    const ownerPublicRef = doc(ownerDb, `events/${EVENT_ID}/pois_public`, 'point')
    await assertSucceeds(runTransaction(ownerDb, async (tx) => {
      await tx.get(ownerPrivateRef)
      tx.update(ownerPrivateRef, { sponsor: deleteField() })
      tx.set(ownerPublicRef, { sponsor: deleteField() }, { merge: true })
    }))
    for (const ref of [ownerPrivateRef, ownerPublicRef]) {
      assert.equal((await assertSucceeds(getDoc(ref))).data().sponsor, undefined)
    }
  })

  for (const kind of paths) {
    it(`denies organizer creation of sponsor in ${kind}, while allowing an ordinary Point`, async () => {
      for (const uid of [ADMIN_UID, EDITOR_UID]) {
        await assertFails(setDoc(pointRef(uid, kind, `sponsored-${uid}`), { ...point, sponsor }))
        await assertSucceeds(setDoc(pointRef(uid, kind, `ordinary-${uid}`), point))
      }
    })

    it(`denies direct, nested, removed and replacement sponsor changes in ${kind}`, async () => {
      await seedPoint()
      for (const uid of [ADMIN_UID, EDITOR_UID]) {
        const ref = pointRef(uid, kind)
        await assertFails(updateDoc(ref, { sponsor: { ...sponsor, priority: 9 } }))
        await assertFails(updateDoc(ref, { 'sponsor.enabled': false }))
        await assertFails(updateDoc(ref, { sponsor: deleteField() }))
        await assertFails(setDoc(ref, { ...point, title: 'Remplacement' }))
        await assertSucceeds(updateDoc(ref, { title: `Titre ${uid}` }))
        await assertSucceeds(setDoc(ref, { ...point, title: `Remplacement ${uid}`, sponsor }))
        const saved = await assertSucceeds(getDoc(ref))
        assert.deepEqual(saved.data().sponsor, sponsor)
      }
    })

    it(`protects sponsored deletion in ${kind} but permits ordinary deletion`, async () => {
      await seedPoint()
      for (const uid of [ADMIN_UID, EDITOR_UID]) {
        await assertFails(deleteDoc(pointRef(uid, kind)))
      }
      await testEnv.withSecurityRulesDisabled(async (context) => {
        await setDoc(doc(context.firestore(), `events/${EVENT_ID}/${kind}`, 'ordinary'), point)
      })
      await assertSucceeds(deleteDoc(pointRef(ADMIN_UID, kind, 'ordinary')))
      await assertSucceeds(deleteDoc(pointRef(OWNER_UID, kind)))
    })
  }

  it('also protects partnership data from the historical adminId authority', async () => {
    await seedPoint()
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await updateDoc(doc(context.firestore(), 'events', EVENT_ID), { adminId: LEGACY_UID })
    })
    for (const kind of paths) {
      await assertFails(setDoc(pointRef(LEGACY_UID, kind, 'legacy-sponsored'), { ...point, sponsor }))
      await assertSucceeds(setDoc(pointRef(LEGACY_UID, kind, 'legacy-ordinary'), point))
      await assertFails(updateDoc(pointRef(LEGACY_UID, kind), { 'sponsor.priority': 100 }))
      await assertFails(deleteDoc(pointRef(LEGACY_UID, kind)))
      await assertSucceeds(updateDoc(pointRef(LEGACY_UID, kind), { title: 'Titre ordinaire' }))
    }
  })

  it('prevents an organizer from recreating the public copy without an existing partnership', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), `events/${EVENT_ID}/pois`, 'point'), { ...point, sponsor })
    })
    await assertFails(setDoc(pointRef(ADMIN_UID, 'pois_public'), point))
  })

  it('lets the owner activate, deactivate while keeping values, and explicitly remove both copies', async () => {
    await seedPoint(false)
    const ownerDb = testEnv.authenticatedContext(OWNER_UID).firestore()
    const refs = paths.map((kind) => doc(ownerDb, `events/${EVENT_ID}/${kind}`, 'point'))

    for (const nextSponsor of [sponsor, { ...sponsor, enabled: false }]) {
      const batch = writeBatch(ownerDb)
      refs.forEach((ref) => batch.update(ref, { sponsor: nextSponsor }))
      await assertSucceeds(batch.commit())
      for (const ref of refs) {
        const saved = await assertSucceeds(getDoc(ref))
        assert.deepEqual(saved.data().sponsor, nextSponsor)
      }
      if (!nextSponsor.enabled) {
        for (const kind of paths) await assertFails(deleteDoc(pointRef(ADMIN_UID, kind)))
      }
    }

    const removal = writeBatch(ownerDb)
    refs.forEach((ref) => removal.update(ref, { sponsor: deleteField() }))
    await assertSucceeds(removal.commit())
    for (const ref of refs) {
      assert.equal((await assertSucceeds(getDoc(ref))).data().sponsor, undefined)
    }
  })

  it('keeps reviews intact when a sponsored Point deletion is denied', async () => {
    await seedPoint()
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), `events/${EVENT_ID}/pois/point/reviews/review`), { comment: 'Avis conservé' })
    })
    const adminDb = testEnv.authenticatedContext(ADMIN_UID).firestore()
    const deletion = writeBatch(adminDb)
    deletion.delete(doc(adminDb, `events/${EVENT_ID}/pois`, 'point'))
    deletion.delete(doc(adminDb, `events/${EVENT_ID}/pois_public`, 'point'))
    await assertFails(deletion.commit())
    const review = await assertSucceeds(getDoc(doc(adminDb, `events/${EVENT_ID}/pois/point/reviews/review`)))
    assert.equal(review.exists(), true)
  })

  it('keeps an existing partnership readable after its Event becomes public', async () => {
    await seedPoint()
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await updateDoc(doc(context.firestore(), 'events', EVENT_ID), {
        status: 'published', visibility: 'public',
        commercial: { offerCode: 'public', state: 'active', offerVersion: 1 },
      })
    })
    const visitorDb = testEnv.unauthenticatedContext().firestore()
    for (const kind of paths) {
      const publicRef = doc(visitorDb, `events/${EVENT_ID}/${kind}`, 'point')
      assert.deepEqual((await assertSucceeds(getDoc(publicRef))).data().sponsor, sponsor)
      await assertSucceeds(updateDoc(pointRef(ADMIN_UID, kind), { title: 'Point mis à jour' }))
      assert.deepEqual((await assertSucceeds(getDoc(publicRef))).data().sponsor, sponsor)
    }
  })
})

describe('Commercial visitor access', () => {
  async function setPublication(offerCode, state, visibility = 'public') {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await updateDoc(doc(context.firestore(), 'events', EVENT_ID), {
        status: 'published', visibility,
        commercial: { offerCode, state, offerVersion: 1, grantedAt: new Date('2026-01-01T00:00:00.000Z') },
      })
      await setDoc(doc(context.firestore(), `events/${EVENT_ID}/pois`, 'point'), { categoryId: 'parking' })
    })
  }

  it('allows only active public authorization to visitors and preserves admin access', async () => {
    const publicDb = testEnv.unauthenticatedContext().firestore()
    const eventRef = doc(publicDb, 'events', EVENT_ID)
    const pointRef = doc(publicDb, `events/${EVENT_ID}/pois`, 'point')
    for (const [offer, state, allowed] of [
      ['free_draft', 'active', false], ['private', 'active', false],
      ['public', 'revoked', false], ['public', 'active', true],
    ]) {
      await setPublication(offer, state)
      if (allowed) {
        await assertSucceeds(getDoc(eventRef))
        await assertSucceeds(getDoc(pointRef))
      } else {
        await assertFails(getDoc(eventRef))
        await assertFails(getDoc(pointRef))
      }
      await assertSucceeds(getDoc(eventRefFor(ADMIN_UID)))
    }
  })

  it('ends private visitor grants on suspension while retaining the Point', async () => {
    await setPublication('private', 'active', 'private')
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore()
      await setDoc(doc(db, `events/${EVENT_ID}/privateLinks`, 'link'), {
        expiresAt: new Date('2099-01-01T00:00:00.000Z'),
      })
      await setDoc(doc(db, `events/${EVENT_ID}/privateAccess`, 'visitor'), {
        linkId: 'link', expiresAt: new Date('2099-01-01T00:00:00.000Z'),
      })
    })
    const visitorDb = testEnv.authenticatedContext('visitor').firestore()
    const privateEvent = doc(visitorDb, 'events', EVENT_ID)
    await assertSucceeds(getDoc(privateEvent))
    await setPublication('private', 'revoked', 'private')
    await assertFails(getDoc(privateEvent))
    await assertSucceeds(getDoc(eventRefFor(ADMIN_UID)))
    await assertSucceeds(getDoc(doc(testEnv.authenticatedContext(ADMIN_UID).firestore(), `events/${EVENT_ID}/pois`, 'point')))
  })

  it('supports the filtered public event query', async () => {
    await setPublication('public', 'active')
    const db = testEnv.unauthenticatedContext().firestore()
    const listed = query(collection(db, 'events'), where('status', '==', 'published'),
      where('visibility', '==', 'public'), where('commercial.offerCode', '==', 'public'),
      where('commercial.state', '==', 'active'))
    const result = await assertSucceeds(getDocs(listed))
    assert.equal(result.size, 1)
    const bySlug = query(collection(db, 'events'), where('slug', '==', 'event-de-test'),
      where('status', '==', 'published'), where('visibility', '==', 'public'),
      where('commercial.offerCode', '==', 'public'), where('commercial.state', '==', 'active'), limit(1))
    assert.equal((await assertSucceeds(getDocs(bySlug))).size, 1)
    await setPublication('public', 'revoked')
    assert.equal((await assertSucceeds(getDocs(listed))).size, 0)
    assert.equal((await assertSucceeds(getDocs(bySlug))).size, 0)
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
      await assertFails(setDoc(eventRefFor(uid), { ...withoutDiscovery, description: 'Remplacement involontaire' }))
    })

    it(`preserves discovery during allowed ${uid} metadata edits and unchanged document replacement`, async () => {
      await seedDiscovery()
      await assertSucceeds(updateDoc(eventRefFor(uid), { description: 'Informations modifiées' }))
      const existing = (await getDoc(eventRefFor(uid))).data()
      await assertSucceeds(setDoc(eventRefFor(uid), { ...existing, description: 'Champs conservés' }))
      const saved = (await getDoc(eventRefFor(uid))).data()
      for (const [key, value] of Object.entries(settings)) assert.deepEqual(saved[key], value)
    })
  }

  it('does not require discovery for ordinary historical Event administration', async () => {
    await assertSucceeds(updateDoc(eventRefFor(ADMIN_UID), { description: 'Historique administrable' }))
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
    await assertSucceeds(updateDoc(eventRefFor(ADMIN_UID), { description: 'Dates conservées' }))
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
      await assertFails(updateDoc(eventRefFor(ADMIN_UID), { description: 'Interdit' }))
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
      await assertFails(updateDoc(eventRefFor(ADMIN_UID), { description: 'Interdit' }))
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

describe('Discovery public authority and confidentiality', () => {
  const projectionId = `event_${EVENT_ID}`
  async function seedProjection() {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'discovery_public', projectionId), {
        contentType: 'event', sourceId: EVENT_ID, title: 'Public result',
      })
    })
  }

  it('allows anonymous and authenticated reads without reading the source Event', async () => {
    await seedProjection()
    // The source fixture is draft and unreadable to these clients; projection reads are independent.
    for (const context of [testEnv.unauthenticatedContext(), testEnv.authenticatedContext('visitor')]) {
      const db = context.firestore()
      await assertFails(getDoc(doc(db, 'events', EVENT_ID)))
      const result = await assertSucceeds(getDoc(doc(db, 'discovery_public', projectionId)))
      assert.equal(result.data().title, 'Public result')
      const results = await assertSucceeds(getDocs(query(collection(db, 'discovery_public'), limit(100))))
      assert.equal(results.size, 1)
      await assertFails(getDocs(query(collection(db, 'discovery_public'), limit(101))))
      await assertFails(getDocs(collection(db, 'discovery_public')))
    }
  })

  for (const uid of [ADMIN_UID, OWNER_UID, null]) {
    it(`denies all ${uid ?? 'anonymous'} client projection writes`, async () => {
      const db = (uid ? testEnv.authenticatedContext(uid) : testEnv.unauthenticatedContext()).firestore()
      await assertFails(setDoc(doc(db, 'discovery_public', 'event_new'), { title: 'Forbidden' }))
      await seedProjection()
      const reference = doc(db, 'discovery_public', projectionId)
      await assertFails(updateDoc(reference, { title: 'Forbidden' }))
      await assertFails(setDoc(reference, { title: 'Replacement' }))
      await assertFails(deleteDoc(reference))
    })
  }

  for (const uid of [ADMIN_UID, OWNER_UID]) {
    it(`requires server source updates and deletion for ${uid}, preserving ordinary metadata access`, async () => {
      const fields = {
        name: 'New public identity', slug: 'changed-slug', status: 'published', visibility: 'private',
        eventCoverUrl: 'https://example.test/cover.jpg',
        commercial: { offerCode: 'public', state: 'active', offerVersion: 1, grantedAt: new Date() },
        deletionRequestedBy: uid, deletionRequestedAt: new Date(),
      }
      for (const [key, value] of Object.entries(fields)) {
        await assertFails(updateDoc(eventRefFor(uid), { [key]: value }))
      }
      await testEnv.withSecurityRulesDisabled(async (context) => {
        await updateDoc(doc(context.firestore(), 'events', EVENT_ID), fields)
      })
      for (const key of Object.keys(fields)) await assertFails(updateDoc(eventRefFor(uid), { [key]: deleteField() }))
      await assertFails(updateDoc(eventRefFor(uid), { 'commercial.state': 'revoked' }))
      await assertFails(updateDoc(eventRefFor(uid), { 'commercial.offerCode': 'private' }))
      await assertFails(deleteDoc(eventRefFor(uid)))
      await assertSucceeds(updateDoc(eventRefFor(uid), { description: 'Still administrable', city: 'Paris' }))
      const saved = (await getDoc(eventRefFor(uid))).data()
      for (const key of Object.keys(fields)) assert.ok(key in saved, key)
      const { name, ...withoutName } = saved
      await assertFails(setDoc(eventRefFor(uid), withoutName))
    })
  }
})
