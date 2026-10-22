import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import external from '../functions/lib/datatourisme-external.js';

const { externalEventId, externalEventPath, matchesExternalIdentity, isExternalEvent,
  prepareDatatourismeCandidate, reconcileExternalCandidate, decideExternalCleanup } = external;
const uuid = '11111111-2222-3333-4444-555555555555';
const at = (value) => new Date(value);
const now = at('2026-10-22T12:00:00Z');
const source = (periods = [{ startDate: '2026-10-25', endDate: '2026-10-25' }]) => ({
  uuid, uri: `https://data.datatourisme.fr/${uuid}`, label: { '@fr': 'Concert du port', '@en': 'Harbour concert' },
  hasDescription: [{ description: { '@fr': 'Une soirée musicale au port.' } }],
  hasBeenCreatedBy: { legalName: 'Office de tourisme' },
  hasBeenPublishedBy: [{ legalName: 'DATAtourisme partenaire' }],
  type: [{ uri: 'https://example.test/Product' }, { uri: 'https://example.test/PointOfInterest' }, { uri: 'https://example.test/Concert' }],
  hasTheme: [], takesPlaceAt: periods,
  isLocatedAt: [{ address: [{ hasAddressCity: { label: { '@fr': 'Vannes' }, isPartOfDepartment: { insee: '56' } } }],
    geo: { latitude: 47.657, longitude: -2.76 } }],
});
const prepare = (poi = source(), extras = {}) => prepareDatatourismeCandidate({
  expectedUuid: uuid, expectedDepartment: '56', complete: true, poi,
  timezone: 'Europe/Paris', now, ...extras,
});
const reasons = (result) => result.kind === 'rejected' ? result.reasons : [];

describe('private DATAtourisme source candidate', () => {
  it('keeps all normalized data, deterministic identity and draft publication', () => {
    const result = prepare();
    assert.equal(result.kind, 'accepted');
    assert.equal(result.event.id, externalEventId(uuid));
    assert.equal(externalEventPath(uuid), `datatourisme_events/${result.event.id}`);
    assert.equal(externalEventPath('../events/bad'), null);
    assert.equal(result.event.origin, 'datatourisme');
    assert.equal(result.event.editorial.categoryId, 'music');
    assert.equal(result.event.editorial.editorialType, 'Concert');
    assert.equal(result.event.editorial.sourceTypes.length, 3);
    assert.equal(result.event.periods.length, 1);
    assert.equal(result.event.publication.state, 'draft');
    assert.deepEqual(result.event.projectionIds, []);
    assert.equal(result.event.expiresAt, '2026-10-25T23:00:00.000Z');
    assert.equal(isExternalEvent(result.event), true);
    assert.equal(matchesExternalIdentity(result.event, uuid), true);
    assert.equal(JSON.stringify(result).includes('top-secret'), false);
  });

  it('refuses UUID mismatch, multiple periods, missing end and expired dates', () => {
    assert.ok(reasons(prepare({ ...source(), uuid: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee' })).includes('UUID_INCOHERENT'));
    assert.ok(reasons(prepare(source([{ startDate: '2026-10-25', endDate: '2026-10-25' }, { startDate: '2026-10-30', endDate: '2026-10-30' }]))).includes('PERIOD_COUNT_UNSUPPORTED'));
    assert.ok(reasons(prepare(source([{ startDate: '2026-10-25' }]))).includes('PERIOD_END_MISSING'));
    assert.ok(reasons(prepare(source([{ startDate: '2026-10-01', endDate: '2026-10-01' }]))).includes('EXPIRED'));
    assert.ok(reasons(prepare(source([{ startDate: '2026-10-25', endDate: '2026-10-24' }]))).includes('PERIOD_INVALID'));
    assert.ok(reasons(prepare(source([{ startDate: '2026-10-25', endDate: '2026-10-26' }]))).includes('PERIOD_MULTI_DAY_UNVERIFIED'));
    assert.ok(reasons(prepare(source([{ startDate: '2026-10-25', endDate: '2026-10-25', appliesOnDay: ['Monday'] }]))).includes('PERIOD_RECURRENT_UNSUPPORTED'));
  });

  it('rejects incomplete source, invalid zone or location and missing mandatory data', () => {
    assert.ok(reasons(prepare(source(), { complete: false })).includes('SOURCE_INCOMPLETE'));
    assert.ok(reasons(prepare(source(), { timezone: 'bad/zone' })).includes('TIMEZONE_INVALID'));
    assert.ok(reasons(prepare({ ...source(), isLocatedAt: [] })).includes('LOCATION_UNUSABLE'));
    assert.ok(reasons(prepare({ ...source(), hasDescription: [] })).includes('CONTENT_INCOMPLETE'));
    assert.ok(reasons(prepare({ ...source(), hasBeenCreatedBy: {} })).includes('CONTENT_INCOMPLETE'));
    assert.ok(reasons(prepare({ ...source(), type: [] }, { manualCategory: 'music' })).includes('SOURCE_TYPES_MISSING'));
  });

  it('requires review for ambiguous types and preserves an explicit manual correction', () => {
    const ambiguous = { ...source(), type: [{ uri: 'https://example.test/Concert' }, { uri: 'https://example.test/TheaterEvent' }] };
    assert.ok(reasons(prepare(ambiguous)).includes('CLASSIFICATION_REVIEW_REQUIRED'));
    const manuallyReviewed = prepare(ambiguous, { manualCategory: 'culture' });
    assert.equal(manuallyReviewed.kind, 'accepted');
    assert.equal(manuallyReviewed.event.editorial.categoryMode, 'manual');
    assert.equal(manuallyReviewed.event.editorial.categoryId, 'culture');
    const existing = { ...manuallyReviewed.event, publication: { state: 'hidden' } };
    const updated = reconcileExternalCandidate(existing, prepare().event);
    assert.equal(updated.kind, 'accepted');
    assert.equal(updated.event.editorial.categoryId, 'culture');
    assert.equal(updated.event.editorial.categoryMode, 'manual');
    assert.equal(updated.event.publication.state, 'hidden');
  });

  it('blocks collisions and malformed native paths', () => {
    const candidate = prepare().event;
    const collision = { ...candidate, sourceUuid: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee' };
    assert.deepEqual(reconcileExternalCandidate(collision, candidate), { kind: 'rejected', reasons: ['IDENTITY_COLLISION_OR_INVALID_STORED_RECORD'] });
    assert.equal(isExternalEvent({ ...candidate, id: 'event_native' }), false);
    assert.equal(isExternalEvent({ ...candidate, origin: 'event' }), false);
  });

  it('makes only safe simulated cleanup decisions', () => {
    const base = prepare().event;
    assert.equal(decideExternalCleanup(base, now).action, 'keep');
    const projected = { ...base, publication: { state: 'approved' }, projectionIds: [`datatourisme_${base.id}`] };
    const projection = { id: `datatourisme_${base.id}`, origin: 'datatourisme', sourceId: base.id };
    assert.equal(decideExternalCleanup(projected, now).action, 'defer_review');
    assert.equal(decideExternalCleanup(projected, now, 30, { ...projection, origin: 'native' }).action, 'defer_review');
    assert.equal(decideExternalCleanup({ ...projected, publication: { state: 'hidden' } }, now, 30, projection).action, 'hide_publicly');
    assert.equal(decideExternalCleanup(projected, at('2026-10-26T00:00:00Z'), 30, projection).action, 'defer_review');
    const verified = { ...projected, sync: { ...base.sync, lastSuccessfulAt: '2026-10-26T00:00:00.000Z' } };
    assert.deepEqual(decideExternalCleanup(verified, at('2026-10-26T00:00:00Z'), 30, projection),
      { action: 'defer_review', reason: 'TEMPORAL_EXHAUSTIVENESS_UNPROVEN' });
    assert.equal(decideExternalCleanup({ ...projected, completeness: 'incomplete' }, at('2026-10-26T00:00:00Z'), 30, projection).action, 'defer_review');
    assert.equal(decideExternalCleanup({ ...projected, sync: { ...base.sync, state: 'error' } }, at('2026-10-26T00:00:00Z'), 30, projection).action, 'defer_review');
    assert.equal(decideExternalCleanup({ ...projected, sync: { ...base.sync, lastSuccessfulAt: '2026-10-27T00:00:00.000Z' } }, at('2026-10-26T00:00:00Z'), 30, projection).action, 'defer_review');
    assert.equal(decideExternalCleanup({ ...projected, periods: [{ timePrecision: 'date', startDay: '2026-10-25', endDay: null }], expiresAt: null }, at('2026-12-01T00:00:00Z')).action, 'defer_review');
    assert.equal(decideExternalCleanup({ ...base, origin: 'native' }, at('2026-12-01T00:00:00Z')).action, 'defer_review');
    assert.equal(decideExternalCleanup({ ...base, sync: { ...base.sync, lastSuccessfulAt: '2026-10-26T00:00:00.000Z' } }, at('2026-11-26T00:00:00Z')).action, 'defer_review');
    assert.equal(decideExternalCleanup(base, at('2026-11-26T00:00:00Z')).action, 'defer_review');
  });
});
