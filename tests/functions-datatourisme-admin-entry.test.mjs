import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';
import { createRequire } from 'node:module';
import { initializeTestEnvironment } from '@firebase/rules-unit-testing';
import adminEntry from '../functions/lib/datatourisme-admin-entry.js';
import callables from '../functions/lib/datatourisme-admin-callables.js';
import external from '../functions/lib/datatourisme-external.js';

const { validateOwnerDatatourismeCommand, executeOwnerDatatourismeDetailCommand,
  executeOwnerDatatourismePublicationCommand } = adminEntry;
const { externalEventId, prepareDatatourismeCandidate } = external;
const { handleDatatourismeImportOrSync, handleDatatourismePublication,
  importOrSyncDatatourismeEvent, publishOrHideDatatourismeEvent } = callables;
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
    await assert.rejects(executeOwnerDatatourismeDetailCommand(db, 'owner-1',
      { ...detailCommand, action: 'sync' }, key, fetcher, now), { code: 'permission-denied' });
    assert.deepEqual(reads, ['users/owner-1', 'users/owner-1']);
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

describe('exported DATAtourisme callables', () => {
  it('exports exactly the two expected names and binds distinct service identities', async () => {
    const { readFile } = await import('node:fs/promises');
    const index = await readFile(new URL('../functions/src/index.ts', import.meta.url), 'utf8');
    assert.match(index, /export\s*\{\s*importOrSyncDatatourismeEvent,\s*publishOrHideDatatourismeEvent\s*\}\s*from\s*['"]\.\/datatourisme-admin-callables['"]/);
    assert.equal(importOrSyncDatatourismeEvent.__endpoint.region[0], 'europe-west1');
    assert.equal(importOrSyncDatatourismeEvent.__endpoint.serviceAccountEmail,
      'datatourisme-import@spotly-app-events.iam.gserviceaccount.com');
    assert.equal(publishOrHideDatatourismeEvent.__endpoint.serviceAccountEmail,
      'datatourisme-publication@spotly-app-events.iam.gserviceaccount.com');
    assert.equal(publishOrHideDatatourismeEvent.__endpoint.secretEnvironmentVariables?.length ?? 0, 0);
  });

  it('uses only Auth UID and rejects invalid or sensitive client fields before upstream access', async () => {
    const { db, reads } = fakeDb();
    let calls = 0;
    const key = () => { calls++; return 'simulated-key'; };
    const fetcher = async () => { calls++; return Response.json(poi()); };
    await assert.rejects(handleDatatourismeImportOrSync({ data: detailCommand }, db, key, fetcher, now),
      { code: 'unauthenticated', message: 'AUTH_REQUIRED' });
    await assert.rejects(handleDatatourismeImportOrSync({ auth: { uid: 'other' },
      data: { ...detailCommand, uid: 'owner-1' } }, db, key, fetcher, now), { code: 'permission-denied' });
    for (const data of [
      { ...detailCommand, uid: 'owner-1' }, { ...detailCommand, url: 'https://example.test/private' },
      { ...detailCommand, detail: { kind: 'attested' } }, { ...detailCommand, apiKey: 'injected' },
      { ...detailCommand, action: 'delete' }, { ...detailCommand, department: '75' },
      { ...detailCommand, mode: 'purge' }, { ...detailCommand, uuid: '../events/native' },
    ]) await assert.rejects(handleDatatourismeImportOrSync({ auth: { uid: 'owner-1' }, data },
      db, key, fetcher, now), { code: 'invalid-argument', message: 'INVALID_DATATOURISME_COMMAND' });
    assert.equal(calls, 0);
    assert.ok(reads.every((path) => path.startsWith('users/')));
  });

  it('hides unexpected errors behind a stable administrative code', async () => {
    const { db } = fakeDb();
    db.runTransaction = async () => { throw new Error('private transaction detail'); };
    await assert.rejects(handleDatatourismeImportOrSync({ auth: { uid: 'owner-1' }, data: detailCommand },
      db, () => 'simulated-key', async () => Response.json(poi()), now),
    { code: 'internal', message: 'DATATOURISME_ADMIN_OPERATION_FAILED' });
  });

  it('rejects ambiguous and recurring periods after a server fetch, without mutation', async () => {
    const { db } = fakeDb();
    for (const periods of [
      [{ startDate: '2026-10-25', endDate: '2026-10-25', weekOfMonth: [4] }],
      [{ startDate: '2026-10-25' }],
      [{ startDate: '2026-10-25', endDate: '2026-10-25' },
        { startDate: '2026-10-30', endDate: '2026-10-30' }],
    ]) {
      const result = await handleDatatourismeImportOrSync({ auth: { uid: 'owner-1' }, data: detailCommand },
        db, () => 'simulated-key', async () => Response.json({ ...poi(), takesPlaceAt: periods }), now);
      assert.equal(result.status, 'deferred');
      assert.match(result.reason, /^PERIOD_/);
    }
  });

  it('accepts only publication commands and keeps the publication handler secret-free', async () => {
    const { db } = fakeDb();
    await assert.rejects(handleDatatourismePublication({ data: publicationCommand }, db, now),
      { code: 'unauthenticated' });
    await assert.rejects(handleDatatourismePublication({ auth: { uid: 'owner-1' },
      data: { ...publicationCommand, projectionId: 'event_native' } }, db, now), { code: 'invalid-argument' });
    await assert.rejects(handleDatatourismePublication({ auth: { uid: 'owner-1' }, data: detailCommand },
      db, now), { code: 'invalid-argument' });
  });
});

describe('prepared handlers against local Firestore', { skip: !process.env.FIRESTORE_EMULATOR_HOST }, () => {
  const projectId = 'demo-datatourisme-admin-callables';
  const requireFunctions = createRequire(new URL('../functions/package.json', import.meta.url));
  const { initializeApp, deleteApp } = requireFunctions('firebase-admin/app');
  const { getFirestore } = requireFunctions('firebase-admin/firestore');
  const sourceId = externalEventId(uuid);
  const sourcePath = `datatourisme_events/${sourceId}`;
  const publicPath = `discovery_public/datatourisme_${sourceId}`;
  let environment;
  let app;
  let db;
  let accessed;
  let guardedDb;

  before(async () => {
    assert.match(process.env.FIRESTORE_EMULATOR_HOST, /^(127\.0\.0\.1|localhost):\d+$/);
    environment = await initializeTestEnvironment({ projectId });
    app = initializeApp({ projectId }, 'datatourisme-admin-callables-review');
    db = getFirestore(app);
    guardedDb = {
      doc(path) {
        accessed.push(path);
        assert.equal(path.startsWith('events/'), false);
        return db.doc(path);
      },
      runTransaction: (callback) => db.runTransaction(callback),
    };
  });
  beforeEach(async () => {
    await environment.clearFirestore();
    accessed = [];
    await db.doc('users/owner-1').set({ role: 'owner' });
    await db.doc('users/member-1').set({ role: 'user' });
    await db.doc('datatourisme_control/bretagne_pilot').set({
      origin: 'datatourisme', version: 1, maxSources: 100, sourceCount: 0,
    });
  });
  after(async () => {
    if (environment) await environment.cleanup();
    if (app) await deleteApp(app);
  });

  const request = (data, uid = 'owner-1') => ({ auth: { uid }, data });
  const detail = (data) => handleDatatourismeImportOrSync(request(data), guardedDb,
    () => 'simulated-key', async () => Response.json(poi()), now);

  it('authorizes before business reads, applies one import, and keeps repeat import idempotent', async () => {
    await assert.rejects(handleDatatourismeImportOrSync(request({ ...detailCommand, mode: 'apply' }, 'member-1'),
      guardedDb, () => { throw new Error('SECRET_ACCESSED'); }, async () => { throw new Error('API_CALLED'); }, now),
    { code: 'permission-denied' });
    assert.deepEqual(accessed, ['users/member-1']);
    assert.equal((await db.doc(sourcePath).get()).exists, false);
    const preview = await detail(detailCommand);
    assert.equal(preview.status, 'would_apply');
    assert.equal((await db.doc(sourcePath).get()).exists, false);
    const applied = await detail({ ...detailCommand, mode: 'apply' });
    assert.equal(applied.reason, 'SOURCE_CREATED');
    const first = await db.doc(sourcePath).get();
    assert.equal(first.exists, true);
    const repeated = await detail({ ...detailCommand, mode: 'apply' });
    assert.equal(repeated.reason, 'SOURCE_ALREADY_IMPORTED');
    assert.equal((await db.doc(sourcePath).get()).updateTime.isEqual(first.updateTime), true);
    assert.equal((await db.doc('datatourisme_control/bretagne_pilot').get()).data().sourceCount, 1);
    assert.equal((await db.collection('events').get()).size, 0);
    assert.ok(accessed.every((path) => !path.startsWith('events/')));
  });

  it('defers absent and full counters without creating a source', async () => {
    await db.doc('datatourisme_control/bretagne_pilot').delete();
    assert.equal((await detail({ ...detailCommand, mode: 'apply' })).reason,
      'PILOT_COUNTER_UNINITIALIZED_OR_INVALID');
    await db.doc('datatourisme_control/bretagne_pilot').set({
      origin: 'datatourisme', version: 1, maxSources: 100, sourceCount: 100,
    });
    assert.equal((await detail({ ...detailCommand, mode: 'apply' })).reason, 'PILOT_LIMIT_REACHED');
    assert.equal((await db.doc(sourcePath).get()).exists, false);
  });

  it('publishes and hides only a linked external projection while retaining editorial corrections', async () => {
    await detail({ ...detailCommand, mode: 'apply' });
    const original = (await db.doc(sourcePath).get()).data();
    await db.doc(sourcePath).update({ editorial: { ...original.editorial,
      categoryMode: 'manual', categoryId: 'music', editorialType: 'Concert édité' } });
    const dry = await handleDatatourismePublication(request(publicationCommand), guardedDb, now);
    assert.equal(dry.status, 'would_apply');
    assert.equal((await db.doc(publicPath).get()).exists, false);
    const publish = await handleDatatourismePublication(request({ ...publicationCommand, mode: 'apply' }), guardedDb, now);
    assert.equal(publish.reason, 'EDITORIAL_PUBLICATION');
    assert.equal((await db.doc(publicPath).get()).data().sourceId, sourceId);
    assert.equal((await db.doc(sourcePath).get()).data().editorial.editorialType, 'Concert édité');
    const sync = await detail({ ...detailCommand, action: 'sync', mode: 'apply' });
    assert.ok(['SOURCE_SYNCHRONIZED', 'NO_USEFUL_CHANGE'].includes(sync.reason));
    assert.equal((await db.doc(sourcePath).get()).data().editorial.editorialType, 'Concert édité');
    const hide = await handleDatatourismePublication(request({ action: 'hide', uuid, mode: 'apply' }), guardedDb, now);
    assert.equal(hide.reason, 'EDITORIAL_HIDE');
    assert.equal((await db.doc(publicPath).get()).exists, false);
    assert.equal((await db.doc(sourcePath).get()).data().editorial.editorialType, 'Concert édité');
    assert.equal((await db.collection('events').get()).size, 0);
  });

  it('previews one approved source against Firestore without changing its documents', async () => {
    await detail({ ...detailCommand, mode: 'apply' });
    await handleDatatourismePublication(request({ ...publicationCommand, mode: 'apply' }), guardedDb, now);
    const beforeSource = await db.doc(sourcePath).get();
    const beforeProjection = await db.doc(publicPath).get();
    const beforeCounter = await db.doc('datatourisme_control/bretagne_pilot').get();
    const changed = { ...poi(), lastUpdate: '2026-10-22T12:00:00Z',
      isLocatedAt: [{ label: { '@fr': 'Salle fictive' }, address: [{
        hasAddressCity: { label: { '@fr': 'Vannes' }, isPartOfDepartment: { insee: '56' } },
        streetAddress: '6 rue du Port', postalCode: '56000',
      }], geo: { latitude: 47.657, longitude: -2.76 } }],
    };
    const result = await handleDatatourismeImportOrSync(request({
      action: 'sync', uuid, department: '56', mode: 'dry-run',
    }), guardedDb, () => 'simulated-key', async () => Response.json(changed), now);
    assert.equal(result.status, 'would_apply');
    assert.equal(result.preview.publicationState, 'approved');
    assert.equal(result.preview.fields.venueName.proposed, 'Salle fictive');
    assert.equal(result.preview.fields.address.proposed, '6 rue du Port, 56000');
    assert.equal(result.preview.fields.sourceUpdatedAt.proposed, '2026-10-22T12:00:00.000Z');
    assert.equal((await db.doc(sourcePath).get()).updateTime.isEqual(beforeSource.updateTime), true);
    assert.equal((await db.doc(publicPath).get()).updateTime.isEqual(beforeProjection.updateTime), true);
    assert.equal((await db.doc('datatourisme_control/bretagne_pilot').get()).updateTime.isEqual(beforeCounter.updateTime), true);
    assert.equal((await db.doc(sourcePath).get()).data().publication.state, 'approved');
    assert.equal((await db.collection('events').get()).size, 0);
    assert.ok(accessed.every((path) => !path.startsWith('events/')));
  });

  it('refuses a foreign projection without changing either document', async () => {
    await detail({ ...detailCommand, mode: 'apply' });
    const foreign = { origin: 'native', contentType: 'event', sourceId: 'native-event' };
    await db.doc(publicPath).set(foreign);
    const result = await handleDatatourismePublication(request({ ...publicationCommand, mode: 'apply' }), guardedDb, now);
    assert.equal(result.reason, 'PROJECTION_IDENTITY_MISMATCH');
    assert.deepEqual((await db.doc(publicPath).get()).data(), foreign);
    assert.equal((await db.doc(sourcePath).get()).data().publication.state, 'draft');
    assert.equal((await db.collection('events').get()).size, 0);
  });
});
