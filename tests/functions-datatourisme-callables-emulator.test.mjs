import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';
import { createRequire } from 'node:module';
import { initializeTestEnvironment } from '@firebase/rules-unit-testing';
import { initializeApp as initializeClientApp, deleteApp as deleteClientApp } from 'firebase/app';
import { createUserWithEmailAndPassword, connectAuthEmulator, getAuth } from 'firebase/auth';
import { connectFunctionsEmulator, getFunctions, httpsCallable } from 'firebase/functions';
import external from '../functions/lib/datatourisme-external.js';

const PROJECT_ID = 'demo-datatourisme-callables-c2';
const UUID = '11111111-2222-3333-4444-555555555555';
const sourceId = external.externalEventId(UUID);
const sourcePath = `datatourisme_events/${sourceId}`;
const publicPath = `discovery_public/datatourisme_${sourceId}`;
const counterPath = 'datatourisme_control/bretagne_pilot';
const probePath = 'datatourisme_test/upstream';
const requireFunctions = createRequire(new URL('../functions/package.json', import.meta.url));
const { initializeApp, deleteApp } = requireFunctions('firebase-admin/app');
const { getFirestore } = requireFunctions('firebase-admin/firestore');
const importCommand = { action: 'import', uuid: UUID, department: '56', mode: 'apply' };
const publishCommand = { action: 'publish', uuid: UUID, mode: 'apply' };
let environment;
let adminApp;
let db;
const clientApps = [];
const clients = {};

function makeClient(name) {
  const app = initializeClientApp({ projectId: PROJECT_ID, apiKey: 'demo-api-key' }, name);
  clientApps.push(app);
  const auth = getAuth(app);
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
  const functions = getFunctions(app, 'europe-west1');
  connectFunctionsEmulator(functions, '127.0.0.1', 5001);
  return {
    auth,
    importOrSync: httpsCallable(functions, 'importOrSyncDatatourismeEvent'),
    publishOrHide: httpsCallable(functions, 'publishOrHideDatatourismeEvent'),
  };
}

async function upstreamCount() {
  return (await db.doc(probePath).get()).data()?.count ?? 0;
}

async function assertNoNativeEvents() {
  assert.equal((await db.collection('events').get()).size, 0);
}

before(async () => {
  assert.match(process.env.FIRESTORE_EMULATOR_HOST ?? '', /^(127\.0\.0\.1|localhost):\d+$/);
  assert.match(process.env.FIREBASE_AUTH_EMULATOR_HOST ?? '', /^(127\.0\.0\.1|localhost):\d+$/);
  environment = await initializeTestEnvironment({ projectId: PROJECT_ID });
  adminApp = initializeApp({ projectId: PROJECT_ID }, 'datatourisme-callable-c2-admin');
  db = getFirestore(adminApp);
  clients.anonymous = makeClient('datatourisme-c2-anonymous');
  clients.member = makeClient('datatourisme-c2-member');
  clients.owner = makeClient('datatourisme-c2-owner');
  clients.member.uid = (await createUserWithEmailAndPassword(clients.member.auth,
    'member@example.test', 'fictitious-password-123')).user.uid;
  clients.owner.uid = (await createUserWithEmailAndPassword(clients.owner.auth,
    'owner@example.test', 'fictitious-password-123')).user.uid;
});

beforeEach(async () => {
  await environment.clearFirestore();
  await db.doc(`users/${clients.member.uid}`).set({ role: 'user' });
  await db.doc(`users/${clients.owner.uid}`).set({ role: 'owner' });
  await db.doc(counterPath).set({ origin: 'datatourisme', version: 1, maxSources: 100, sourceCount: 0 });
});

after(async () => {
  for (const app of clientApps) await deleteClientApp(app);
  if (environment) await environment.cleanup();
  if (adminApp) await deleteApp(adminApp);
});

describe('prepared callable protocol on Auth, Functions and Firestore emulators', () => {
  it('rejects unauthenticated calls before fixture retrieval or business reads', async () => {
    await assert.rejects(clients.anonymous.importOrSync(importCommand), { code: 'functions/unauthenticated' });
    await assert.rejects(clients.anonymous.publishOrHide(publishCommand), { code: 'functions/unauthenticated' });
    assert.equal(await upstreamCount(), 0);
    assert.equal((await db.doc(sourcePath).get()).exists, false);
  });

  it('uses Auth UID and server owner role, ignoring a forged client UID', async () => {
    await assert.rejects(clients.member.importOrSync({ ...importCommand, uid: clients.owner.uid }),
      { code: 'functions/permission-denied' });
    await assert.rejects(clients.member.publishOrHide({ ...publishCommand, uid: clients.owner.uid }),
      { code: 'functions/permission-denied' });
    assert.equal(await upstreamCount(), 0);
    assert.equal((await db.doc(sourcePath).get()).exists, false);
  });

  it('rejects invalid or privileged parameters and never fetches a detail for them', async () => {
    for (const data of [
      { ...importCommand, uuid: '../events/native' }, { ...importCommand, department: '75' },
      { ...importCommand, mode: 'purge' }, { ...importCommand, action: 'cleanup' },
      { ...importCommand, uid: clients.owner.uid }, { ...importCommand, url: 'https://example.test' },
      { ...importCommand, detail: { kind: 'attested', temporal: { pilotCompatible: true } } },
      { ...importCommand, apiKey: 'client-secret' },
    ]) await assert.rejects(clients.owner.importOrSync(data), { code: 'functions/invalid-argument' });
    for (const data of [
      { ...publishCommand, action: 'purge' }, { ...publishCommand, projectionId: 'event_native' },
      { ...publishCommand, department: '56' },
    ]) await assert.rejects(clients.owner.publishOrHide(data), { code: 'functions/invalid-argument' });
    assert.equal(await upstreamCount(), 0);
    await assertNoNativeEvents();
  });

  it('supports a dry-run, imports once and preserves the shared pilot counter', async () => {
    const preview = (await clients.owner.importOrSync({ ...importCommand, mode: 'dry-run' })).data;
    assert.equal(preview.status, 'would_apply');
    assert.equal((await db.doc(sourcePath).get()).exists, false);
    assert.equal((await db.doc(counterPath).get()).data().sourceCount, 0);
    const first = (await clients.owner.importOrSync(importCommand)).data;
    assert.equal(first.reason, 'SOURCE_CREATED');
    const snapshot = await db.doc(sourcePath).get();
    assert.equal(snapshot.exists, true);
    assert.equal(snapshot.data().publication.state, 'draft');
    const repeat = (await clients.owner.importOrSync(importCommand)).data;
    assert.equal(repeat.reason, 'SOURCE_ALREADY_IMPORTED');
    assert.equal((await db.doc(sourcePath).get()).updateTime.isEqual(snapshot.updateTime), true);
    assert.equal((await db.doc(counterPath).get()).data().sourceCount, 1);
    assert.equal((await db.collection('datatourisme_events').get()).size, 1);
    await assertNoNativeEvents();
  });

  it('refuses a new source when the pilot counter is absent or at 100', async () => {
    await db.doc(counterPath).delete();
    assert.equal((await clients.owner.importOrSync(importCommand)).data.reason,
      'PILOT_COUNTER_UNINITIALIZED_OR_INVALID');
    await db.doc(counterPath).set({ origin: 'datatourisme', version: 1, maxSources: 100, sourceCount: 100 });
    assert.equal((await clients.owner.importOrSync(importCommand)).data.reason, 'PILOT_LIMIT_REACHED');
    assert.equal((await db.doc(sourcePath).get()).exists, false);
    assert.equal((await db.doc(counterPath).get()).data().sourceCount, 100);
  });

  it('publishes and hides only the linked external projection, with publication dry-run', async () => {
    await clients.owner.importOrSync(importCommand);
    const preview = (await clients.owner.publishOrHide({ ...publishCommand, mode: 'dry-run' })).data;
    assert.equal(preview.status, 'would_apply');
    assert.equal((await db.doc(publicPath).get()).exists, false);
    assert.equal((await clients.owner.publishOrHide(publishCommand)).data.reason, 'EDITORIAL_PUBLICATION');
    assert.equal((await db.doc(publicPath).get()).data().sourceId, sourceId);
    assert.equal((await db.doc(sourcePath).get()).data().publication.state, 'approved');
    assert.equal((await clients.owner.publishOrHide({ action: 'hide', uuid: UUID, mode: 'apply' })).data.reason,
      'EDITORIAL_HIDE');
    assert.equal((await db.doc(publicPath).get()).exists, false);
    assert.equal((await db.doc(sourcePath).get()).data().publication.state, 'hidden');
    assert.equal((await db.doc(counterPath).get()).data().sourceCount, 1);
    await assertNoNativeEvents();
  });

  it('refuses to replace a native projection at the expected external path', async () => {
    await clients.owner.importOrSync(importCommand);
    const native = { origin: 'native', contentType: 'event', sourceId: 'native-event' };
    await db.doc(publicPath).set(native);
    assert.equal((await clients.owner.publishOrHide(publishCommand)).data.reason,
      'PROJECTION_IDENTITY_MISMATCH');
    assert.deepEqual((await db.doc(publicPath).get()).data(), native);
    assert.equal((await db.doc(sourcePath).get()).data().publication.state, 'draft');
    await assertNoNativeEvents();
  });

  it('keeps a published projection when later detail is temporally incomplete', async () => {
    await clients.owner.importOrSync(importCommand);
    await clients.owner.publishOrHide(publishCommand);
    const projection = (await db.doc(publicPath).get()).data();
    await db.doc('datatourisme_test/fixture').set({ mode: 'incomplete' });
    const result = (await clients.owner.importOrSync({ ...importCommand, action: 'sync' })).data;
    assert.equal(result.reason, 'PERIOD_END_MISSING');
    assert.deepEqual((await db.doc(publicPath).get()).data(), projection);
    assert.equal((await db.doc(sourcePath).get()).data().publication.state, 'approved');
    assert.equal((await db.doc(counterPath).get()).data().sourceCount, 1);
  });

  it('returns a stable upstream failure without disclosing server detail or fixture key', async () => {
    await db.doc('datatourisme_test/fixture').set({ mode: 'unavailable' });
    const result = (await clients.owner.importOrSync(importCommand)).data;
    assert.equal(result.reason, 'DETAIL_UNAVAILABLE');
    assert.equal(JSON.stringify(result).includes('fixture-secret-should-not-escape'), false);
    assert.equal(JSON.stringify(result).includes('fixture-key-only'), false);
    assert.equal((await db.doc(sourcePath).get()).exists, false);
  });
});
