import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { DiscoveryLocationIntent } from './discovery-geography';
import { createSharedGeolocationRequest } from './geolocation-request';

const position = { coords: { latitude: 48.85, longitude: 2.35 } } as GeolocationPosition;
const refusal = { code: 1, message: 'Permission denied' } as GeolocationPositionError;
const expired = { code: 3, message: 'Timed out' } as GeolocationPositionError;

function createHarness(timeoutMs = 11_000) {
  let calls = 0;
  let succeed: ((value: GeolocationPosition) => void) | undefined;
  let fail: ((error: GeolocationPositionError) => void) | undefined;
  const positions: GeolocationPosition[] = [];
  const errors: GeolocationPositionError[] = [];
  const request = createSharedGeolocationRequest({
    getCurrentPosition(success, error) { calls += 1; succeed = success; fail = error ?? undefined; },
  }, (value) => positions.push(value), (error) => errors.push(error), timeoutMs);
  return {
    request, positions, errors,
    get calls() { return calls; },
    quickSuccess: (value = position) => succeed!(value),
    quickFailure: (error = expired) => fail!(error),
  };
}

describe('Shared geolocation request', () => {
  it('uses a watch fix before the quick request and ignores its later expiration', async () => {
    const gps = createHarness();
    const pending = gps.request();
    gps.request.watchPosition(position);
    assert.equal(await pending, position);
    gps.quickFailure();
    assert.equal(gps.calls, 1);
    assert.deepEqual(gps.positions, [position]);
    assert.deepEqual(gps.errors, []);
  });

  it('uses a quick fix before the watch and does not start another acquisition on repeat', async () => {
    const gps = createHarness();
    const pending = gps.request();
    gps.quickSuccess();
    assert.equal(await pending, position);
    assert.equal(await gps.request(), position);
    gps.request.watchError(expired);
    assert.equal(gps.calls, 1);
    assert.deepEqual(gps.errors, []);
  });

  it('shares close clicks and waits for the watch after the quick request expires', async () => {
    const gps = createHarness();
    const first = gps.request();
    const second = gps.request();
    assert.equal(first, second);
    assert.equal(gps.calls, 1);
    gps.quickFailure();
    assert.deepEqual(gps.errors, []);
    gps.request.watchPosition(position);
    assert.equal(await second, position);
    assert.deepEqual(gps.errors, []);
  });

  it('reports refusal when neither source can provide a position and allows retry', async () => {
    const gps = createHarness();
    const pending = gps.request();
    gps.request.watchError(refusal);
    gps.quickFailure(refusal);
    await assert.rejects(pending, (error) => error === refusal);
    assert.deepEqual(gps.errors, [refusal]);
    const retry = gps.request();
    assert.equal(gps.calls, 2);
    gps.quickSuccess();
    assert.equal(await retry, position);
  });

  it('reports unavailability when the watch stops and the quick request fails', async () => {
    const gps = createHarness();
    const pending = gps.request();
    gps.request.setWatching(false);
    gps.quickFailure({ code: 2, message: 'Unavailable' } as GeolocationPositionError);
    await assert.rejects(pending, (error) => (error as GeolocationPositionError).code === 2);
    assert.equal(gps.errors.length, 1);
  });

  it('reports a known permission refusal without waiting for a watch that was never started', async () => {
    const gps = createHarness();
    gps.request.setWatching(false);
    const pending = gps.request();
    gps.quickFailure(refusal);
    await assert.rejects(pending, (error) => error === refusal);
    assert.deepEqual(gps.errors, [refusal]);
  });

  it('times out when neither source responds', async () => {
    const gps = createHarness(5);
    await assert.rejects(gps.request(), (error) => (error as GeolocationPositionError).code === 3);
    assert.equal(gps.errors.length, 1);
  });

  it('does not replace a place or trigger a search when the watch answers late', async () => {
    const gps = createHarness();
    const intent = new DiscoveryLocationIntent();
    const searches: string[] = [];
    const pending = intent.requestGps(
      async () => {
        const fix = await gps.request();
        return { lat: fix.coords.latitude, lng: fix.coords.longitude };
      },
      () => searches.push('gps'),
      () => searches.push('error'),
    );
    intent.invalidate();
    searches.push('place');
    gps.request.watchPosition(position);
    assert.equal(await pending, false);
    gps.quickFailure();
    assert.deepEqual(searches, ['place']);
  });

  it('calls the selection once when both GPS sources succeed', async () => {
    const gps = createHarness();
    const intent = new DiscoveryLocationIntent();
    let selections = 0;
    const pending = intent.requestGps(
      async () => {
        const fix = await gps.request();
        return { lat: fix.coords.latitude, lng: fix.coords.longitude };
      },
      () => { selections += 1; },
      () => assert.fail('unexpected GPS error'),
    );
    gps.request.watchPosition(position);
    assert.equal(await pending, true);
    gps.quickSuccess();
    assert.equal(selections, 1);
  });
});
