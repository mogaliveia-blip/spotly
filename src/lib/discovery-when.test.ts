import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { parseDiscoverySession } from './discovery-geography';
import { DEFAULT_DISCOVERY_WHEN, parseDiscoveryWhenSession, searchAreaForWhenChange } from './discovery-when';

describe('Discovery temporal session', () => {
  it('restores every V1 choice after navigation without changing the selected place or camera', () => {
    const geography = {
      context: { source: 'place', area: { kind: 'radius', center: { lat: 48.85, lng: 2.35 } } },
      camera: { center: { lat: 48.9, lng: 2.4 }, zoom: 11 },
      pendingBounds: null,
    };
    for (const when of [{ kind: 'today' }, { kind: 'tomorrow' }, { kind: 'weekend' },
      { kind: 'date', day: '2026-10-16' }]) {
      const restoredGeography = parseDiscoverySession(JSON.stringify(geography));
      const restoredWhen = parseDiscoveryWhenSession(JSON.stringify(when));
      assert.deepEqual(restoredWhen, when);
      assert.deepEqual(restoredGeography, geography);
      assert.deepEqual(searchAreaForWhenChange(restoredGeography!), geography.context.area);
    }
  });

  it('searches the last validated area while preserving pending map bounds', () => {
    const geography = parseDiscoverySession(JSON.stringify({
      context: { source: 'map', area: { kind: 'bounds', north: 49, south: 48, east: 3, west: 2 } },
      camera: { center: { lat: 48.5, lng: 2.5 }, zoom: 11 },
      pendingBounds: { kind: 'bounds', north: 49.2, south: 48.2, east: 3.2, west: 2.2 },
    }))!;
    const before = JSON.stringify(geography);
    assert.deepEqual(searchAreaForWhenChange(geography), geography.context!.area);
    assert.equal(JSON.stringify(geography), before);
    assert.deepEqual(parseDiscoveryWhenSession(JSON.stringify({ kind: 'tomorrow' })), { kind: 'tomorrow' });
  });

  it('rejects malformed dates, unsupported choices and extra session fields', () => {
    for (const raw of [null, '{bad', 'null', '[]', JSON.stringify({ kind: 'now' }),
      JSON.stringify({ kind: 'date', day: '2026-02-30' }),
      JSON.stringify({ kind: 'tomorrow', day: '2026-10-17' }),
      JSON.stringify({ kind: 'date', day: '2026-10-17', extra: true })]) {
      assert.deepEqual(parseDiscoveryWhenSession(raw), DEFAULT_DISCOVERY_WHEN);
    }
  });
});
