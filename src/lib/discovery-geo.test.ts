import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  distanceMeters, pointInRadius, pointInBounds, longitudeSpan, isMapBounds, isAllowedBounds,
  geographicQueryRanges, discoveryGeohash, mergeGeohashRanges, isLatLng,
} from '../../functions/src/discovery-geo'
import type { DiscoveryArea } from '../../functions/src/discovery-search-contract'

const covered = (area: DiscoveryArea, position: { lat: number; lng: number }) => {
  const hash = discoveryGeohash(position)
  return geographicQueryRanges(area).some(([lo, hi]) => lo <= hash && hash <= hi)
}
describe('Discovery geographic primitives', () => {
  it('accepts finite bounded coordinates, rejecting incomplete/non-numeric input', () => {
    assert.equal(isLatLng({ lat: -90, lng: 180 }), true)
    for (const value of [{ lat: NaN, lng: 0 }, { lat: 91, lng: 0 }, { lat: '1', lng: 2 }, { lat: 0 }]) assert.equal(isLatLng(value), false)
  })
  it('uses the fixed 25 km spherical radius, with inside/outside boundary checks', () => {
    const center = { lat: 0, lng: 0 }
    const latitude = (meters: number) => meters / 6_371_000 * 180 / Math.PI
    assert.equal(distanceMeters(center, center), 0)
    assert.ok(Math.abs(distanceMeters(center, { lat: latitude(25_000), lng: 0 }) - 25_000) < 1e-8)
    assert.equal(pointInRadius({ lat: latitude(25_000 - 1e-5), lng: 0 }, center), true)
    assert.equal(pointInRadius({ lat: latitude(25_000 + 1e-5), lng: 0 }, center), false)
  })
  it('covers the reviewed radius false negative without changing the final 25 km verdict', () => {
    const center = { lat: 0, lng: -0.2247 }
    const point = { lat: 0, lng: 0.00012 }
    assert.ok(Math.abs(distanceMeters(center, point) - 24_998.843408229695) < 1e-8)
    assert.equal(pointInRadius(point, center), true)
    assert.equal(covered({ kind: 'radius', center }, point), true)
  })
  it('covers the reviewed flat rectangle without changing its exact bounds', () => {
    const area = { kind: 'bounds' as const, south: -1e-8, north: 1e-8, west: -0.44952, east: 0.00012 }
    const point = { lat: 0, lng: 0.00011 }
    assert.equal(isAllowedBounds(area), true)
    assert.equal(pointInBounds(point, area), true)
    assert.equal(covered(area, point), true)
    assert.equal(pointInBounds({ lat: 0, lng: area.east + 1e-8 }, area), false)
  })
  it('covers cell precision thresholds and mirrored/translated longitude boundaries', () => {
    for (const [centerLng, pointLng] of [[-0.2247, 0.00012], [0.2247, -0.00012], [44.7753, 45.00012]]) {
      const center = { lat: 0, lng: centerLng }, point = { lat: 0, lng: pointLng }
      assert.equal(pointInRadius(point, center), true)
      assert.equal(covered({ kind: 'radius', center }, point), true)
    }
    const area = { kind: 'bounds' as const, south: 0.3533384139431939, north: 1.052931586056806,
      west: 9.99999999, east: 10.00000001 }
    const point = { lat: 0.35333940394319385, lng: 10 }
    assert.equal(isAllowedBounds(area), true)
    assert.equal(pointInBounds(point, area), true)
    assert.equal(covered(area, point), true)
  })
  it('covers opposite longitudes when the search circle includes a pole', () => {
    for (const sign of [-1, 1]) {
      const center = { lat: sign * 89.9, lng: 40 }
      for (const lng of [-180, -140, -40, 0, 40, 140, 180]) {
        const point = { lat: sign * 89.95, lng }
        assert.equal(pointInRadius(point, center), true)
        assert.equal(covered({ kind: 'radius', center }, point), true)
      }
    }
  })
  it('keeps antipodal distances finite despite floating-point rounding', () => {
    const center = { lat: -85.5000000000002, lng: 10 }
    const antipode = { lat: -center.lat, lng: -170 }
    assert.ok(Number.isFinite(distanceMeters(center, antipode)))
    assert.ok(Math.abs(distanceMeters(center, antipode) - Math.PI * 6_371_000) < 1)
    assert.equal(pointInRadius(antipode, center), false)
  })
  it('includes rectangle borders and removes geographically distant candidates', () => {
    const bounds = { south: 48.8, north: 48.9, west: 2.3, east: 2.4 }
    assert.equal(pointInBounds({ lat: 48.8, lng: 2.4 }, bounds), true)
    assert.equal(pointInBounds({ lat: 48.95, lng: 2.35 }, bounds), false)
    assert.equal(isMapBounds({ ...bounds, north: bounds.south }), false)
    assert.equal(isMapBounds({ ...bounds, east: Infinity }), false)
  })
  it('uses the real wrapped longitude span and handles both representations of the date line', () => {
    const bounds = { south: -0.1, north: 0.1, west: 179.8, east: -179.8 }
    assert.ok(Math.abs(longitudeSpan(bounds) - 0.4) < 1e-10)
    for (const lng of [179.9, -179.9, 180, -180]) {
      assert.equal(pointInBounds({ lat: 0, lng }, bounds), true)
      assert.equal(covered({ kind: 'bounds', ...bounds }, { lat: 0, lng }), true)
    }
    assert.equal(pointInBounds({ lat: 0, lng: 0 }, bounds), false)
    assert.equal(pointInBounds({ lat: 0, lng: -180 }, { ...bounds, west: 179.8, east: 180 }), true)
  })
  it('refuses world/quasi-world extents and excessive latitude spans without shortest-path aliasing', () => {
    for (const bounds of [
      { south: -80, north: 80, west: -180, east: 180 },
      { south: -0.1, north: 0.1, west: -179.9, east: 179.9 },
      { south: 0, north: 3, west: 0, east: 0.1 },
      { south: -1, north: 1, west: 1, east: 0 },
    ]) assert.equal(isAllowedBounds(bounds), false)
    assert.equal(isAllowedBounds({ south: 48.8, north: 48.9, west: 2.3, east: 2.4 }), true)
  })
  it('covers a viewport much smaller than a persisted geohash cell', () => {
    const area = { kind: 'bounds' as const, south: 48.85 - 1e-9, north: 48.85 + 1e-9, west: 2.35 - 1e-9, east: 2.35 + 1e-9 }
    for (const lat of [area.south, 48.85, area.north]) for (const lng of [area.west, 2.35, area.east]) {
      assert.equal(covered(area, { lat, lng }), true)
      assert.equal(pointInBounds({ lat, lng }, area), true)
    }
  })
  it('covers rectangle edge interiors across latitudes, not just corners', () => {
    for (const lat of [-80, -20, 0, 48, 80]) {
      const area = { kind: 'bounds' as const, south: lat, north: lat + 0.3, west: 10, east: 10.7 }
      for (let y = 0; y <= 6; y++) for (let x = 0; x <= 6; x++) {
        assert.equal(covered(area, { lat: lat + y * 0.05, lng: 10 + x * 0.7 / 6 }), true)
      }
    }
  })
  it('covers fixed-radius candidates at the equator, date line and near the poles', () => {
    for (const center of [{ lat: 0, lng: 0 }, { lat: 0, lng: 179.95 }, { lat: 89.9, lng: 40 }, { lat: -89.9, lng: -40 }]) {
      const area = { kind: 'radius' as const, center }
      for (const point of [center, { lat: Math.min(90, center.lat + 0.05), lng: center.lng }, { lat: center.lat, lng: center.lng > 179 ? -179.95 : center.lng + 0.05 }]) {
        assert.equal(pointInRadius(point, center), true)
        assert.equal(covered(area, point), true)
      }
    }
  })
  it('has actual geohash false positives, eliminated by the radius verdict', () => {
    const area = { kind: 'radius' as const, center: { lat: 48.85, lng: 2.35 } }
    let falsePositives = 0
    for (let lat = 48.45; lat < 49.25; lat += 0.02) for (let lng = 1.95; lng < 2.75; lng += 0.02) {
      const point = { lat, lng }
      if (covered(area, point) && !pointInRadius(point, area.center)) falsePositives++
    }
    assert.ok(falsePositives > 0)
  })
  it('merges duplicate/overlapping ranges without mutating the source arrays', () => {
    const ranges: [string, string][] = [['c', 'f'], ['a', 'd'], ['a', 'd'], ['x', 'z']]
    assert.deepEqual(mergeGeohashRanges(ranges), [['a', 'f'], ['x', 'z']])
    assert.deepEqual(ranges[0], ['c', 'f'])
  })
})
