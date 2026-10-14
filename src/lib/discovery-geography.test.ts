import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  DEFAULT_DISCOVERY_CAMERA, DiscoveryLocationIntent, focusDiscoveryResult,
  isDiscoveryAreaTooLarge, parseDiscoverySession,
} from './discovery-geography';

describe('Discovery geographic session', () => {
  it('restores a selected place and a pending manual viewport independently', () => {
    const session = {
      context: { source: 'place', area: { kind: 'radius', center: { lat: 48.85, lng: 2.35 } } },
      camera: { center: { lat: 48.9, lng: 2.4 }, zoom: 11 },
      pendingBounds: { kind: 'bounds', north: 49, south: 48.8, east: 2.5, west: 2.2 },
    };
    assert.deepEqual(parseDiscoverySession(JSON.stringify(session)), session);
  });

  it('restores GPS geography from session without requiring URL parameters', () => {
    const session = {
      context: { source: 'gps', area: { kind: 'radius', center: { lat: 45.75, lng: 4.85 } } },
      camera: DEFAULT_DISCOVERY_CAMERA,
      pendingBounds: null,
    };
    assert.deepEqual(parseDiscoverySession(JSON.stringify(session)), session);
  });

  it('rejects malformed persisted coordinates and area/source mismatches', () => {
    const session = {
      context: { source: 'map', area: { kind: 'radius', center: { lat: 48, lng: 2 } } },
      camera: DEFAULT_DISCOVERY_CAMERA,
      pendingBounds: null,
    };
    assert.equal(parseDiscoverySession(JSON.stringify(session)), null);
    assert.equal(parseDiscoverySession(JSON.stringify({ ...session, context: null, camera: { center: { lat: 100, lng: 2 }, zoom: 6 } })), null);
    assert.equal(parseDiscoverySession('{bad json'), null);
  });

  it('drops unexpected session fields before a restored area can reach D1', () => {
    const restored = parseDiscoverySession(JSON.stringify({
      context: { source: 'place', area: { kind: 'radius', center: { lat: 48, lng: 2 }, extra: 'ignored' } },
      camera: DEFAULT_DISCOVERY_CAMERA,
      pendingBounds: null,
    }));
    assert.deepEqual(restored?.context?.area, { kind: 'radius', center: { lat: 48, lng: 2 } });
  });

  it('recognizes the D1 bounds rejection only', () => {
    assert.equal(isDiscoveryAreaTooLarge({ code: 'functions/invalid-argument', details: { reason: 'DISCOVERY_AREA_TOO_LARGE' } }), true);
    assert.equal(isDiscoveryAreaTooLarge({ code: 'functions/invalid-argument', details: { reason: 'INVALID_DISCOVERY_REQUEST' } }), false);
  });

  it('focuses an out-of-view result while preserving the PLACE search context for return navigation', () => {
    const session = {
      context: { source: 'place' as const, area: { kind: 'radius' as const, center: { lat: 48.85, lng: 2.35 } } },
      camera: { center: { lat: 48.85, lng: 2.35 }, zoom: 11 },
      pendingBounds: null,
    };
    const focused = focusDiscoveryResult(session, { lat: 49.05, lng: 2.6 });
    assert.deepEqual(focused.camera, { center: { lat: 49.05, lng: 2.6 }, zoom: 11 });
    assert.deepEqual(focused.context, session.context);
    assert.equal(focused.pendingBounds, null);
    assert.deepEqual(parseDiscoverySession(JSON.stringify(focused)), focused);
  });

  it('accepts a late GPS fix only if no newer place or map choice superseded it', async () => {
    const intent = new DiscoveryLocationIntent();
    let resolve!: (position: { lat: number; lng: number }) => void;
    const pending = new Promise<{ lat: number; lng: number }>((done) => { resolve = done; });
    const selected: Array<{ lat: number; lng: number }> = [];
    const request = intent.requestGps(() => pending, (position) => selected.push(position), () => assert.fail('unexpected GPS error'));
    intent.invalidate(); // The user selected a PLACE while GPS was pending.
    resolve({ lat: 45.75, lng: 4.85 });
    assert.equal(await request, false);
    assert.equal(selected.length, 0);
    assert.equal(await intent.requestGps(async () => ({ lat: 48.85, lng: 2.35 }),
      (position) => selected.push(position), () => assert.fail('unexpected GPS error')), true);
    assert.deepEqual(selected, [{ lat: 48.85, lng: 2.35 }]);
  });

  it('reports a current GPS refusal without selecting a location', async () => {
    const intent = new DiscoveryLocationIntent();
    const refusal = { code: 1 };
    const errors: unknown[] = [];
    assert.equal(await intent.requestGps(async () => { throw refusal; },
      () => assert.fail('unexpected GPS position'), (error) => errors.push(error)), true);
    assert.deepEqual(errors, [refusal]);
  });
});
