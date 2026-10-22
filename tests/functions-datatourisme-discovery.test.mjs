import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import external from '../functions/lib/datatourisme-external.js';
import projection from '../functions/lib/datatourisme-discovery-projection.js';
import search from '../functions/lib/discovery-search.js';

const { prepareDatatourismeCandidate } = external;
const { buildDatatourismeDiscoveryProjection } = projection;
const { projectionResultDto, executeDiscoverySearch } = search;
const uuid = '11111111-2222-3333-4444-555555555555';
const now = new Date('2026-10-22T12:00:00.000Z');
const poi = (periods = [{ startDate: '2026-10-25', endDate: '2026-10-25' }]) => ({
  uuid, uri: `https://data.datatourisme.fr/${uuid}`,
  label: { '@fr': 'Concert fictif du port' },
  hasDescription: [{ description: { '@fr': 'Une soirée musicale fictive.' } }],
  hasBeenCreatedBy: { legalName: 'Producteur fictif' },
  hasBeenPublishedBy: [{ legalName: 'Éditeur fictif' }],
  type: [{ uri: 'https://example.test/Product' }, { uri: 'https://example.test/Concert' }],
  hasTheme: [], takesPlaceAt: periods,
  isLocatedAt: [{ address: [{ hasAddressCity: { label: { '@fr': 'Vannes' }, isPartOfDepartment: { insee: '56' } } }],
    geo: { latitude: 47.657, longitude: -2.76 } }],
});
function approvedSource(periods) {
  const candidate = prepareDatatourismeCandidate({ expectedUuid: uuid, expectedDepartment: '56',
    complete: true, poi: poi(periods), timezone: 'Europe/Paris', now });
  assert.equal(candidate.kind, 'accepted');
  return { ...candidate.event, publication: { state: 'approved' } };
}
const reader = (documents) => async () => ({ documents });
const request = (day) => ({ area: { kind: 'radius', center: { lat: 47.657, lng: -2.76 } }, when: { kind: 'date', day } });
const instant = (date) => ({ seconds: Math.floor(date.getTime() / 1000), nanoseconds: 0 });

describe('pure external Discovery projection', () => {
  it('publishes only allowed fields with a separate stable identity and native-compatible temporal fields', async () => {
    const source = approvedSource();
    const built = buildDatatourismeDiscoveryProjection(source, now);
    assert.ok(built);
    assert.equal(built.id, `datatourisme_${source.id}`);
    assert.notEqual(built.id, `event_${source.id}`);
    assert.equal(built.data.origin, 'datatourisme');
    assert.equal(built.data.contentType, 'event');
    assert.equal(built.data.typeId, 'concert');
    assert.equal(built.data.categoryId, 'music');
    assert.equal(built.data.attribution.producer, 'Producteur fictif');
    assert.equal(built.data.editorialType, 'Concert');
    assert.equal(built.data.sourceUrl, `https://data.datatourisme.fr/${uuid}`);
    for (const privateField of ['sourceUuid', 'publication', 'sync', 'periods', 'projectionIds', 'sourceTypes']) {
      assert.equal(privateField in built.data, false);
    }
    const dto = projectionResultDto(built);
    assert.equal(dto.origin, 'datatourisme');
    assert.equal(dto.slug, undefined);
    const found = await executeDiscoverySearch(request('2026-10-25'), instant(now), [['a', 'z']],
      reader([built]));
    assert.deepEqual(found.results.map((result) => result.id), [built.id]);
    const between = await executeDiscoverySearch(request('2026-10-26'), instant(now), [['a', 'z']],
      reader([built]));
    assert.equal(between.results.length, 0);
  });

  it('excludes disjoint sessions and uncertain sources instead of making a continuous interval', () => {
    const source = approvedSource();
    const twoSessions = { ...source, periods: [...source.periods,
      { timePrecision: 'date', startDay: '2026-10-30', endDay: '2026-10-30' }],
      expiresAt: '2026-10-30T23:00:00.000Z' };
    assert.equal(buildDatatourismeDiscoveryProjection(twoSessions, now), null);
    assert.equal(buildDatatourismeDiscoveryProjection({ ...source, publication: { state: 'hidden' } }, now), null);
    assert.equal(buildDatatourismeDiscoveryProjection({ ...source, completeness: 'incomplete' }, now), null);
    assert.equal(buildDatatourismeDiscoveryProjection({ ...source, sync: { ...source.sync, state: 'error' } }, now), null);
    assert.equal(buildDatatourismeDiscoveryProjection(source, new Date('2026-10-26T00:00:00Z')), null);
    assert.equal(buildDatatourismeDiscoveryProjection({ ...source, origin: 'native' }, now), null);
    assert.equal(buildDatatourismeDiscoveryProjection({ ...source, id: 'event_native' }, now), null);
  });

  it('keeps the strict Now interval for a single exact-time event', async () => {
    const source = approvedSource([{ startDate: '2026-10-25T10:00:00+02:00', endDate: '2026-10-25T12:00:00+02:00' }]);
    const built = buildDatatourismeDiscoveryProjection(source, now);
    assert.ok(built);
    assert.equal(built.data.timePrecision, 'datetime');
    const searchAt = (time) => executeDiscoverySearch({ ...request('2026-10-25'), when: { kind: 'now' } },
      instant(new Date(time)), [['a', 'z']], reader([built]));
    assert.equal((await searchAt('2026-10-25T07:59:00Z')).results.length, 0);
    assert.equal((await searchAt('2026-10-25T09:00:00Z')).results.length, 1);
    assert.equal((await searchAt('2026-10-25T10:01:00Z')).results.length, 0);
  });

  it('does not accept an external projection masquerading as a native Event', () => {
    const built = buildDatatourismeDiscoveryProjection(approvedSource(), now);
    assert.ok(built);
    assert.throws(() => projectionResultDto({ ...built, id: `event_${built.data.sourceId}` }), /INVALID_DISCOVERY_PROJECTION/);
    assert.throws(() => projectionResultDto({ ...built, data: { ...built.data, origin: 'native' } }), /INVALID_DISCOVERY_PROJECTION/);
    const native = projectionResultDto({ id: 'event_source', data: {
      contentType: 'event', sourceId: 'source', title: 'Event natif fictif', slug: 'event-natif',
      position: { lat: 47.657, lng: -2.76 }, typeId: 'concert', categoryId: 'music',
      timePrecision: 'datetime', timezone: 'Europe/Paris',
      windowStartAt: built.data.windowStartAt, windowEndAt: built.data.windowEndAt,
    } });
    assert.equal(native.id, 'event_source');
    assert.equal(native.slug, 'event-natif');
    assert.equal(native.origin, undefined);
  });

  it('omits a non-HTTPS source link and never copies private source metadata', () => {
    const source = approvedSource();
    const built = buildDatatourismeDiscoveryProjection({ ...source, sourceUrl: 'http://example.test/fictif' }, now);
    assert.ok(built);
    assert.equal(built.data.sourceUrl, null);
    assert.equal(JSON.stringify(projectionResultDto(built)).includes(source.sourceUuid), false);
  });

  it('orders native results before external results without displacing either', async () => {
    const built = buildDatatourismeDiscoveryProjection(approvedSource(), now);
    assert.ok(built);
    const native = { id: 'event_native', data: {
      contentType: 'event', sourceId: 'native', title: 'Event natif fictif', slug: 'event-natif',
      position: { lat: 47.8, lng: -2.76 }, typeId: 'concert', categoryId: 'music',
      timePrecision: 'date', timezone: 'Europe/Paris', startDay: '2026-10-25', endDay: '2026-10-25',
      windowStartAt: built.data.windowStartAt, windowEndAt: built.data.windowEndAt,
    } };
    const found = await executeDiscoverySearch(request('2026-10-25'), instant(now), [['a', 'z']],
      reader([built, native]));
    assert.deepEqual(found.results.map((result) => result.id), ['event_native', built.id]);
  });
});
