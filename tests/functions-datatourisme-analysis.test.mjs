import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import analysis from '../functions/lib/datatourisme-analysis.js';

const { analyzeDatatourisme, validateAnalysisRequest } = analysis;
const request = { department: '22', page: 1 };
const now = new Date('2026-10-22T12:00:00Z');
const source = {
  uuid: 'source-1', uri: 'https://data.datatourisme.fr/source-1',
  label: { '@en': 'Festival in Dinan', '@fr': 'Festival à Dinan' },
  type: [{ label: { '@en': 'Festival', '@fr': 'Festival' }, key: 'festival' }],
  hasTheme: [{ label: { '@en': 'Music', '@fr': 'Musique' }, key: 'music' }],
  takesPlaceAt: [{ startDate: '2027-06-14' }],
  isLocatedAt: [{ geo: { latitude: 48.45, longitude: -2.05 }, address: [{
    hasAddressCity: { label: 'Dinan', isPartOfDepartment: { insee: '22' } }
  }] }],
  hasDescription: [{ description: { '@en': 'A local festival.' } }, { description: { '@fr': 'Une fête locale.' } }],
  hasBeenCreatedBy: { legalName: 'Office de tourisme' },
  hasBeenPublishedBy: [{ legalName: 'Destination Bretagne' }],
  lastUpdate: '2026-10-20T10:00:00Z'
};

function fakeDb(role = 'owner') {
  const reads = [];
  const db = {
    doc(path) {
      reads.push(path);
      return { get: async () => ({ data: () => ({ role }) }) };
    },
    collection() { throw new Error('Firestore write or collection access forbidden'); },
    batch() { throw new Error('Firestore write forbidden'); },
    runTransaction() { throw new Error('Firestore write forbidden'); }
  };
  return { db, reads };
}

function fakeFetch(objects = [source], total = objects.length, status = 200) {
  const calls = [];
  const fetcher = async (url, options) => {
    calls.push({ url: url.toString(), options });
    return new Response(JSON.stringify({ objects, meta: { total, page: Number(url.searchParams.get('page')), next: 'https://untrusted.example/next?api_key=leak' } }), { status });
  };
  return { fetcher, calls };
}

describe('DATAtourisme read-only analysis', () => {
  it('rejects unauthenticated and non-owner users before using the secret or API', async () => {
    const { db, reads } = fakeDb('user');
    let accessed = false;
    const key = () => { accessed = true; return 'test-only-key'; };
    const noFetch = async () => { throw new Error('External call forbidden'); };
    await assert.rejects(analyzeDatatourisme(db, undefined, request, key, noFetch), { code: 'unauthenticated' });
    await assert.rejects(analyzeDatatourisme(db, 'user-1', request, key, noFetch), { code: 'permission-denied' });
    assert.deepEqual(reads, ['users/user-1']);
    assert.equal(accessed, false);
  });

  it('validates exact pilot departments and a bounded page number', async () => {
    for (const department of ['21', '2A', '35,56', 22, null]) {
      assert.throws(() => validateAnalysisRequest({ department, page: 1 }), { code: 'invalid-argument' });
    }
    for (const page of [0, 6, 1.5, '1', null]) {
      assert.throws(() => validateAnalysisRequest({ department: '22', page }), { code: 'invalid-argument' });
    }
    assert.throws(() => validateAnalysisRequest({ ...request, page_size: 1000 }), { code: 'invalid-argument' });
    for (const department of ['22', '29', '35', '56']) {
      assert.deepEqual(validateAnalysisRequest({ department, page: 5 }), { department, page: 5 });
    }
    let accessed = false;
    await assert.rejects(analyzeDatatourisme(fakeDb().db, 'owner-1', { department: '21', page: 1 },
      () => { accessed = true; return 'test-only-key'; }, async () => { throw new Error('External call forbidden'); }), { code: 'invalid-argument' });
    assert.equal(accessed, false);
  });

  it('lets an owner examine future events without an end date and keeps secret server-side', async () => {
    const { db, reads } = fakeDb();
    const { fetcher, calls } = fakeFetch([source], 120);
    const result = await analyzeDatatourisme(db, 'owner-1', request, () => 'test-only-key', fetcher, now);
    assert.deepEqual(reads, ['users/owner-1']);
    assert.equal(result.meta.examinedCount, 1);
    assert.equal(result.meta.apiTotal, 120);
    assert.equal(result.meta.hasNextPage, false);
    assert.equal(result.candidates[0].quality, 'acceptable');
    assert.equal(result.candidates[0].title, 'Festival à Dinan');
    assert.equal(result.candidates[0].description, 'Une fête locale.');
    assert.equal(result.candidates[0].category, 'Festival');
    assert.equal(result.candidates[0].subcategory, 'Musique');
    assert.equal(result.candidates[0].endDay, null);
    assert.equal(result.candidates[0].producer, 'Office de tourisme');
    assert.equal(result.candidates[0].provenance, 'Destination Bretagne');
    assert.equal(result.candidates[0].sourceUrl, source.uri);
    assert.equal(calls[0].options.headers['X-API-Key'], 'test-only-key');
    assert.equal(calls[0].url.includes('test-only-key'), false);
    assert.equal(calls[0].options.redirect, 'error');
    assert.equal(calls.length, 1);
    assert.equal(new URL(calls[0].url).host, 'api.datatourisme.fr');
    assert.equal(JSON.stringify(result).includes('test-only-key'), false);
    assert.equal(new URL(calls[0].url).searchParams.get('page_size'), '25');
    assert.equal(new URL(calls[0].url).searchParams.get('department'), '22');
    const fields = new URL(calls[0].url).searchParams.get('fields').split(',');
    for (const field of ['label', 'hasDescription', 'takesPlaceAt', 'isLocatedAt.address', 'isLocatedAt.geo', 'hasBeenCreatedBy.legalName', 'hasBeenPublishedBy.legalName', 'uuid']) {
      assert.ok(fields.includes(field), `${field} must be requested explicitly`);
    }
  });

  it('selects a matching department and coordinates among multiple locations', async () => {
    const extra = { ...source, isLocatedAt: [
      { address: [{ hasAddressCity: { label: 'Rennes', isPartOfDepartment: { insee: '35' } } }] },
      { geo: { latitude: 48.45, longitude: -2.05 }, address: [
        { hasAddressCity: { label: 'Quimper', isPartOfDepartment: { insee: '29' } } },
        { hasAddressCity: { label: 'Dinan', isPartOfDepartment: { insee: '22' } } }
      ] }
    ] };
    const result = await analyzeDatatourisme(fakeDb().db, 'owner-1', request, () => 'test-only-key', fakeFetch([extra]).fetcher, now);
    assert.equal(result.candidates[0].department, '22');
    assert.equal(result.candidates[0].city, 'Dinan');
    assert.deepEqual(result.candidates[0].location, { lat: 48.45, lng: -2.05 });
    assert.equal(result.candidates[0].quality, 'acceptable');
  });

  it('rejects absent or malformed dates, missing producers and a mismatched department', async () => {
    const objects = [
      { ...source, uuid: 'no-date', takesPlaceAt: [] },
      { ...source, uuid: 'bad-end', takesPlaceAt: [{ startDate: '2027-06-14', endDate: 'not-a-date' }] },
      { ...source, uuid: 'no-producer', hasBeenCreatedBy: null },
      { ...source, uuid: 'wrong-department', isLocatedAt: [{ geo: { latitude: 48.45, longitude: -2.05 }, address: [{ hasAddressCity: { label: 'Rennes', isPartOfDepartment: { insee: '35' } } }] }] }
    ];
    const result = await analyzeDatatourisme(fakeDb().db, 'owner-1', request, () => 'test-only-key', fakeFetch(objects).fetcher, now);
    assert.ok(result.candidates.every((candidate) => candidate.quality === 'rejete'));
    assert.equal(result.candidates[0].startDay, null);
    assert.ok(result.candidates[1].reasons.some((reason) => reason.includes('incohérentes')));
    assert.equal(result.candidates[2].producer, null);
    assert.equal(result.candidates[3].department, '35');
  });

  it('marks incomplete, inconsistent and possible duplicate records without deleting anything', async () => {
    const missing = { ...source, uuid: 'source-2', hasDescription: [], isLocatedAt: [{ address: [{ hasAddressCity: { label: 'Dinan', isPartOfDepartment: { insee: '22' } } }] }] };
    const invalid = { ...source, uuid: 'source-3', takesPlaceAt: [{ startDate: '2027-06-14', endDate: '2027-01-01' }], hasBeenCreatedBy: {} };
    const { db } = fakeDb();
    const { fetcher } = fakeFetch([source, missing, invalid]);
    const result = await analyzeDatatourisme(db, 'owner-1', request, () => 'test-only-key', fetcher, now);
    assert.equal(result.candidates[0].possibleDuplicate, true);
    assert.equal(result.candidates[0].quality, 'a_verifier');
    assert.equal(result.candidates[1].quality, 'a_verifier');
    assert.equal(result.candidates[1].positionPrecision, 'commune_only');
    assert.equal(result.candidates[2].quality, 'rejete');
    assert.ok(result.candidates[2].reasons.some((reason) => reason.includes('incohérentes')));
  });

  it('caps response volume and reports quota/configuration errors without leaking upstream details', async () => {
    const { db } = fakeDb();
    await assert.rejects(analyzeDatatourisme(db, 'owner-1', request, () => '', fakeFetch().fetcher, now), { code: 'failed-precondition' });
    await assert.rejects(analyzeDatatourisme(db, 'owner-1', request, () => 'secret', fakeFetch([], 0, 429).fetcher, now), { code: 'resource-exhausted' });
    await assert.rejects(analyzeDatatourisme(db, 'owner-1', request, () => 'secret', async () => {
      throw new Error('upstream included secret');
    }, now), (error) => error.code === 'unavailable' && !error.message.includes('secret'));
    const large = fakeFetch(Array.from({ length: 26 }, () => source));
    await assert.rejects(analyzeDatatourisme(db, 'owner-1', request, () => 'secret', large.fetcher, now), { code: 'unavailable' });
    const oversized = fakeFetch([{ ...source, hasDescription: [{ description: 'x'.repeat(2_000_001) }] }]);
    await assert.rejects(analyzeDatatourisme(db, 'owner-1', request, () => 'secret', oversized.fetcher, now), { code: 'resource-exhausted' });
    const validPage = fakeFetch(Array.from({ length: 25 }, (_, index) => ({ ...source, uuid: `source-${index}`, label: `Festival ${index}` })), 200);
    const result = await analyzeDatatourisme(db, 'owner-1', request, () => 'secret', validPage.fetcher, now);
    assert.equal(result.meta.hasNextPage, true);
    const lastPage = await analyzeDatatourisme(db, 'owner-1', { department: '22', page: 5 }, () => 'secret', validPage.fetcher, now);
    assert.equal(lastPage.meta.hasNextPage, false);
  });
});
