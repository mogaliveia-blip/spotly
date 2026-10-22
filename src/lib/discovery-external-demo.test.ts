import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { DiscoverySearchResult } from './discovery-search-dto';
import { createExternalDemoEvents, displayDiscoveryEvents, nextResultsCount } from './discovery-external-demo';
import type { DisplaySearchContext } from './discovery-external-demo';
import { clusterDiscoveryMarkers, markerClusterTitle } from './discovery-marker-clusters';

const day = '2026-10-21';
const fixtures = createExternalDemoEvents(day);
const context: DisplaySearchContext = {
  area: { kind: 'radius', center: { lat: 48.117, lng: -1.678 } },
  when: { kind: 'today' }, category: 'all',
};
const nativeResponse = (count: number, complete = true): DiscoverySearchResult => ({
  results: Array.from({ length: count }, (_, index) => ({
    id: `event_${index}`, title: `Native ${index}`, position: { lat: 48.117, lng: -1.678 }, categoryId: 'music',
  } as DiscoverySearchResult['results'][number])),
  meta: { complete, truncated: !complete, partialFailure: false, returnedCount: count },
});

describe('D7.2 local external fixture', () => {
  it('reports the actual remaining page size without another search', () => {
    assert.equal(nextResultsCount(20, 25), 5);
    assert.equal(nextResultsCount(20, 45), 20);
    assert.equal(nextResultsCount(25, 25), 0);
  });
  it('contains 100 visibly fictional events, evenly distributed without real links', () => {
    assert.equal(fixtures.length, 100);
    assert.equal(new Set(fixtures.map((item) => item.id)).size, 100);
    for (const department of ['22', '29', '35', '56']) {
      const local = fixtures.filter((item) => item.department === department);
      assert.equal(local.length, 25);
      assert.equal(local.filter((item) => item.positionPrecision === 'commune_center').length, 5);
      assert.equal(local.filter((item) => item.positionPrecision === 'address_geocoded').length, 5);
      assert.equal(local.filter((item) => item.positionPrecision === 'source_gps').length, 15);
      assert.equal(new Set(local.slice(0, 5).map((item) => JSON.stringify(item.position))).size, 1);
    }
    assert.ok(fixtures.every((item) => item.title.includes('fictif') && item.producer.includes('fictif') &&
      item.sourceName.includes('fictive') && item.sourceId.startsWith('demo_') && !item.sourceUrl));
  });

  it('keeps native results first and never evicts them or extends an incomplete search', () => {
    assert.deepEqual(displayDiscoveryEvents(nativeResponse(1), context, fixtures, false, day).map((item) => item.id), ['event_0']);
    const mixed = displayDiscoveryEvents(nativeResponse(90), context, fixtures, true, day);
    assert.equal(mixed.length, 100);
    assert.ok(mixed.slice(0, 90).every((item) => item.origin === 'native'));
    assert.ok(mixed.slice(90).every((item) => item.origin === 'external_demo'));
    assert.equal(displayDiscoveryEvents(nativeResponse(100), context, fixtures, true, day).length, 100);
    assert.equal(displayDiscoveryEvents(nativeResponse(1, false), context, fixtures, true, day).length, 1);
  });

  it('keeps real external results after native results and before fictional demo fixtures', () => {
    const external = { ...nativeResponse(1).results[0], origin: 'datatourisme' as const,
      id: `datatourisme_dt_${'a'.repeat(64)}`, title: 'Concert externe fictif' } as DiscoverySearchResult['results'][number];
    const response: DiscoverySearchResult = { results: [external, ...nativeResponse(1).results],
      meta: { complete: true, truncated: false, partialFailure: false, returnedCount: 2 } };
    const visible = displayDiscoveryEvents(response, context, fixtures, true, day);
    assert.deepEqual(visible.slice(0, 2).map((item) => item.origin), ['native', 'datatourisme']);
    assert.equal(visible[2].origin, 'external_demo');
    const clusters = clusterDiscoveryMarkers(visible.slice(0, 2), {
      center: { lat: 48.117, lng: -1.678 }, zoom: 11, width: 390, height: 420,
    });
    assert.equal(clusters.length, 1);
    assert.equal(clusters[0].members.length, 2);
  });

  it('applies date, category and area locally, with date-only events excluded from Now', () => {
    const rennes = displayDiscoveryEvents(nativeResponse(0), context, fixtures, true, day);
    assert.equal(rennes.length, 25);
    assert.ok(clusterDiscoveryMarkers(rennes, {
      center: context.area.kind === 'radius' ? context.area.center : { lat: 48.117, lng: -1.678 },
      zoom: 11, width: 390, height: 420,
    }).length < rennes.length);
    assert.equal(displayDiscoveryEvents(nativeResponse(0), { ...context, when: { kind: 'now' } }, fixtures, true, day).length, 0);
    assert.equal(displayDiscoveryEvents(nativeResponse(0), { ...context, when: { kind: 'date', day: '2026-10-22' } }, fixtures, true, day).length, 0);
    assert.ok(displayDiscoveryEvents(nativeResponse(0), { ...context, category: 'music' }, fixtures, true, day)
      .every((item) => item.categoryId === 'music'));
    assert.equal(displayDiscoveryEvents(nativeResponse(0), {
      ...context, area: { kind: 'bounds', north: 45, south: 44, east: 0, west: -1 },
    }, fixtures, true, day).length, 0);
  });
});

describe('D7.2 marker groups', () => {
  const viewport = { center: { lat: 48.117, lng: -1.678 }, zoom: 11, width: 400, height: 500 };
  it('keeps same-centre events together without moving their coordinate', () => {
    const sameCentre = fixtures.filter((item) => item.department === '35' && item.positionPrecision === 'commune_center');
    const clusters = clusterDiscoveryMarkers(sameCentre, viewport);
    assert.equal(clusters.length, 1);
    assert.equal(clusters[0].members.length, 5);
    assert.equal(clusters[0].approximateCount, 5);
    assert.deepEqual(clusters[0].position, sameCentre[0].position);
    assert.match(markerClusterTitle(clusters[0]), /5 à position estimée ou approximative/);
  });

  it('labels mixed groups and leaves GPS-only groups without an approximate count', () => {
    const commune = fixtures.find((item) => item.department === '35' && item.positionPrecision === 'commune_center')!;
    const gps = { ...fixtures.find((item) => item.department === '35' && item.positionPrecision === 'source_gps')!,
      position: commune.position };
    const mixed = clusterDiscoveryMarkers([commune, gps], viewport);
    assert.equal(mixed.length, 1);
    assert.equal(mixed[0].approximateCount, 1);
    assert.match(markerClusterTitle(mixed[0]), /1 à position estimée ou approximative/);
    const exact = clusterDiscoveryMarkers([gps, { ...gps, id: 'another_gps' }], viewport);
    assert.equal(exact[0].approximateCount, 0);
    assert.doesNotMatch(markerClusterTitle(exact[0]), /approximative/);
  });
});
