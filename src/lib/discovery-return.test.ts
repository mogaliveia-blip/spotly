import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  createDiscoveryReturnToken, discoveryEventHref, discoveryReturnIntent, hasDiscoveryReturnOrigin,
} from './discovery-return';

describe('Discovery Event return origin', () => {
  it('requires the clicked Event, its opaque URL token, and a recent matching tab intent', () => {
    const token = createDiscoveryReturnToken();
    const createdAt = 1_000_000;
    const intent = discoveryReturnIntent('concert-paris', token, createdAt);
    assert.equal(discoveryEventHref('concert-paris', token), `/concert-paris/dashboard?discoveryOrigin=${token}`);
    assert.equal(hasDiscoveryReturnOrigin(intent, 'concert-paris', token, createdAt), true);
    assert.equal(hasDiscoveryReturnOrigin(intent, 'autre-event', token, createdAt), false);
    assert.equal(hasDiscoveryReturnOrigin(intent, 'concert-paris', createDiscoveryReturnToken(), createdAt), false);
    assert.equal(hasDiscoveryReturnOrigin(intent, 'concert-paris', null, createdAt), false);
    assert.equal(hasDiscoveryReturnOrigin(null, 'concert-paris', token, createdAt), false);
    assert.equal(hasDiscoveryReturnOrigin(intent, 'concert-paris', token, createdAt + 30 * 60 * 1000 + 1), false);
    assert.equal(hasDiscoveryReturnOrigin(intent, 'concert-paris', token, createdAt - 1), false);
  });

  it('rejects damaged or forged navigation records and keeps the destination fixed', () => {
    const token = createDiscoveryReturnToken();
    const slug = 'festival';
    assert.equal(discoveryEventHref(slug, null), '/festival/dashboard');
    for (const raw of ['not json', '{}', JSON.stringify({ slug, token, createdAt: 'now' }),
      JSON.stringify({ slug, token, createdAt: 1, redirectTo: 'https://example.com' })]) {
      assert.equal(hasDiscoveryReturnOrigin(raw, slug, token, 1), false);
    }
    assert.equal(hasDiscoveryReturnOrigin(discoveryReturnIntent(slug, token, 1), slug, 'invalid', 1), false);
  });
});
