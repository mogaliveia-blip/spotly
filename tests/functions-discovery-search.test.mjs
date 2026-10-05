import assert from 'node:assert/strict'
import { after, before, beforeEach, describe, it } from 'node:test'
import { createRequire } from 'node:module'
import { initializeTestEnvironment } from '@firebase/rules-unit-testing'
import searchModule from '../functions/lib/discovery-search.js'
import projectionModule from '../functions/lib/event-discovery-projection.js'
import queryModule from '../functions/lib/discovery-search-query.js'
import geoModule from '../functions/lib/discovery-geo.js'
import timeModule from '../functions/lib/discovery-time.js'

const requireFunctions = createRequire(new URL('../functions/package.json', import.meta.url))
const { initializeApp, deleteApp } = requireFunctions('firebase-admin/app')
const { getFirestore, Timestamp } = requireFunctions('firebase-admin/firestore')
const { searchDiscovery, executeDiscoverySearch } = searchModule
const { buildEventDiscoveryProjection } = projectionModule
const { buildDiscoverySearchQuery } = queryModule
const { geographicQueryRanges } = geoModule
const { discoveryCandidateWindow } = timeModule
const PROJECT_ID = 'demo-discovery-d1'
const now = Timestamp.fromDate(new Date('2026-09-12T12:00:00Z'))
const request = { area: { kind: 'radius', center: { lat: 48.85, lng: 2.35 } }, when: { kind: 'today' } }
let environment, app, db

before(async () => {
  assert.ok(process.env.FIRESTORE_EMULATOR_HOST, 'Local Firestore is mandatory')
  environment = await initializeTestEnvironment({ projectId: PROJECT_ID })
  app = initializeApp({ projectId: PROJECT_ID }, 'discovery-search-tests')
  db = getFirestore(app)
})
beforeEach(async () => environment.clearFirestore())
after(async () => { await environment.cleanup(); await deleteApp(app) })

function projection(id, overrides = {}) {
  return buildEventDiscoveryProjection(id, {
    name: 'Festival public', slug: 'festival-public', status: 'published', visibility: 'public',
    discoveryPosition: { lat: 48.85, lng: 2.35 }, typeId: 'festival', categoryId: 'culture',
    timePrecision: 'date', startDay: '2026-09-12', endDay: '2026-09-12', timezone: 'Europe/Paris',
    commercial: { offerCode: 'public', state: 'active' }, updatedAt: now, ...overrides,
  })
}
async function seed(id, overrides = {}, extras = {}) {
  const value = projection(id, overrides)
  assert.ok(value)
  await db.doc(`discovery_public/event_${id}`).set({ ...value, ...extras })
}
const search = (patch = {}) => searchDiscovery(db, { ...request, ...patch }, () => now)

describe('Discovery engine on local Firestore', () => {
  it('returns the reviewed radius candidate instead of a falsely exhaustive zero', async () => {
    await seed('radius-regression', { discoveryPosition: { lat: 0, lng: 0.00012 } })
    const result = await search({ area: { kind: 'radius', center: { lat: 0, lng: -0.2247 } } })
    assert.deepEqual(result.results.map((r) => r.sourceId), ['radius-regression'])
    assert.ok(Math.abs(result.results[0].distanceMeters - 24_998.843408229695) < 1e-8)
    assert.deepEqual(result.meta, { complete: true, truncated: false, partialFailure: false, returnedCount: 1 })
  })
  it('returns the reviewed flat-bounds candidate with unchanged exact rectangle filtering', async () => {
    await seed('bounds-regression', { discoveryPosition: { lat: 0, lng: 0.00011 } })
    await seed('just-outside', { discoveryPosition: { lat: 0, lng: 0.00012001 } })
    const result = await search({ area: { kind: 'bounds', south: -1e-8, north: 1e-8, west: -0.44952, east: 0.00012 } })
    assert.deepEqual(result.results.map((r) => r.sourceId), ['bounds-regression'])
    assert.equal('distanceMeters' in result.results[0], false)
    assert.deepEqual(result.meta, { complete: true, truncated: false, partialFailure: false, returnedCount: 1 })
  })
  it('works from projections alone, without any Event, member or Point source', async () => {
    await seed('standalone', {}, { adminId: 'private', commercial: 'private', privateAccess: 'private' })
    assert.equal((await db.collection('events').get()).empty, true)
    const result = await search()
    assert.equal(result.results.length, 1)
    assert.equal(result.results[0].id, 'event_standalone')
    assert.equal(result.meta.complete, true)
    for (const key of ['adminId', 'commercial', 'privateAccess', 'updatedAt', 'geohash']) assert.equal(key in result.results[0], false)
    assert.equal(typeof result.results[0].windowStartAt.toDate, 'undefined')
    assert.equal((await db.collection('events').get()).empty, true)
  })
  it('applies category, types OR and tags AND to actual queried projections', async () => {
    await seed('festival', { tags: ['family', 'free'] })
    await seed('concert', { typeId: 'concert', tags: ['family', 'free'] })
    await seed('trail', { typeId: 'trail', tags: ['family', 'free'] })
    await seed('missing-tag', { tags: ['family'] })
    await seed('wrong-category', { categoryId: 'music', tags: ['family', 'free'] })
    const result = await search({ categoryId: 'culture', typeIds: ['festival', 'concert'], tags: ['family', 'free'] })
    assert.deepEqual(result.results.map((r) => r.sourceId), ['concert', 'festival'])
    assert.equal(result.meta.complete, true)
  })
  it('queries Now as datetime, retaining exact stored microseconds and excluding date-only Events', async () => {
    await seed('date')
    const start = new Timestamp(now.seconds, 0)
    const end = new Timestamp(now.seconds + 100, 987654000)
    await seed('datetime', { timePrecision: 'datetime', startDay: undefined, endDay: undefined, startDate: start, endDate: end })
    const result = await search({ categoryId: 'culture', when: { kind: 'now' } })
    assert.deepEqual(result.results.map((r) => r.sourceId), ['datetime'])
    assert.deepEqual(result.results[0].windowEndAt, { seconds: end.seconds, nanoseconds: end.nanoseconds })
    assert.equal('startDay' in result.results[0], false)
  })
  it('returns an actual exhausted zero for old or distant candidates', async () => {
    await seed('historical', { startDay: '2000-01-01', endDay: '2000-01-02' })
    await seed('distant', { discoveryPosition: { lat: 1, lng: 2 } })
    const result = await search()
    assert.deepEqual(result.meta, { complete: true, truncated: false, partialFailure: false, returnedCount: 0 })
  })
  it('filters bounds precisely, including the antimeridian, and omits distance', async () => {
    for (const [id, lng] of [['east', 179.9], ['west', -179.9], ['outside', 179]]) {
      await seed(id, { discoveryPosition: { lat: 0, lng } })
    }
    const result = await search({ area: { kind: 'bounds', north: 0.1, south: -0.1, west: 179.8, east: -179.8 } })
    assert.deepEqual(result.results.map((r) => r.sourceId), ['east', 'west'])
    assert.equal(result.meta.complete, true)
    assert.ok(result.results.every((r) => !('distanceMeters' in r)))
  })
  it('does not lose a very narrow rectangle because of persisted geohash precision', async () => {
    await seed('tiny')
    const result = await search({ area: { kind: 'bounds', south: 48.85 - 1e-9, north: 48.85 + 1e-9, west: 2.35 - 1e-9, east: 2.35 + 1e-9 } })
    assert.deepEqual(result.results.map((r) => r.sourceId), ['tiny'])
  })
  it('keeps dense searches bounded and truthfully truncated', async () => {
    const batch = db.batch()
    for (let i = 0; i < 400; i++) batch.set(db.doc(`discovery_public/event_dense-${i}`), projection(`dense-${i}`))
    await batch.commit()
    let reads = 0
    const instrumented = {
      collection(name) {
        assert.equal(name, 'discovery_public')
        function wrap(query) {
          return {
            where: (...args) => wrap(query.where(...args)), orderBy: (...args) => wrap(query.orderBy(...args)),
            limit: (limit) => { assert.ok(limit <= 100); return wrap(query.limit(limit)) },
            startAfter: (...args) => wrap(query.startAfter(...args)),
            get: async () => { const result = await query.get(); reads += result.size; return result },
          }
        }
        return wrap(db.collection(name))
      },
    }
    const result = await searchDiscovery(instrumented, request, () => now)
    assert.ok(reads <= 500)
    assert.equal(result.results.length, 100)
    assert.equal(result.meta.complete, false)
    assert.equal(result.meta.truncated, true)
  })
  it('demonstrates a result ceiling independently of candidate interruption with an exhausted real query', async () => {
    const batch = db.batch()
    for (let i = 0; i < 130; i++) batch.set(db.doc(`discovery_public/event_cap-${i}`), projection(`cap-${i}`))
    await batch.commit()
    const range = ['u09', 'u0~']
    let readCount = 0
    const result = await executeDiscoverySearch(request, now, [range], async (range, limit, cursor) => {
      const snapshot = await buildDiscoverySearchQuery(db, request, range, discoveryCandidateWindow(request.when, now), limit, cursor).get()
      readCount += snapshot.size
      return { documents: snapshot.docs.map((d) => ({ id: d.id, data: d.data() })), cursor: snapshot.docs.at(-1) }
    })
    assert.equal(readCount, 130)
    assert.deepEqual(result.meta, { complete: false, truncated: true, partialFailure: false, returnedCount: 100 })
  })
  it('uses real queries for surviving ranges while reporting a controlled injected range failure', async () => {
    await seed('survivor', { discoveryPosition: { lat: 0, lng: 179.9 } })
    const localRequest = { ...request, area: { kind: 'radius', center: { lat: 0, lng: 179.95 } } }
    const ranges = geographicQueryRanges(localRequest.area)
    assert.ok(ranges.length > 1)
    const result = await executeDiscoverySearch(localRequest, now, ranges, async (range, limit, cursor) => {
      if (range === ranges[0]) throw new Error('injected backend failure')
      const snapshot = await buildDiscoverySearchQuery(db, localRequest, range, discoveryCandidateWindow(localRequest.when, now), limit, cursor).get()
      return { documents: snapshot.docs.map((d) => ({ id: d.id, data: d.data() })), cursor: snapshot.docs.at(-1) }
    })
    assert.equal(result.meta.complete, false)
    assert.equal(result.meta.partialFailure, true)
    assert.equal(JSON.stringify(result).includes('injected'), false)
  })
  it('refuses forbidden parameters before issuing reads', async () => {
    const forbiddenDb = { collection() { throw new Error('No query expected') } }
    for (const patch of [{ radiusMeters: 500_000 }, { categoryId: 'unknown' }, { tags: ['unknown'] }, { when: { kind: 'date', day: '2026-02-30' } }]) {
      await assert.rejects(searchDiscovery(forbiddenDb, { ...request, ...patch }, () => now), { code: 'invalid-argument' })
    }
  })
})
