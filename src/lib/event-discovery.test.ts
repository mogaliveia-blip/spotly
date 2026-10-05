import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { discoveryCategories, discoveryTags, eventDiscoveryTypes, isCatalogId, isDiscoveryPosition } from './event-discovery'

describe('shared discovery contract', () => {
  it('accepts finite coordinates including boundaries, and rejects invalid shapes and numbers', () => {
    for (const position of [{ lat: 48.85, lng: 2.35 }, { lat: -90, lng: -180 }, { lat: 90, lng: 180 }]) {
      assert.equal(isDiscoveryPosition(position), true)
    }
    for (const position of [
      null, [], {}, { lat: 0 }, { lng: 0 }, { lat: 0, lng: 0, extra: true },
      { lat: 91, lng: 0 }, { lat: -91, lng: 0 }, { lat: 0, lng: 181 }, { lat: 0, lng: -181 },
      { lat: NaN, lng: 0 }, { lat: 0, lng: NaN }, { lat: Infinity, lng: 0 },
      { lat: 0, lng: -Infinity }, { lat: '48.85', lng: 2.35 }, { lat: 0, lng: '2' },
    ]) assert.equal(isDiscoveryPosition(position), false)
  })

  it('uses controlled stable IDs, rejecting labels, free text and Point categories', () => {
    assert.deepEqual(eventDiscoveryTypes.map((entry) => entry.id), ['festival', 'concert', 'market', 'trail', 'other'])
    assert.deepEqual(discoveryCategories.map((entry) => entry.id), ['music', 'culture', 'gastronomy', 'sport', 'nature', 'other'])
    assert.deepEqual(discoveryTags.map((entry) => entry.id), ['family', 'outdoor', 'free'])
    assert.equal(isCatalogId(eventDiscoveryTypes, 'market'), true)
    assert.equal(isCatalogId(discoveryCategories, 'culture'), true)
    assert.equal(isCatalogId(discoveryTags, 'family'), true)
    for (const value of ['Festival', 'parking', 'custom', '', null]) {
      assert.equal(isCatalogId(eventDiscoveryTypes, value), false)
      assert.equal(isCatalogId(discoveryCategories, value), false)
      assert.equal(isCatalogId(discoveryTags, value), false)
    }
  })
})
