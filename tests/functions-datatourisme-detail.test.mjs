import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import detail from '../functions/lib/datatourisme-detail.js';

const { canonicalDatatourismeUuid, fetchDatatourismeDetail } = detail;
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
});
