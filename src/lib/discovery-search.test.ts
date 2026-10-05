import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { createRequire } from 'node:module'
import type { Firestore } from 'firebase-admin/firestore'
import {
  allocateRangeBudgets, executeDiscoverySearch, searchDiscovery, validateSearchDiscoveryRequest, projectionResultDto,
} from '../../functions/src/discovery-search'
import type { CandidateDocument, RangePageReader } from '../../functions/src/discovery-search'
import type { SearchDiscoveryRequest } from '../../functions/src/discovery-search-contract'
import { instantFromMillis, hasReservedDiscoveryKey } from '../../functions/src/discovery-search-contract'
import type { GeohashRange } from '../../functions/src/discovery-geo'

const now = instantFromMillis(Date.parse('2026-09-12T12:00:00Z'))
const request: SearchDiscoveryRequest = { area: { kind: 'radius', center: { lat: 48.85, lng: 2.35 } }, when: { kind: 'today' } }
const ranges: GeohashRange[] = [['a', 'b'], ['c', 'd']]
function doc(id = 'test', overrides: Record<string, unknown> = {}): CandidateDocument {
  return { id: `event_${id}`, data: {
    contentType: 'event', sourceId: id, title: 'Festival test', slug: 'festival-test',
    position: { lat: 48.85, lng: 2.35 }, typeId: 'festival', categoryId: 'culture',
    timePrecision: 'date', timezone: 'Europe/Paris', startDay: '2026-09-12', endDay: '2026-09-12',
    windowStartAt: instantFromMillis(Date.parse('2026-09-11T22:00:00Z')),
    windowEndAt: instantFromMillis(Date.parse('2026-09-12T21:59:59Z')), ...overrides,
  } }
}
function reader(documents: CandidateDocument[], readCounts: number[] = []): RangePageReader {
  return async (_range, limit, cursor) => {
    const start = cursor as number || 0
    const page = documents.slice(start, start + limit)
    readCounts.push(page.length)
    return { documents: page, cursor: start + page.length }
  }
}
describe('Discovery request authority', () => {
  it('finds reserved keys in original JSON even when the Firebase decoder loses them', () => {
    const require = createRequire(import.meta.url)
    const { decode } = require('../../functions/node_modules/firebase-functions/lib/common/providers/https.js')
    for (const value of [null, 0, 'x', { lat: 0, lng: 0 }]) {
      const raw = JSON.parse(`{"area":{"kind":"radius","center":{"lat":0,"lng":0,"__proto__":${JSON.stringify(value)}}},"when":{"kind":"now"}}`)
      assert.equal(hasReservedDiscoveryKey(raw), true)
      if (typeof value !== 'object' || value === null) {
        assert.doesNotThrow(() => validateSearchDiscoveryRequest(decode(raw)))
      }
    }
  })
  it('checks nested own keys, without scanning text values or executing accessors', () => {
    for (const raw of [
      '{"__proto__":null}', '{"area":{"__proto__":0}}',
      '{"when":{"__proto__":"x"}}', '{"area":{"north":1,"south":0,"east":1,"west":0,"__proto__":null}}',
      '{"nested":[{"value":{"__proto__":null}}]}', '{"\\u005f\\u005fproto\\u005f\\u005f":null}',
    ]) assert.equal(hasReservedDiscoveryKey(JSON.parse(raw)), true)
    assert.equal(hasReservedDiscoveryKey({ text: '__proto__', values: ['__proto__'], value: null }), false)
    let reads = 0
    assert.equal(hasReservedDiscoveryKey({ get value() { reads++; return '__proto__' } }), false)
    assert.equal(reads, 0)
    const valid = { ...request, categoryId: null, typeIds: ['festival'], tags: ['family'] }
    assert.equal(hasReservedDiscoveryKey(valid), false)
    assert.doesNotThrow(() => validateSearchDiscoveryRequest(valid))
  })
  it('rejects inherited coordinates after the actual callable decoder, before geographic use', async () => {
    const require = createRequire(import.meta.url)
    const { decode } = require('../../functions/node_modules/firebase-functions/lib/common/providers/https.js')
    const decoded = decode(JSON.parse('{"area":{"kind":"radius","center":{"__proto__":{"lat":0,"lng":0},"foo":1,"bar":2}},"when":{"kind":"now"}}'))
    await assert.rejects(searchDiscovery({ collection() { throw new Error('No reads permitted') } } as unknown as Firestore,
      decoded, () => now), { code: 'invalid-argument' })
  })
  it('requires own data fields and exact keys at every public request object boundary', () => {
    const valid = () => ({ area: { kind: 'radius', center: { lat: 0, lng: 0 } }, when: { kind: 'now' } })
    const radius = valid()
    assert.equal(validateSearchDiscoveryRequest(radius).area.kind, 'radius')
    const variants = [
      Object.create(radius),
      { ...valid(), area: Object.create(radius.area) },
      { ...valid(), area: { ...radius.area, center: Object.create(radius.area.center) } },
      { ...valid(), when: Object.create(radius.when) },
      { ...valid(), area: { ...radius.area, center: { lat: 0, lng: 0, surprise: 1 } } },
      { ...valid(), area: { ...radius.area, surprise: 1 } },
      { ...valid(), when: { kind: 'now', day: '2026-09-12' } },
      { ...valid(), surprise: 1 },
      { ...valid(), area: Object.assign(Object.create({ north: 1 }), { kind: 'bounds', south: 0, east: 1, west: 0 }) },
      { ...valid(), area: { ...radius.area, center: { lat: 0, lng: Infinity } } },
      { ...valid(), typeIds: Array(1) },
      { ...valid(), tags: Array(1) },
      { ...valid(), typeIds: Object.setPrototypeOf(['festival'], { 0: 'festival' }) },
    ]
    for (const value of variants) assert.throws(() => validateSearchDiscoveryRequest(value), { code: 'invalid-argument' })
    let accessorReads = 0
    const accessor = { ...radius, get when() { accessorReads++; return { kind: 'now' } } }
    assert.throws(() => validateSearchDiscoveryRequest(accessor), { code: 'invalid-argument' })
    assert.equal(accessorReads, 0)
    assert.equal(validateSearchDiscoveryRequest(Object.assign(Object.create(null), radius)).area.kind, 'radius')
  })
  it('normalizes controlled filters and copies the asynchronous search context', () => {
    const raw = { ...request, typeIds: ['concert', 'festival', 'festival'], tags: ['free', 'free'] }
    const validated = validateSearchDiscoveryRequest(raw)
    assert.deepEqual(validated.typeIds, ['concert', 'festival'])
    assert.deepEqual(validated.tags, ['free'])
    raw.area = { kind: 'radius', center: { lat: 0, lng: 0 } }
    assert.deepEqual(validated.area, request.area)
  })
  for (const [label, patch] of Object.entries({
    radiusOverride: { area: { ...request.area, radiusMeters: 500_000 } },
    limitOverride: { limit: 1000 }, budgetOverride: { candidateBudget: 10_000 },
    badPosition: { area: { kind: 'radius', center: { lat: '48.85', lng: 2.35 } } },
    nan: { area: { kind: 'radius', center: { lat: NaN, lng: 0 } } },
    invalidDate: { when: { kind: 'date', day: '2026-02-30' } },
    unknownCategory: { categoryId: 'parking' }, unknownType: { typeIds: ['unknown'] },
    unknownTag: { tags: ['custom'] }, tagOverflow: { tags: Array(4).fill('free') },
    typeOverflow: { typeIds: Array(6).fill('concert') },
    invalidBounds: { area: { kind: 'bounds', north: 0, south: 1, west: 0, east: 1 } },
  })) it(`rejects ${label}`, () => assert.throws(() => validateSearchDiscoveryRequest({ ...request, ...patch }), { code: 'invalid-argument' }))
  it('returns a stable reason for excessive zones', () => {
    assert.throws(() => validateSearchDiscoveryRequest({ ...request, area: { kind: 'bounds', south: -1, north: 1, west: -180, east: 180 } }),
      { code: 'invalid-argument', message: 'DISCOVERY_AREA_TOO_LARGE' })
  })
})
describe('Bounded Discovery search', () => {
  it('allocates all 500 reads before fanout and never allocates 9 × 100', () => {
    for (const count of [1, 2, 9, 18]) {
      const allocation = allocateRangeBudgets(count)
      assert.equal(allocation.reduce((a, b) => a + b, 0), 500)
      assert.equal(allocation.length, count)
      assert.ok(Math.max(...allocation) - Math.min(...allocation) <= 1)
    }
  })
  it('counts exactly 500 duplicate candidates before deduplication; equality with quota is not exhaustion proof', async () => {
    const reads: number[] = []
    const limits: number[] = []
    const source = reader(Array(1000).fill(doc()), reads)
    const result = await executeDiscoverySearch(request, now, ranges, async (range, limit, cursor) => {
      limits.push(limit)
      return source(range, limit, cursor)
    })
    assert.equal(reads.reduce((a, b) => a + b, 0), 500)
    assert.ok(limits.every((limit) => limit <= 100))
    assert.equal(result.results.length, 1)
    assert.deepEqual(result.meta, { complete: false, truncated: true, partialFailure: false, returnedCount: 1 })
  })
  it('proves exhaustion with a shorter last page and exposes all matching results', async () => {
    const result = await executeDiscoverySearch(request, now, [ranges[0]], reader([doc('a'), doc('b')]))
    assert.deepEqual(result.meta, { complete: true, truncated: false, partialFailure: false, returnedCount: 2 })
    assert.ok(result.results.every((r) => r.distanceMeters === 0))
  })
  it('caps an otherwise exhausted set of 130 matches to 100, marking it incomplete', async () => {
    const reads: number[] = []
    const documents = Array.from({ length: 130 }, (_, i) => doc(`test-${i}`))
    const result = await executeDiscoverySearch(request, now, [ranges[0]], reader(documents, reads))
    assert.equal(reads.reduce((a, b) => a + b, 0), 130)
    assert.deepEqual(result.meta, { complete: false, truncated: true, partialFailure: false, returnedCount: 100 })
  })
  it('marks a partial failure even when the surviving ranges have no results', async () => {
    let failures = 0
    const result = await executeDiscoverySearch(request, now, ranges, async (range) => {
      if (range[0] === 'a') throw new Error('private backend details')
      return { documents: [] }
    }, () => { failures++ })
    assert.equal(failures, 1)
    assert.deepEqual(result.meta, { complete: false, truncated: false, partialFailure: true, returnedCount: 0 })
    assert.equal(JSON.stringify(result).includes('private backend'), false)
  })
  it('returns a controlled error if every range fails', async () => {
    await assert.rejects(executeDiscoverySearch(request, now, ranges, async () => { throw new Error('backend failure') }),
      { code: 'unavailable', message: 'DISCOVERY_SEARCH_UNAVAILABLE' })
  })
  it('allows true exhaustive zero, never conflating it with a budget-limited zero', async () => {
    const empty = await executeDiscoverySearch(request, now, ranges, reader([]))
    assert.equal(empty.meta.complete, true)
    const filtered = doc('outside', { position: { lat: 1, lng: 1 } })
    const limited = await executeDiscoverySearch(request, now, ranges, reader(Array(1000).fill(filtered)))
    assert.equal(limited.results.length, 0)
    assert.equal(limited.meta.complete, false)
    assert.equal(limited.meta.truncated, true)
  })
  it('does not certify completeness after reading a malformed public projection', async () => {
    const result = await executeDiscoverySearch(request, now, ranges, async (range) => ({ documents: range[0] === 'a' ? [doc('bad', { startDay: undefined })] : [] }))
    assert.equal(result.meta.partialFailure, true)
    assert.equal(result.meta.complete, false)
  })
  it('combines category AND (types OR) AND every selected tag', async () => {
    const documents = [
      doc('festival', { tags: ['family', 'free'] }), doc('concert', { typeId: 'concert', tags: ['family', 'free'] }),
      doc('trail', { typeId: 'trail', tags: ['family', 'free'] }), doc('missing-tag', { tags: ['family'] }),
      doc('category', { categoryId: 'sport', tags: ['family', 'free'] }),
    ]
    const result = await executeDiscoverySearch({ ...request, categoryId: 'culture', typeIds: ['festival', 'concert'], tags: ['family', 'free'] }, now, ranges, reader(documents))
    assert.deepEqual(result.results.map((r) => r.sourceId), ['concert', 'festival'])
    assert.equal(result.meta.complete, true)
  })
  it('eliminates geo/time false positives and sorts retained radius results by distance', async () => {
    const documents = [doc('far', { position: { lat: 48.95, lng: 2.35 } }), doc('near'),
      doc('outside', { position: { lat: 1, lng: 1 } }), doc('wrong-day', { startDay: '2027-01-01', endDay: '2027-01-01' })]
    const result = await executeDiscoverySearch(request, now, ranges, reader(documents))
    assert.deepEqual(result.results.map((r) => r.sourceId), ['near', 'far'])
  })
  it('bounds use the exact rectangle and never include a user distance', async () => {
    const result = await executeDiscoverySearch({ ...request, area: { kind: 'bounds', south: 48.8, north: 48.9, west: 2.3, east: 2.4 } }, now, ranges,
      reader([doc('inside'), doc('outside', { position: { lat: 48.95, lng: 2.35 } })]))
    assert.deepEqual(result.results.map((r) => r.sourceId), ['inside'])
    assert.equal('distanceMeters' in result.results[0], false)
  })
  it('uses an explicit response allowlist and preserves timestamp nanoseconds', () => {
    const result = projectionResultDto(doc('test', { commercial: 'secret', adminId: 'secret', privateLinks: 'secret',
      windowEndAt: { seconds: now.seconds + 100, nanoseconds: 987654321 } }))
    assert.equal(result.windowEndAt.nanoseconds, 987654321)
    for (const field of ['commercial', 'adminId', 'privateLinks', 'geohash', 'updatedAt']) assert.equal(field in result, false)
    assert.equal(typeof (result.windowEndAt as unknown as { toDate?: unknown }).toDate, 'undefined')
  })
  it('captures the clock once and only constructs reads on discovery_public', async () => {
    let clockCalls = 0
    const reads: string[] = []
    const source = doc('test', { timePrecision: 'datetime', startDay: undefined, endDay: undefined,
      windowStartAt: now, windowEndAt: now })
    const db = {
      collection(name: string) {
        reads.push(name)
        assert.equal(name, 'discovery_public')
        const query = { where: () => query, orderBy: () => query, limit: () => query,
          get: async () => ({ docs: [{ id: source.id, data: () => source.data }] }) }
        return query
      },
      doc() { throw new Error('No source reads permitted') },
    } as unknown as Firestore
    const result = await searchDiscovery(db, { ...request, when: { kind: 'now' } }, () => {
      clockCalls++
      return clockCalls === 1 ? now : { ...now, seconds: now.seconds + 1 }
    })
    assert.equal(clockCalls, 1)
    assert.equal(result.results.length, 1)
    assert.ok(reads.length > 0)
  })
})
