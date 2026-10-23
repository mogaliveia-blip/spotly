import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';
import { createRequire } from 'node:module';
import { initializeTestEnvironment } from '@firebase/rules-unit-testing';
import external from '../functions/lib/datatourisme-external.js';
import detailAdapter from '../functions/lib/datatourisme-detail.js';
import operations from '../functions/lib/datatourisme-operations.js';
import periods from '../functions/lib/datatourisme-periods.js';

const { externalEventId, prepareDatatourismeCandidate } = external;
const { fetchAttestedDatatourismeDetail } = detailAdapter;
const { definitiveExpirationAt, normalizeDatatourismePeriods } = periods;
const {
  DATATOURISME_PILOT_CONTROL_PATH, importOrSyncExternalTransaction,
  decideExternalPublicationTransaction, inspectExternalCleanupTransaction,
  inspectExternalCleanupBatch, summarizeExternalOperations,
} = operations;
const uuid = '11111111-2222-3333-4444-555555555555';
const start = new Date('2026-10-22T12:00:00.000Z');
const afterExpiry = new Date('2026-10-26T00:00:00.000Z');
const sourceId = externalEventId(uuid);
const sourcePath = `datatourisme_events/${sourceId}`;
const publicPath = `discovery_public/datatourisme_${sourceId}`;
const counter = (count = 0) => ({ origin: 'datatourisme', version: 1, maxSources: 100, sourceCount: count });

class FakeFirestore {
  constructor(count = 0) {
    this.docs = new Map([[DATATOURISME_PILOT_CONTROL_PATH, counter(count)]]);
    this.versions = new Map([[DATATOURISME_PILOT_CONTROL_PATH, 1]]);
    this.writes = [];
    this.failNextCommit = false;
  }
  doc(path) { return { path, id: path.split('/').at(-1) }; }
  seed(path, value) {
    this.docs.set(path, value);
    this.versions.set(path, (this.versions.get(path) ?? 0) + 1);
  }
  async runTransaction(callback) {
    for (let attempt = 0; attempt < 6; attempt++) {
      const reads = new Map();
      const writes = [];
      let wrote = false;
      const tx = {
        get: async (ref) => {
          assert.equal(wrote, false, 'all reads must precede writes');
          if (!reads.has(ref.path)) reads.set(ref.path, this.versions.get(ref.path) ?? 0);
          const data = this.docs.get(ref.path);
          return { exists: data !== undefined, data: () => data };
        },
        create: (ref, data) => { wrote = true; writes.push({ kind: 'create', path: ref.path, data }); },
        set: (ref, data, options) => { wrote = true; writes.push({ kind: options?.merge ? 'merge' : 'set', path: ref.path, data }); },
        update: (ref, data) => { wrote = true; writes.push({ kind: 'update', path: ref.path, data }); },
        delete: (ref) => { wrote = true; writes.push({ kind: 'delete', path: ref.path }); },
      };
      const result = await callback(tx);
      if ([...reads].some(([path, version]) => (this.versions.get(path) ?? 0) !== version)) continue;
      if (this.failNextCommit) {
        this.failNextCommit = false;
        throw new Error('SIMULATED_TRANSACTION_ABORT');
      }
      const next = new Map(this.docs);
      for (const write of writes) {
        if (write.kind === 'create' && next.has(write.path)) throw new Error('CREATE_COLLISION');
        if (write.kind === 'update' && !next.has(write.path)) throw new Error('MISSING_UPDATE');
        if (write.kind === 'delete') next.delete(write.path);
        else if (write.kind === 'merge' || write.kind === 'update') {
          next.set(write.path, { ...next.get(write.path), ...write.data });
        } else next.set(write.path, write.data);
      }
      this.docs = next;
      for (const write of writes) {
        this.versions.set(write.path, (this.versions.get(write.path) ?? 0) + 1);
        this.writes.push(write);
      }
      return result;
    }
    throw new Error('TOO_MANY_TRANSACTION_RETRIES');
  }
}

const poi = (id = uuid, periods = [{ startDate: '2026-10-25', endDate: '2026-10-25' }]) => ({
  uuid: id, uri: `https://data.datatourisme.fr/${id}`,
  label: { '@fr': 'Concert fictif du port' },
  hasDescription: [{ description: { '@fr': 'Une soirée musicale fictive.' } }],
  hasBeenCreatedBy: { legalName: 'Producteur fictif' },
  hasBeenPublishedBy: [{ legalName: 'Éditeur fictif' }],
  type: [{ uri: 'https://example.test/Product' }, { uri: 'https://example.test/Concert' }],
  hasTheme: [], takesPlaceAt: periods,
  isLocatedAt: [{ address: [{ hasAddressCity: { label: { '@fr': 'Vannes' }, isPartOfDepartment: { insee: '56' } } }],
    geo: { latitude: 47.657, longitude: -2.76 } }],
});
const attested = (id = uuid, body = poi(id)) => fetchAttestedDatatourismeDetail(
  id, 'Europe/Paris', () => 'simulated-key', async () => Response.json(body),
);
const defaultDetail = await attested();
const otherUuid = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
const otherDetail = await attested(otherUuid);
const input = (id = uuid, overrides = {}) => ({
  expectedUuid: id, expectedDepartment: '56', timezone: 'Europe/Paris', now: start,
  detail: id === uuid ? defaultDetail : otherDetail,
  mode: 'apply', ...overrides,
});
const fixtureSource = () => {
  const candidate = prepareDatatourismeCandidate({ expectedUuid: uuid, expectedDepartment: '56',
    complete: true, poi: poi(), timezone: 'Europe/Paris', now: start });
  assert.equal(candidate.kind, 'accepted');
  return candidate.event;
};

describe('inactive DATAtourisme transactions against an optimistic fake store', () => {
  it('imports once, counts one source and keeps a repeated identical UUID write-free', async () => {
    const store = new FakeFirestore();
    const first = await importOrSyncExternalTransaction(store, input());
    assert.equal(first.status, 'applied');
    assert.equal(first.changes.create, true);
    assert.equal(store.docs.get(DATATOURISME_PILOT_CONTROL_PATH).sourceCount, 1);
    assert.equal(store.docs.get(sourcePath).publication.state, 'draft');
    assert.equal(store.docs.has(publicPath), false);
    const writes = store.writes.length;
    const second = await importOrSyncExternalTransaction(store, input());
    assert.equal(second.status, 'unchanged');
    assert.equal(store.writes.length, writes);
    assert.ok(store.writes.every((write) => !write.path.startsWith('events/')));
  });

  it('keeps future import and sync intents distinct inside the transaction', async () => {
    const store = new FakeFirestore();
    assert.equal((await importOrSyncExternalTransaction(store, input(uuid, { intent: 'sync' }))).reason,
      'SOURCE_NOT_IMPORTED');
    assert.equal((await importOrSyncExternalTransaction(store, input(uuid, { intent: 'import' }))).reason,
      'SOURCE_CREATED');
    const writes = store.writes.length;
    assert.equal((await importOrSyncExternalTransaction(store, input(uuid, { intent: 'import' }))).reason,
      'SOURCE_ALREADY_IMPORTED');
    assert.equal((await importOrSyncExternalTransaction(store, input(uuid, { intent: 'sync' }))).status,
      'unchanged');
    assert.equal(store.writes.length, writes);
  });

  it('refuses missing counter, collisions, the 100-source limit and concurrent imports at 99', async () => {
    const missing = new FakeFirestore();
    missing.docs.delete(DATATOURISME_PILOT_CONTROL_PATH);
    assert.equal((await importOrSyncExternalTransaction(missing, input())).reason, 'PILOT_COUNTER_UNINITIALIZED_OR_INVALID');
    const collision = new FakeFirestore(1);
    collision.seed(sourcePath, { ...fixtureSource(), sourceUuid: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee' });
    assert.equal((await importOrSyncExternalTransaction(collision, input())).reason, 'SOURCE_IDENTITY_COLLISION');
    assert.equal(collision.writes.length, 0);
    const full = new FakeFirestore(100);
    assert.equal((await importOrSyncExternalTransaction(full, input())).reason, 'PILOT_LIMIT_REACHED');
    const concurrent = new FakeFirestore(99);
    const results = await Promise.all([
      importOrSyncExternalTransaction(concurrent, input()),
      importOrSyncExternalTransaction(concurrent, input(otherUuid)),
    ]);
    assert.deepEqual(results.map((result) => result.status).sort(), ['applied', 'deferred']);
    assert.equal(concurrent.docs.get(DATATOURISME_PILOT_CONTROL_PATH).sourceCount, 100);
    assert.equal([...concurrent.docs.keys()].filter((path) => path.startsWith('datatourisme_events/')).length, 1);
  });

  it('keeps state unchanged on transaction failure and dry-run', async () => {
    const store = new FakeFirestore();
    store.failNextCommit = true;
    await assert.rejects(importOrSyncExternalTransaction(store, input()), /SIMULATED_TRANSACTION_ABORT/);
    assert.equal(store.docs.get(DATATOURISME_PILOT_CONTROL_PATH).sourceCount, 0);
    assert.equal(store.docs.has(sourcePath), false);
    assert.equal(store.writes.length, 0);
    const preview = await importOrSyncExternalTransaction(store, input(uuid, { mode: 'dry-run' }));
    assert.equal(preview.status, 'would_apply');
    assert.equal(preview.changes.create, true);
    assert.equal(store.writes.length, 0);
  });

  it('imports a sparse commune-only draft but refuses its cartographic publication', async () => {
    const store = new FakeFirestore();
    const sparse = { ...poi(), hasDescription: [], hasBeenCreatedBy: {},
      isLocatedAt: poi().isLocatedAt.map(({ geo, ...place }) => place) };
    const detail = await attested(uuid, sparse);
    const preview = await importOrSyncExternalTransaction(store, input(uuid, { detail, mode: 'dry-run' }));
    assert.equal(preview.status, 'would_apply');
    assert.equal(store.writes.length, 0);
    assert.equal((await importOrSyncExternalTransaction(store, input(uuid, { detail }))).status, 'applied');
    assert.equal(store.docs.get(DATATOURISME_PILOT_CONTROL_PATH).sourceCount, 1);
    assert.equal(store.docs.get(sourcePath).location.position, null);
    assert.equal((await decideExternalPublicationTransaction(store, sourceId, 'approve', start, 'apply')).reason,
      'PUBLICATION_NOT_ELIGIBLE');
    assert.equal(store.docs.get(sourcePath).publication.state, 'draft');
    assert.equal(store.docs.has(publicPath), false);
    assert.ok(store.writes.every((write) => !write.path.startsWith('events/')));
  });

  it('publishes only a bounded exact-time occurrence after a separate editorial decision', async () => {
    const store = new FakeFirestore();
    const timed = poi(uuid, [{ startDate: '2026-10-25', endDate: '2026-10-25',
      startTime: '18:30', endTime: '20:00' }]);
    const detail = await attested(uuid, timed);
    assert.equal((await importOrSyncExternalTransaction(store, input(uuid, { detail }))).status, 'applied');
    assert.equal(store.docs.has(publicPath), false);
    const approved = await decideExternalPublicationTransaction(store, sourceId, 'approve', start, 'apply');
    assert.equal(approved.status, 'applied');
    assert.equal(store.docs.get(publicPath).timePrecision, 'datetime');
    assert.equal(store.docs.get(publicPath).windowStartAt.toDate().toISOString(), '2026-10-25T17:30:00.000Z');
    assert.equal(store.docs.get(publicPath).windowEndAt.toDate().toISOString(), '2026-10-25T19:00:00.000Z');
  });

  it('defers 404, API error, forged detail and uncertain periods', async () => {
    const store = new FakeFirestore();
    const variants = [
      [input(uuid, { detail: { kind: 'not_found' } }), 'DETAIL_NOT_FOUND'],
      [input(uuid, { detail: { kind: 'error', reason: 'quota' } }), 'DETAIL_QUOTA'],
      [input(uuid, { detail: { kind: 'found', poi: poi(), complete: true }, periodsEvidence: 'verified_full_detail' }), 'DETAIL_NOT_ATTESTED'],
      [input(uuid, { detail: JSON.parse(JSON.stringify(defaultDetail)) }), 'DETAIL_NOT_ATTESTED'],
      [input(otherUuid, { detail: defaultDetail }), 'DETAIL_NOT_ATTESTED'],
      [input(uuid, { detail: await attested(uuid, poi(uuid, [{ startDate: '2026-10-25' }])) }), 'PERIOD_END_MISSING'],
      [input(uuid, { detail: await attested(uuid, poi(uuid, [{ startDate: '2026-10-25', endDate: '2026-10-25',
        weekOfMonth: [4] }])) }), 'PERIOD_RECURRENT_UNSUPPORTED'],
      [input(uuid, { detail: await attested(uuid, poi(uuid, [
        { startDate: '2026-10-25', endDate: '2026-10-25' },
        { startDate: '2026-10-30', endDate: '2026-10-30' },
      ])) }), 'PERIOD_COUNT_UNSUPPORTED'],
    ];
    for (const [request, expected] of variants) {
      assert.equal((await importOrSyncExternalTransaction(store, request)).reason, expected);
    }
    assert.equal(store.writes.length, 0);
  });

  it('preserves a manual category and voluntary hide through a later sync', async () => {
    const store = new FakeFirestore(1);
    const existing = fixtureSource();
    store.seed(sourcePath, { ...existing,
      editorial: { ...existing.editorial, categoryId: 'culture', categoryMode: 'manual' },
      publication: { state: 'hidden' },
    });
    const ambiguous = { ...poi(), type: [
      { uri: 'https://example.test/Concert' }, { uri: 'https://example.test/TheaterEvent' },
    ] };
    const result = await importOrSyncExternalTransaction(store, input(uuid, {
      now: new Date('2026-10-23T12:00:00Z'), detail: await attested(uuid, ambiguous),
    }));
    assert.equal(result.status, 'applied');
    assert.equal(store.docs.get(sourcePath).editorial.categoryId, 'culture');
    assert.equal(store.docs.get(sourcePath).editorial.categoryMode, 'manual');
    assert.equal(store.docs.get(sourcePath).publication.state, 'hidden');
    assert.equal(store.docs.has(publicPath), false);
  });

  it('publishes only by explicit approval, refuses native projection collision, and hides idempotently', async () => {
    const store = new FakeFirestore();
    await importOrSyncExternalTransaction(store, input());
    assert.equal((await decideExternalPublicationTransaction(store, sourceId, 'approve', start, 'dry-run')).status, 'would_apply');
    assert.equal(store.docs.has(publicPath), false);
    const published = await decideExternalPublicationTransaction(store, sourceId, 'approve', start, 'apply');
    assert.equal(published.changes.publish, true);
    assert.equal(store.docs.get(publicPath).origin, 'datatourisme');
    assert.equal(store.docs.get(publicPath).attribution.source, 'DATAtourisme');
    assert.equal((await decideExternalPublicationTransaction(store, sourceId, 'approve', start, 'apply')).status, 'unchanged');
    const writes = store.writes.length;
    const hidden = await decideExternalPublicationTransaction(store, sourceId, 'hide', start, 'apply');
    assert.equal(hidden.changes.withdraw, true);
    assert.equal(store.docs.has(publicPath), false);
    assert.equal(store.docs.get(sourcePath).publication.state, 'hidden');
    assert.equal((await decideExternalPublicationTransaction(store, sourceId, 'hide', start, 'apply')).status, 'unchanged');
    assert.equal(store.writes.length, writes + 2);
    const collision = new FakeFirestore(1);
    collision.seed(sourcePath, fixtureSource());
    collision.seed(publicPath, { origin: 'native', contentType: 'event', sourceId });
    assert.equal((await decideExternalPublicationTransaction(collision, sourceId, 'approve', start, 'apply')).reason,
      'PROJECTION_IDENTITY_MISMATCH');
    assert.equal(collision.writes.length, 0);
    assert.equal(collision.docs.get(publicPath).origin, 'native');
    const expiredStore = new FakeFirestore(1);
    expiredStore.seed(sourcePath, fixtureSource());
    assert.equal((await decideExternalPublicationTransaction(expiredStore, sourceId, 'approve', afterExpiry, 'apply')).reason,
      'PUBLICATION_NOT_ELIGIBLE');
    assert.equal(expiredStore.writes.length, 0);
  });

  it('refreshes a published source and projection atomically, then defers expiry withdrawal', async () => {
    const store = new FakeFirestore();
    await importOrSyncExternalTransaction(store, input());
    await decideExternalPublicationTransaction(store, sourceId, 'approve', start, 'apply');
    const changedPoi = { ...poi(), label: { '@fr': 'Nouveau concert fictif' } };
    const refresh = await importOrSyncExternalTransaction(store, input(uuid, {
      now: new Date('2026-10-23T12:00:00Z'), detail: await attested(uuid, changedPoi),
    }));
    assert.equal(refresh.changes.update, true);
    assert.equal(refresh.changes.publish, true);
    assert.equal(store.docs.get(sourcePath).editorial.title, 'Nouveau concert fictif');
    assert.equal(store.docs.get(publicPath).title, 'Nouveau concert fictif');
    const incomplete = await importOrSyncExternalTransaction(store, input(uuid, {
      now: afterExpiry, detail: await attested(uuid, poi(uuid, [{ startDate: '2026-10-25' }])),
    }));
    assert.equal(incomplete.status, 'deferred');
    assert.equal(store.docs.has(publicPath), true);
    assert.equal((await importOrSyncExternalTransaction(store, input(uuid, {
      now: afterExpiry, detail: { kind: 'not_found' },
    }))).reason, 'DETAIL_NOT_FOUND');
    assert.equal((await importOrSyncExternalTransaction(store, input(uuid, {
      now: afterExpiry, detail: { kind: 'error', reason: 'unavailable' },
    }))).reason, 'DETAIL_UNAVAILABLE');
    assert.equal(store.docs.has(publicPath), true);
    const expired = await importOrSyncExternalTransaction(store, input(uuid, { now: afterExpiry }));
    assert.equal(expired.reason, 'TEMPORAL_EXHAUSTIVENESS_UNPROVEN');
    assert.equal(expired.changes.withdraw, false);
    assert.equal(store.docs.has(publicPath), true);
    assert.deepEqual(store.docs.get(sourcePath).projectionIds, [publicPath.split('/')[1]]);
    assert.equal(store.docs.get(DATATOURISME_PILOT_CONTROL_PATH).sourceCount, 1);
    assert.equal((await importOrSyncExternalTransaction(store, input(uuid, { now: afterExpiry }))).status, 'deferred');
  });

  it('does not mutate source or projection when a later response has multiple sessions', async () => {
    const store = new FakeFirestore();
    await importOrSyncExternalTransaction(store, input());
    await decideExternalPublicationTransaction(store, sourceId, 'approve', start, 'apply');
    const multiplePoi = poi(uuid, [
      { startDate: '2026-10-25', endDate: '2026-10-25' },
      { startDate: '2026-10-30', endDate: '2026-10-30' },
    ]);
    const result = await importOrSyncExternalTransaction(store, input(uuid, {
      now: new Date('2026-10-26T00:00:00Z'),
      detail: await attested(uuid, multiplePoi),
    }));
    assert.equal(result.reason, 'PERIOD_COUNT_UNSUPPORTED');
    assert.equal(result.changes.withdraw, false);
    assert.equal(store.docs.get(sourcePath).periods.length, 1);
    assert.equal(store.docs.has(publicPath), true);
    assert.equal(store.docs.get(DATATOURISME_PILOT_CONTROL_PATH).sourceCount, 1);
    assert.equal((await decideExternalPublicationTransaction(store, sourceId, 'approve', afterExpiry, 'apply')).reason,
      'PUBLICATION_NOT_ELIGIBLE');
  });

  it('defers uncertain cleanup, keeps future sessions, and blocks purge suggestions', async () => {
    const store = new FakeFirestore(1);
    const source = fixtureSource();
    store.seed(sourcePath, source);
    assert.equal((await inspectExternalCleanupTransaction(store, sourceId, afterExpiry, 'apply')).reason,
      'RESYNC_AFTER_EXPIRY_REQUIRED');
    const future = new Date('2026-10-24T12:00:00Z');
    assert.equal((await inspectExternalCleanupTransaction(store, sourceId, future, 'apply')).reason, 'NOT_EXPIRED');
    const multiple = normalizeDatatourismePeriods([
      { startDate: '2026-10-20', endDate: '2026-10-20' },
      { startDate: '2026-10-30', endDate: '2026-10-30' },
    ], 'Europe/Paris');
    store.seed(sourcePath, { ...source, periods: multiple,
      expiresAt: definitiveExpirationAt(multiple, 'Europe/Paris') });
    assert.equal((await inspectExternalCleanupTransaction(store, sourceId, afterExpiry, 'apply')).reason, 'NOT_EXPIRED');
    store.seed(sourcePath, { ...source, periods: [{ timePrecision: 'date', startDay: '2026-10-25', endDay: null }],
      expiresAt: null });
    assert.equal((await inspectExternalCleanupTransaction(store, sourceId, afterExpiry, 'apply')).status, 'deferred');
    const uncertain = { ...source, completeness: 'incomplete' };
    store.seed(sourcePath, uncertain);
    assert.equal((await inspectExternalCleanupTransaction(store, sourceId, afterExpiry, 'apply')).status, 'deferred');
    store.seed(sourcePath, { ...source, sync: { ...source.sync, lastSuccessfulAt: afterExpiry.toISOString() } });
    const monthLater = new Date('2026-11-26T00:00:00Z');
    const purge = await inspectExternalCleanupTransaction(store, sourceId, monthLater, 'apply');
    assert.equal(purge.status, 'deferred');
    assert.equal(purge.reason, 'TEMPORAL_EXHAUSTIVENESS_UNPROVEN');
    assert.equal(store.docs.has(sourcePath), true);
    assert.equal(store.docs.get(DATATOURISME_PILOT_CONTROL_PATH).sourceCount, 1);
    assert.equal(store.writes.length, 0);
  });

  it('never withdraws a projection on temporal uncertainty, even after a later sync date', async () => {
    const store = new FakeFirestore();
    await importOrSyncExternalTransaction(store, input());
    await decideExternalPublicationTransaction(store, sourceId, 'approve', start, 'apply');
    const current = store.docs.get(sourcePath);
    store.seed(sourcePath, { ...current, sync: { ...current.sync, lastSuccessfulAt: afterExpiry.toISOString() } });
    const writes = store.writes.length;
    const preview = await inspectExternalCleanupTransaction(store, sourceId, afterExpiry, 'dry-run');
    assert.equal(preview.reason, 'TEMPORAL_EXHAUSTIVENESS_UNPROVEN');
    assert.equal(preview.changes.withdraw, false);
    assert.equal(store.writes.length, writes);
    const first = await inspectExternalCleanupTransaction(store, sourceId, afterExpiry, 'apply');
    assert.equal(first.changes.withdraw, false);
    assert.equal(store.docs.has(publicPath), true);
    assert.equal(store.docs.has(sourcePath), true);
    assert.deepEqual(store.docs.get(sourcePath).projectionIds, [publicPath.split('/')[1]]);
    assert.equal((await inspectExternalCleanupTransaction(store, sourceId, afterExpiry, 'apply')).status, 'deferred');
    assert.equal(store.writes.length, writes);
  });

  it('reports bounded dry-run totals and never mutates data', async () => {
    const store = new FakeFirestore();
    await importOrSyncExternalTransaction(store, input());
    await decideExternalPublicationTransaction(store, sourceId, 'approve', start, 'apply');
    const writes = store.writes.length;
    const preview = await inspectExternalCleanupBatch(store, [sourceId], afterExpiry, 'dry-run');
    assert.equal(preview.examined, 1);
    assert.equal(preview.deferred, 1);
    assert.equal(preview.reasons.RESYNC_AFTER_EXPIRY_REQUIRED, 1);
    assert.equal(store.writes.length, writes);
    assert.deepEqual(summarizeExternalOperations([
      { status: 'would_apply', reason: 'SOURCE_CREATED', changes: { create: true, update: false, publish: false, withdraw: false } },
      { status: 'deferred', reason: 'DETAIL_NOT_ATTESTED', changes: { create: false, update: false, publish: false, withdraw: false } },
    ]), {
      examined: 2, creations: 1, updates: 0, publications: 0,
      withdrawals: 0, deferred: 1, purgeCandidates: 0,
      reasons: { SOURCE_CREATED: 1, DETAIL_NOT_ATTESTED: 1 },
    });
    await assert.rejects(inspectExternalCleanupBatch(store, Array(101).fill(sourceId), start, 'dry-run'),
      /INVALID_CLEANUP_BATCH/);
  });
});

describe('inactive DATAtourisme transactions on local Firestore', {
  skip: !process.env.FIRESTORE_EMULATOR_HOST,
}, () => {
  const projectId = 'demo-datatourisme-operations-review';
  const requireFunctions = createRequire(new URL('../functions/package.json', import.meta.url));
  const { initializeApp, deleteApp } = requireFunctions('firebase-admin/app');
  const { getFirestore } = requireFunctions('firebase-admin/firestore');
  let environment;
  let app;
  let db;

  before(async () => {
    assert.match(process.env.FIRESTORE_EMULATOR_HOST, /^(127\.0\.0\.1|localhost):\d+$/);
    environment = await initializeTestEnvironment({ projectId });
    app = initializeApp({ projectId }, 'datatourisme-operations-review');
    db = getFirestore(app);
  });
  beforeEach(async () => environment.clearFirestore());
  after(async () => {
    if (environment) await environment.cleanup();
    if (app) await deleteApp(app);
  });

  it('serializes competing imports on the control document at 99', async () => {
    await db.doc(DATATOURISME_PILOT_CONTROL_PATH).set(counter(99));
    const results = await Promise.all([
      importOrSyncExternalTransaction(db, input()),
      importOrSyncExternalTransaction(db, input(otherUuid)),
    ]);
    assert.deepEqual(results.map((result) => result.status).sort(), ['applied', 'deferred']);
    assert.equal((await db.doc(DATATOURISME_PILOT_CONTROL_PATH).get()).data().sourceCount, 100);
    assert.equal((await db.collection('datatourisme_events').get()).size, 1);
    assert.equal((await db.collection('events').get()).size, 0);
  });

  it('rolls back source and counter when a transaction callback aborts', async () => {
    await db.doc(DATATOURISME_PILOT_CONTROL_PATH).set(counter());
    const abortingStore = {
      doc: (path) => db.doc(path),
      runTransaction: (callback) => db.runTransaction(async (tx) => {
        await callback(tx);
        throw new Error('SIMULATED_ABORT_BEFORE_COMMIT');
      }),
    };
    await assert.rejects(importOrSyncExternalTransaction(abortingStore, input()), /SIMULATED_ABORT_BEFORE_COMMIT/);
    assert.equal((await db.doc(DATATOURISME_PILOT_CONTROL_PATH).get()).data().sourceCount, 0);
    assert.equal((await db.doc(sourcePath).get()).exists, false);
    assert.equal((await db.collection('events').get()).size, 0);
  });

  it('refuses to replace a native projection on the external path', async () => {
    await db.doc(DATATOURISME_PILOT_CONTROL_PATH).set(counter());
    await importOrSyncExternalTransaction(db, input());
    const native = { origin: 'native', contentType: 'event', sourceId: 'native-event' };
    await db.doc(publicPath).set(native);
    const result = await decideExternalPublicationTransaction(db, sourceId, 'approve', start, 'apply');
    assert.equal(result.reason, 'PROJECTION_IDENTITY_MISMATCH');
    assert.deepEqual((await db.doc(publicPath).get()).data(), native);
    assert.equal((await db.collection('events').get()).size, 0);
  });

  it('stores a sparse commune-only draft without creating a public marker', async () => {
    await db.doc(DATATOURISME_PILOT_CONTROL_PATH).set(counter());
    const sparse = { ...poi(), hasDescription: [], hasBeenCreatedBy: {},
      isLocatedAt: poi().isLocatedAt.map(({ geo, ...place }) => place) };
    const detail = await attested(uuid, sparse);
    assert.equal((await importOrSyncExternalTransaction(db, input(uuid, { detail }))).status, 'applied');
    assert.equal((await db.doc(sourcePath).get()).data().location.position, null);
    assert.equal((await decideExternalPublicationTransaction(db, sourceId, 'approve', start, 'apply')).reason,
      'PUBLICATION_NOT_ELIGIBLE');
    assert.equal((await db.doc(publicPath).get()).exists, false);
    assert.equal((await db.collection('events').get()).size, 0);
  });

  it('does not duplicate or rewrite a repeated import', async () => {
    await db.doc(DATATOURISME_PILOT_CONTROL_PATH).set(counter());
    assert.equal((await importOrSyncExternalTransaction(db, input())).status, 'applied');
    const first = await db.doc(sourcePath).get();
    assert.equal((await importOrSyncExternalTransaction(db, input())).status, 'unchanged');
    const second = await db.doc(sourcePath).get();
    assert.equal(second.updateTime.isEqual(first.updateTime), true);
    assert.equal((await db.doc(DATATOURISME_PILOT_CONTROL_PATH).get()).data().sourceCount, 1);
    assert.equal((await db.collection('datatourisme_events').get()).size, 1);
    assert.equal((await db.collection('events').get()).size, 0);
  });
});
