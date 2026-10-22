import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { Timestamp as AdminTimestamp } from 'firebase-admin/firestore'
import { Timestamp } from 'firebase/firestore'
import { decodeDiscoverySearchResponse } from './discovery-search-dto'
import { projectionResultDto } from '../../functions/src/discovery-search'

function response() {
  return { results: [projectionResultDto({ id: 'event_source', data: {
    contentType: 'event', sourceId: 'source', title: 'Festival public', slug: 'festival-public',
    position: { lat: 48.85, lng: 2.35 }, typeId: 'festival', categoryId: 'music', timePrecision: 'datetime', timezone: 'Europe/Paris',
    windowStartAt: new AdminTimestamp(1790000000, 123456789), windowEndAt: new AdminTimestamp(1790001000, 987654321),
  } })], meta: { complete: true, truncated: false, partialFailure: false, returnedCount: 1 } }
}
describe('Explicit Discovery network timestamps', () => {
  it('survives plain JSON serialization and explicitly constructs browser SDK timestamps without precision loss', () => {
    const payload = JSON.parse(JSON.stringify(response()))
    assert.equal(payload.results[0].windowStartAt.toDate, undefined)
    assert.deepEqual(payload.results[0].windowStartAt, { seconds: 1790000000, nanoseconds: 123456789 })
    const decoded = decodeDiscoverySearchResponse(payload)
    assert.ok(decoded.results[0].windowStartAt instanceof Timestamp)
    assert.equal(decoded.results[0].windowStartAt.seconds, 1790000000)
    assert.equal(decoded.results[0].windowStartAt.nanoseconds, 123456789)
    assert.equal(decoded.results[0].windowEndAt.nanoseconds, 987654321)
  })
  it('rejects malformed timestamps, unexpected private fields and inconsistent metadata', () => {
    const variants = [
      (p: any) => { p.results[0].windowStartAt.nanoseconds = 1_000_000_000 },
      (p: any) => { p.results[0].windowStartAt.seconds = '1790000000' },
      (p: any) => { p.results[0].adminId = 'secret' },
      (p: any) => { p.meta.returnedCount = 2 },
      (p: any) => { p.meta.partialFailure = true },
      (p: any) => { p.results[0].startDay = '2026-09-12' },
      (p: any) => { delete p.results[0].categoryId },
      (p: any) => { p.results[0].categoryId = 'obsolete' },
    ]
    for (const mutate of variants) {
      const payload = JSON.parse(JSON.stringify(response()))
      mutate(payload)
      assert.throws(() => decodeDiscoverySearchResponse(payload), /INVALID_DISCOVERY_RESPONSE/)
    }
  })
  it('retains partial-failure empty results as incomplete, not an exhaustive zero', () => {
    const result = decodeDiscoverySearchResponse({ results: [], meta: { complete: false, truncated: false, partialFailure: true, returnedCount: 0 } })
    assert.equal(result.meta.complete, false)
    assert.equal(result.meta.partialFailure, true)
  })

  it('accepts an explicitly attributed external result and rejects private or native aliases', () => {
    const id = `dt_${'a'.repeat(64)}`
    const external = {
      ...response().results[0], id: `datatourisme_${id}`, sourceId: id,
      origin: 'datatourisme', slug: undefined, description: 'Concert fictif.',
      editorialType: 'Concert', city: 'Vannes', department: '56',
      positionPrecision: 'source_coordinates',
      attribution: { source: 'DATAtourisme', producer: 'Producteur fictif', publisher: null },
      sourceUrl: 'https://example.test/concert',
    }
    delete external.slug
    const payload = { results: [external], meta: { complete: true, truncated: false, partialFailure: false, returnedCount: 1 } }
    const decoded = decodeDiscoverySearchResponse(JSON.parse(JSON.stringify(payload)))
    assert.equal(decoded.results[0].origin, 'datatourisme')
    assert.equal(decoded.results[0].id, external.id)
    assert.equal(decoded.results[0].attribution.producer, 'Producteur fictif')
    for (const mutate of [
      (item: any) => { item.id = `event_${id}` },
      (item: any) => { item.origin = 'native' },
      (item: any) => { item.slug = 'native-event' },
      (item: any) => { item.sourceUrl = 'javascript:alert(1)' },
      (item: any) => { item.privateNotes = 'secret' },
    ]) {
      const invalid = JSON.parse(JSON.stringify(payload))
      mutate(invalid.results[0])
      assert.throws(() => decodeDiscoverySearchResponse(invalid), /INVALID_DISCOVERY_RESPONSE/)
    }
  })
})
