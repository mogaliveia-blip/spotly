import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import adminEntry from '../functions/lib/datatourisme-admin-entry.js';
import external from '../functions/lib/datatourisme-external.js';

const { validateOwnerDatatourismeCommand, executeOwnerDatatourismeDetailCommand,
  executeOwnerDatatourismePublicationCommand } = adminEntry;
const { externalEventId, prepareDatatourismeCandidate } = external;
const uuid = '11111111-2222-3333-4444-555555555555';
const now = new Date('2026-10-22T12:00:00Z');
const detailCommand = { action: 'import', uuid, department: '56', mode: 'dry-run' };
const publicationCommand = { action: 'publish', uuid, mode: 'dry-run' };
const poi = () => ({
  uuid, uri: `https://data.datatourisme.fr/${uuid}`, label: { '@fr': 'Concert fictif' },
  hasDescription: [{ description: { '@fr': 'Description fictive.' } }],
  hasBeenCreatedBy: { legalName: 'Producteur fictif' },
  type: [{ uri: 'https://example.test/Concert' }], takesPlaceAt: [{ startDate: '2026-10-25', endDate: '2026-10-25' }],
  isLocatedAt: [{ address: [{ hasAddressCity: { label: { '@fr': 'Vannes' }, isPartOfDepartment: { insee: '56' } } }],
    geo: { latitude: 47.657, longitude: -2.76 } }],
});

function fakeDb(role = 'owner', source = null) {
  const reads = [];
  const id = externalEventId(uuid);
  const documents = new Map([
    ['users/owner-1', { role }],
    ['datatourisme_control/bretagne_pilot', { origin: 'datatourisme', version: 1, maxSources: 100, sourceCount: Number(!!source) }],
  ]);
  if (source) documents.set(`datatourisme_events/${id}`, source);
  const snapshot = (path) => ({ exists: documents.has(path), data: () => documents.get(path) });
  return {
    reads,
    db: {
      doc(path) {
        reads.push(path);
        return { path, id: path.split('/').at(-1), get: async () => snapshot(path) };
      },
      async runTransaction(callback) {
        return callback({ get: async (ref) => snapshot(ref.path),
          create() { throw new Error('DRY_RUN_WRITE'); }, update() { throw new Error('DRY_RUN_WRITE'); },
          set() { throw new Error('DRY_RUN_WRITE'); }, delete() { throw new Error('DRY_RUN_WRITE'); } });
      },
    },
  };
}

describe('inactive owner DATAtourisme command boundary', () => {
  it('rejects unauthenticated and non-owner callers before accessing the secret or upstream', async () => {
    const { db, reads } = fakeDb('user');
    let keyCalls = 0;
    let fetchCalls = 0;
    const key = () => { keyCalls++; return 'simulated-key'; };
    const fetcher = async () => { fetchCalls++; return Response.json(poi()); };
    await assert.rejects(executeOwnerDatatourismeDetailCommand(db, undefined, detailCommand, key, fetcher, now),
      { code: 'unauthenticated' });
    await assert.rejects(executeOwnerDatatourismeDetailCommand(db, 'owner-1', detailCommand, key, fetcher, now),
      { code: 'permission-denied' });
    assert.deepEqual(reads, ['users/owner-1']);
    assert.deepEqual([keyCalls, fetchCalls], [0, 0]);
  });

  it('accepts only one exact command with a valid UUID, department and mode', () => {
    assert.deepEqual(validateOwnerDatatourismeCommand(detailCommand), detailCommand);
    assert.deepEqual(validateOwnerDatatourismeCommand(publicationCommand), publicationCommand);
    for (const value of [
      { ...detailCommand, department: '21' }, { ...detailCommand, uuid: '../events/a' },
      { ...detailCommand, mode: 'delete' }, { ...detailCommand, sourceId: 'event_native' },
      { ...detailCommand, categoryId: 'music' }, { ...detailCommand, periodsEvidence: 'verified_full_detail' },
      { ...detailCommand, detail: { kind: 'attested', temporal: { exhaustive: true } } },
      { ...detailCommand, sync: { state: 'complete' } },
      { ...publicationCommand, department: '56' }, { ...publicationCommand, projectionId: 'event_native' },
    ]) assert.throws(() => validateOwnerDatatourismeCommand(value), { code: 'invalid-argument' });
  });

  it('lets an owner simulate one server-fetched import without a Firestore mutation', async () => {
    const { db, reads } = fakeDb();
    let calls = 0;
    const result = await executeOwnerDatatourismeDetailCommand(db, 'owner-1', detailCommand,
      () => 'simulated-key', async (url, options) => {
        calls++;
        assert.equal(url.pathname, `/v1/catalog/${uuid}`);
        assert.equal(options.headers['X-API-Key'], 'simulated-key');
        return Response.json(poi());
      }, now);
    assert.equal(calls, 1);
    assert.equal(result.status, 'would_apply');
    assert.equal(result.changes.create, true);
    assert.ok(reads.includes('users/owner-1'));
    assert.ok(reads.every((path) => !path.startsWith('events/')));
    const sync = await executeOwnerDatatourismeDetailCommand(db, 'owner-1',
      { ...detailCommand, action: 'sync' }, () => 'simulated-key', async () => Response.json(poi()), now);
    assert.equal(sync.reason, 'SOURCE_NOT_IMPORTED');
  });

  it('keeps publication and hiding separate from detail retrieval and the secret', async () => {
    const prepared = prepareDatatourismeCandidate({ expectedUuid: uuid, expectedDepartment: '56',
      complete: true, poi: poi(), timezone: 'Europe/Paris', now });
    assert.equal(prepared.kind, 'accepted');
    const { db } = fakeDb('owner', prepared.event);
    const publish = await executeOwnerDatatourismePublicationCommand(db, 'owner-1', publicationCommand, now);
    assert.equal(publish.status, 'would_apply');
    assert.equal(publish.changes.publish, true);
    const hide = await executeOwnerDatatourismePublicationCommand(db, 'owner-1',
      { action: 'hide', uuid, mode: 'dry-run' }, now);
    assert.equal(hide.status, 'would_apply');
    await assert.rejects(executeOwnerDatatourismePublicationCommand(db, 'owner-1', detailCommand, now),
      { code: 'invalid-argument' });
  });
});
