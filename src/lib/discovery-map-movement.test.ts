import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { DiscoveryMapMovement } from '../components/discovery/discovery-map-movement';
import type { DiscoveryCamera } from './discovery-geography';

const first: DiscoveryCamera = { center: { lat: 48.85, lng: 2.35 }, zoom: 11 };
const target: DiscoveryCamera = { center: { lat: 48.9, lng: 2.4 }, zoom: 12 };
const manual: DiscoveryCamera = { center: { lat: 48.95, lng: 2.45 }, zoom: 13 };
type Bounds = { kind: 'bounds'; north: number; south: number; east: number; west: number };
const bounds = (north: number): Bounds => ({ kind: 'bounds', north, south: north - 0.1, east: 2.5, west: 2.4 });

function harness() {
  const movement = new DiscoveryMapMovement();
  let pendingBounds: Bounds | null = null;
  let searches = 0;
  return {
    movement,
    get pendingBounds() { return pendingBounds; },
    get searches() { return searches; },
    idle(camera: DiscoveryCamera, area: Bounds | null) {
      if (movement.onIdle(camera, area !== null) && area) pendingBounds = area;
    },
    search() {
      if (pendingBounds) {
        searches += 1;
        pendingBounds = null;
        movement.finishManual();
      }
    },
  };
}

describe('Discovery map movements', () => {
  it('keeps initialization passive and records the first manual drag', () => {
    const map = harness();
    map.movement.onZoomChanged(first.zoom);
    map.idle(first, bounds(1));
    assert.equal(map.pendingBounds, null);
    map.movement.onDragstart();
    map.idle(first, bounds(2));
    assert.equal(map.pendingBounds, null);
    map.movement.onDragend();
    map.idle(manual, bounds(3));
    assert.deepEqual(map.pendingBounds, bounds(3));
    assert.equal(map.searches, 0);
  });

  it('keeps user input through an intermediate idle before the first zoom', () => {
    const map = harness();
    map.movement.beginProgrammatic(target, first.zoom);
    map.movement.noteUserInput();
    map.idle(first, bounds(1));
    assert.equal(map.pendingBounds, null);
    map.movement.onZoomChanged(13);
    map.idle(manual, bounds(3));
    assert.deepEqual(map.pendingBounds, bounds(3));
  });

  it('ignores an old idle between user zoom and the final idle', () => {
    const map = harness();
    map.movement.beginProgrammatic(target, first.zoom);
    map.movement.noteUserInput();
    map.movement.onZoomChanged(13);
    // The queued idle can observe the new zoom while the pan center is still intermediate.
    map.idle({ center: { lat: 48.87, lng: 2.37 }, zoom: 13 }, bounds(1));
    map.idle(manual, bounds(3));
    assert.deepEqual(map.pendingBounds, bounds(3));
    assert.equal(map.searches, 0);
  });

  it('recognizes a drag that interrupts a pan and retains its final bounds', () => {
    const map = harness();
    map.movement.beginProgrammatic(target, first.zoom);
    map.movement.onDragstart();
    map.idle(target, bounds(1));
    assert.equal(map.pendingBounds, null);
    map.movement.onDragend();
    map.idle(target, bounds(2));
    assert.equal(map.pendingBounds, null);
    map.idle(manual, bounds(3));
    assert.deepEqual(map.pendingBounds, bounds(3));
  });

  it('leaves pending bounds empty for an uninterrupted programmatic recenter', () => {
    const map = harness();
    map.movement.beginProgrammatic(target, first.zoom);
    map.movement.onZoomChanged(target.zoom);
    map.idle(first, bounds(1));
    map.idle(target, bounds(2));
    assert.equal(map.pendingBounds, null);
    assert.equal(map.searches, 0);
  });

  it('keeps the latest area through rapid manual movements and searches only on explicit action', () => {
    const map = harness();
    map.movement.beginProgrammatic(target, first.zoom);
    map.movement.onDragstart();
    map.movement.onDragend();
    map.idle({ ...first, center: { lat: 48.87, lng: 2.37 } }, bounds(2));
    map.movement.noteUserInput();
    map.movement.onZoomChanged(13);
    map.idle(first, bounds(1));
    map.idle(manual, bounds(3));
    assert.deepEqual(map.pendingBounds, bounds(3));
    assert.equal(map.searches, 0);
    map.search();
    assert.equal(map.searches, 1);
    assert.equal(map.pendingBounds, null);
    map.idle(manual, bounds(3));
    assert.equal(map.pendingBounds, null);
  });

  it('records a manual zoom even if its final camera matches the programmatic target', () => {
    const map = harness();
    map.movement.beginProgrammatic(target, first.zoom);
    map.movement.noteUserInput();
    map.movement.onZoomChanged(target.zoom);
    map.idle(first, bounds(1));
    assert.equal(map.pendingBounds, null);
    map.idle(target, bounds(2));
    assert.deepEqual(map.pendingBounds, bounds(2));
  });

  it('does not recreate pending bounds on a later idle without a new gesture', () => {
    const map = harness();
    map.movement.beginProgrammatic(target, first.zoom);
    map.movement.onDragstart();
    map.movement.onDragend();
    map.idle(manual, bounds(3));
    assert.deepEqual(map.pendingBounds, bounds(3));
    map.search();
    map.idle(first, bounds(1));
    assert.equal(map.pendingBounds, null);
    assert.equal(map.searches, 1);
  });
});
