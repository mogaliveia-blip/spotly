import assert from 'node:assert/strict'
import { before, after, beforeEach, describe, it } from 'node:test'
import { createRequire } from 'node:module'
import { initializeTestEnvironment } from '@firebase/rules-unit-testing'
import { initializeApp as initializeClientApp, deleteApp as deleteClientApp } from 'firebase/app'
import { getFunctions, connectFunctionsEmulator, httpsCallable } from 'firebase/functions'
import projectionModule from '../functions/lib/event-discovery-projection.js'

const requireFunctions = createRequire(new URL('../functions/package.json', import.meta.url))
const { initializeApp, deleteApp } = requireFunctions('firebase-admin/app')
const { getFirestore, Timestamp } = requireFunctions('firebase-admin/firestore')
const PROJECT_ID = 'demo-discovery-d1'
let environment, app, clientApp, db, callable
const request = { area: { kind: 'radius', center: { lat: 48.85, lng: 2.35 } }, when: { kind: 'date', day: '2026-09-12' } }

before(async () => {
  assert.ok(process.env.FIRESTORE_EMULATOR_HOST, 'Local Firestore is mandatory')
  environment = await initializeTestEnvironment({ projectId: PROJECT_ID })
  app = initializeApp({ projectId: PROJECT_ID }, 'discovery-callable-admin')
  db = getFirestore(app)
  clientApp = initializeClientApp({ projectId: PROJECT_ID, apiKey: 'demo-api-key' }, 'discovery-anonymous-client')
  const functions = getFunctions(clientApp, 'europe-west1')
  connectFunctionsEmulator(functions, '127.0.0.1', 5001)
  callable = httpsCallable(functions, 'searchDiscovery')
})
beforeEach(async () => environment.clearFirestore())
after(async () => { await environment.cleanup(); await deleteApp(app); await deleteClientApp(clientApp) })

describe('Public Discovery callable protocol', () => {
  for (const reservedValue of [null, 0, 'x', { lat: 0, lng: 0 }]) {
    it(`rejects an explicit center __proto__ key with value ${JSON.stringify(reservedValue)}`, async () => {
      const response = await fetch('http://127.0.0.1:5001/demo-discovery-d1/europe-west1/searchDiscovery', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: `{"data":{"area":{"kind":"radius","center":{"lat":0,"lng":0,"__proto__":${JSON.stringify(reservedValue)}}},"when":{"kind":"now"}}}`,
      })
      assert.equal(response.status, 400)
      const data = await response.json()
      assert.equal(data.error.status, 'INVALID_ARGUMENT')
      assert.equal(data.error.details.reason, 'INVALID_DISCOVERY_REQUEST')
    })
  }
  it('rejects reserved keys at the request, area, bounds and when boundaries', async () => {
    const bounds = { ...request, area: { kind: 'bounds', north: 48.9, south: 48.8, east: 2.4, west: 2.3 } }
    for (const [payload, path] of [[request, []], [request, ['area']], [request, ['when']], [bounds, ['area']]]) {
      const raw = JSON.parse(JSON.stringify(payload))
      const target = path.reduce((value, key) => value[key], raw)
      Object.defineProperty(target, '__proto__', { value: null, enumerable: true })
      const response = await fetch('http://127.0.0.1:5001/demo-discovery-d1/europe-west1/searchDiscovery', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ data: raw }),
      })
      assert.equal(response.status, 400)
      assert.equal((await response.json()).error.status, 'INVALID_ARGUMENT')
    }
  })
  it('rejects the raw JSON __proto__ payload with INVALID_ARGUMENT instead of an internal GeoFire error', async () => {
    const response = await fetch('http://127.0.0.1:5001/demo-discovery-d1/europe-west1/searchDiscovery', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: '{"data":{"area":{"kind":"radius","center":{"__proto__":{"lat":0,"lng":0},"foo":1,"bar":2}},"when":{"kind":"now"}}}',
    })
    assert.equal(response.status, 400)
    const data = await response.json()
    assert.equal(data.error.status, 'INVALID_ARGUMENT')
    assert.equal(data.error.details.reason, 'INVALID_DISCOVERY_REQUEST')
    assert.equal(JSON.stringify(data).includes('GeoFire'), false)
  })
  it('allows an anonymous visitor, with explicit JSON timestamps and no source Event', async () => {
    const source = {
      name: 'Festival public', slug: 'festival-public', status: 'published', visibility: 'public',
      discoveryPosition: { lat: 48.85, lng: 2.35 }, typeId: 'festival', categoryId: 'music',
      timePrecision: 'datetime', timezone: 'Europe/Paris',
      startDate: new Timestamp(Date.parse('2026-09-12T12:00:00Z') / 1000, 123456000),
      endDate: new Timestamp(Date.parse('2026-09-12T14:00:00Z') / 1000, 987654000),
      commercial: { offerCode: 'public', state: 'active' }, updatedAt: Timestamp.fromMillis(0),
    }
    const projection = projectionModule.buildEventDiscoveryProjection('anonymous', source)
    await db.doc('discovery_public/event_anonymous').set({ ...projection, adminId: 'secret', commercial: 'secret', tokens: 'secret' })
    const { data } = await callable({ ...request, categoryId: null, typeIds: ['festival'], tags: [] })
    assert.equal(data.meta.complete, true)
    assert.equal(data.meta.returnedCount, 1)
    assert.equal(data.results[0].windowEndAt.nanoseconds, 987654000)
    assert.equal(data.results[0].windowEndAt.toDate, undefined)
    assert.deepEqual(Object.keys(data.results[0]).sort(), [
      'id', 'contentType', 'sourceId', 'title', 'slug', 'position', 'typeId', 'categoryId',
      'timePrecision', 'timezone', 'windowStartAt', 'windowEndAt', 'distanceMeters',
    ].sort())
    assert.equal((await db.collection('events').get()).empty, true)
  })
  it('reports a true exhaustive empty result', async () => {
    const { data } = await callable(request)
    assert.deepEqual(data, { results: [], meta: { complete: true, truncated: false, partialFailure: false, returnedCount: 0 } })
  })
  it('returns callable validation errors without accepting client-owned limits', async () => {
    for (const payload of [
      { ...request, limit: 1000 }, { ...request, categoryId: 'unknown' },
      { ...request, when: { kind: 'date', day: '2026-02-30' } },
      { ...request, area: { kind: 'radius', center: { lat: '48.85', lng: 2.35 } } },
    ]) await assert.rejects(callable(payload), { code: 'functions/invalid-argument' })
  })
  it('returns a stable zone-too-large reason', async () => {
    await assert.rejects(callable({ ...request, area: { kind: 'bounds', south: -80, north: 80, west: -180, east: 180 } }),
      (error) => error.code === 'functions/invalid-argument' && error.details.reason === 'DISCOVERY_AREA_TOO_LARGE')
  })
})
