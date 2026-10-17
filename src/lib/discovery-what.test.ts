import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { discoveryCategories } from './event-discovery';
import { searchAreaForWhenChange } from './discovery-when';
import type { DiscoverySession } from './discovery-geography';
import {
  DEFAULT_DISCOVERY_CATEGORY, discoverySearchRequest, parseDiscoveryCategorySession,
} from './discovery-what';

const area = { kind: 'radius' as const, center: { lat: 48.85, lng: 2.35 } };
const when = { kind: 'weekend' as const };

describe('Discovery category choice', () => {
  it('restores every catalog choice and the default across navigation', () => {
    assert.equal(parseDiscoveryCategorySession(null), DEFAULT_DISCOVERY_CATEGORY);
    assert.equal(parseDiscoveryCategorySession(JSON.stringify('all')), 'all');
    for (const category of discoveryCategories) {
      assert.equal(parseDiscoveryCategorySession(JSON.stringify(category.id)), category.id);
    }
  });

  it('ignores damaged, obsolete and unrelated session values', () => {
    for (const raw of ['not-json', 'null', '123', '"Music"', '"parking"', '"family"',
      '{}', '["music"]', '{"categoryId":"music"}']) {
      assert.equal(parseDiscoveryCategorySession(raw), 'all', raw);
    }
  });

  it('omits categoryId for all and sends only the selected catalog ID with area and when', () => {
    assert.deepEqual(discoverySearchRequest(area, when, 'all'), { area, when });
    for (const category of discoveryCategories) {
      assert.deepEqual(discoverySearchRequest(area, when, category.id), { area, when, categoryId: category.id });
    }
  });

  it('uses the last confirmed area and leaves an unconfirmed map viewport pending', () => {
    const pendingBounds = { kind: 'bounds' as const, north: 49, south: 48, east: 3, west: 2 };
    const session: DiscoverySession = {
      context: { source: 'place', area },
      camera: { center: { lat: 48.9, lng: 2.5 }, zoom: 12 },
      pendingBounds,
    };
    assert.deepEqual(discoverySearchRequest(searchAreaForWhenChange(session)!, when, 'culture'), {
      area, when, categoryId: 'culture',
    });
    assert.equal(session.pendingBounds, pendingBounds);
    assert.deepEqual(session.camera, { center: { lat: 48.9, lng: 2.5 }, zoom: 12 });
  });
});
