import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import detail from '../functions/lib/datatourisme-detail.js';

const { canonicalDatatourismeUuid, fetchDatatourismeDetail,
  fetchAttestedDatatourismeDetail, verifyAttestedDatatourismeDetail } = detail;
const uuid = '11111111-2222-3333-4444-555555555555';

describe('inactive DATAtourisme detail adapter', () => {
  it('validates UUID before accessing a key or network', async () => {
    let calls = 0;
    const result = await fetchDatatourismeDetail('../events/private', () => { calls++; return 'secret'; }, async () => { calls++; throw Error('unexpected'); });
    assert.deepEqual(result, { kind: 'error', reason: 'invalid_uuid' });
    assert.equal(calls, 0);
    assert.equal(canonicalDatatourismeUuid(uuid.toUpperCase()), uuid);
  });

  it('uses only fixed catalog host, explicit fields, server header and bounded request settings', async () => {
    let calls = 0;
    const fetcher = async (url, options) => {
      calls++;
      assert.equal(url.origin, 'https://api.datatourisme.fr');
      assert.equal(url.pathname, `/v1/catalog/${uuid}`);
      assert.equal(url.searchParams.get('lang'), 'fr,en');
      assert.match(url.searchParams.get('fields'), /takesPlaceAt/);
      assert.match(url.searchParams.get('fields'), /hasDescription/);
      assert.match(url.searchParams.get('fields'), /isLocatedAt\.label/);
      assert.equal(url.href.includes('top-secret'), false);
      assert.equal(options.headers['X-API-Key'], 'top-secret');
      assert.equal(options.redirect, 'error');
      assert.equal(options.signal.aborted, false);
      return Response.json({ uuid });
    };
    assert.deepEqual(await fetchDatatourismeDetail(uuid, () => 'top-secret', fetcher), { kind: 'found', poi: { uuid }, complete: true });
    assert.equal(calls, 1);
  });

  it('distinguishes not found, quota, unavailable and invalid responses without raw bodies', async () => {
    const mock = (status, body) => async () => new Response(body, { status });
    assert.deepEqual(await fetchDatatourismeDetail(uuid, () => 'key', mock(404, 'secret in body')), { kind: 'not_found' });
    assert.deepEqual(await fetchDatatourismeDetail(uuid, () => 'key', mock(429, 'secret in body')), { kind: 'error', reason: 'quota' });
    assert.deepEqual(await fetchDatatourismeDetail(uuid, () => 'key', mock(500, 'secret in body')), { kind: 'error', reason: 'unavailable' });
    assert.deepEqual(await fetchDatatourismeDetail(uuid, () => 'key', mock(200, '{broken')), { kind: 'error', reason: 'invalid_response' });
    assert.deepEqual(await fetchDatatourismeDetail(uuid, () => 'key', async () => Response.json({ uuid: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee' })), { kind: 'error', reason: 'invalid_response' });
    assert.deepEqual(await fetchDatatourismeDetail(uuid, () => 'key', async () => { throw Error('secret in error'); }), { kind: 'error', reason: 'unavailable' });
  });

  it('rejects oversized responses and absent configuration', async () => {
    assert.deepEqual(await fetchDatatourismeDetail(uuid, () => '', async () => { throw Error('unexpected'); }), { kind: 'error', reason: 'not_configured' });
    const tooLarge = async () => new Response('x'.repeat(2_000_001));
    assert.deepEqual(await fetchDatatourismeDetail(uuid, () => 'key', tooLarge), { kind: 'error', reason: 'too_large' });
  });

  it('attests the fetched UUID and exact response only inside the server process', async () => {
    const poi = { uuid, takesPlaceAt: [{ startDate: '2026-10-25', endDate: '2026-10-25' }] };
    const token = await fetchAttestedDatatourismeDetail(uuid, 'Europe/Paris', () => 'simulated-key',
      async () => Response.json(poi));
    assert.equal(token.kind, 'attested');
    assert.deepEqual(token.temporal, { httpUsable: true, periodsReceived: 1, pilotCompatible: true,
      exhaustive: false, reason: null });
    assert.equal(verifyAttestedDatatourismeDetail(token, uuid, 'Europe/Paris').detail.poi.uuid, uuid);
    assert.equal(verifyAttestedDatatourismeDetail(token, 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee', 'Europe/Paris'), null);
    assert.equal(verifyAttestedDatatourismeDetail(token, uuid, 'America/New_York'), null);
    assert.equal(verifyAttestedDatatourismeDetail(JSON.parse(JSON.stringify(token)), uuid, 'Europe/Paris'), null);
    assert.equal(verifyAttestedDatatourismeDetail({ ...token }, uuid, 'Europe/Paris'), null);
    verifyAttestedDatatourismeDetail(token, uuid, 'Europe/Paris').detail.poi.takesPlaceAt[0].endDate = '2026-10-26';
    assert.equal(verifyAttestedDatatourismeDetail(token, uuid, 'Europe/Paris').temporalIssue, null);
    poi.takesPlaceAt[0].endDate = '2026-10-26';
    assert.equal(verifyAttestedDatatourismeDetail(token, uuid, 'Europe/Paris').temporalIssue, null);
  });

  it('separates usable HTTP from ambiguous temporal data', async () => {
    const token = await fetchAttestedDatatourismeDetail(uuid, 'Europe/Paris', () => 'simulated-key',
      async () => Response.json({ uuid, takesPlaceAt: [{ startDate: '2026-10-25', endDate: '2026-10-25', weekOfMonth: [4] }] }));
    assert.equal(token.kind, 'attested');
    assert.deepEqual(token.temporal, { httpUsable: true, periodsReceived: 1, pilotCompatible: false,
      exhaustive: false, reason: 'PERIOD_RECURRENT_UNSUPPORTED' });
    assert.equal(verifyAttestedDatatourismeDetail(token, uuid, 'Europe/Paris').temporalIssue, 'PERIOD_RECURRENT_UNSUPPORTED');
  });
});
