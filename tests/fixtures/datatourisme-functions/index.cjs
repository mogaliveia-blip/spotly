// Emulator-only entry point. Production functions/package.json still points to lib/index.js.
const { createRequire } = require('node:module');
const { readFileSync, writeFileSync } = require('node:fs');
const { resolve } = require('node:path');
const requireFunctions = createRequire(resolve(__dirname, '../../../functions/package.json'));
const { initializeApp } = requireFunctions('firebase-admin/app');
const { getFirestore, FieldValue } = requireFunctions('firebase-admin/firestore');

const projectId = process.env.GCLOUD_PROJECT;
if (projectId !== 'demo-datatourisme-callables-c2' ||
    process.env.FIRESTORE_EMULATOR_HOST !== '127.0.0.1:8080' ||
    process.env.FIREBASE_AUTH_EMULATOR_HOST !== '127.0.0.1:9099') {
  throw new Error('DATATOURISME_EMULATOR_ONLY');
}
const secretPath = resolve(__dirname, '.secret.local');
const fixtureSecret = 'DATATOURISME_API_KEY=fixture-key-only\n';
try {
  if (readFileSync(secretPath, 'utf8') !== fixtureSecret) throw new Error('EMULATOR_FIXTURE_SECRET_MISMATCH');
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
  try {
    writeFileSync(secretPath, fixtureSecret, { flag: 'wx', mode: 0o600 });
  } catch (writeError) {
    if (writeError.code !== 'EEXIST' || readFileSync(secretPath, 'utf8') !== fixtureSecret) throw writeError;
  }
}
initializeApp({ projectId });

const originalFetch = globalThis.fetch;
globalThis.fetch = async (input, init) => {
  const url = input instanceof URL ? input : new URL(typeof input === 'string' ? input : input.url);
  if (url.origin !== 'https://api.datatourisme.fr') {
    if (!['127.0.0.1', 'localhost', '::1'].includes(url.hostname)) throw new Error('EMULATOR_EXTERNAL_FETCH_BLOCKED');
    return originalFetch(input, init);
  }
  const db = getFirestore();
  await db.doc('datatourisme_test/upstream').set({ count: FieldValue.increment(1) }, { merge: true });
  const settings = (await db.doc('datatourisme_test/fixture').get()).data();
  if (settings?.mode === 'unavailable') throw new Error('fixture-secret-should-not-escape');
  const uuid = url.pathname.split('/').at(-1);
  const periods = settings?.mode === 'incomplete'
    ? [{ startDate: '2099-01-25' }]
    : [{ startDate: '2099-01-25', endDate: '2099-01-25' }];
  return Response.json({
    uuid, uri: `https://data.datatourisme.fr/${uuid}`,
    label: { '@fr': 'Concert fictif' },
    hasDescription: [{ description: { '@fr': 'Description fictive.' } }],
    hasBeenCreatedBy: { legalName: 'Producteur fictif' },
    type: [{ uri: 'https://example.test/Concert' }], takesPlaceAt: periods,
    isLocatedAt: [{ address: [{ hasAddressCity: {
      label: { '@fr': 'Vannes' }, isPartOfDepartment: { insee: '56' },
    } }], geo: { latitude: 47.657, longitude: -2.76 } }],
  });
};

const { importOrSyncDatatourismeEvent, publishOrHideDatatourismeEvent } =
  requireFunctions('./lib/datatourisme-admin-callables.js');
// This CLI reads legacy trigger metadata and expects string secret names.
// The SDK supplies a SecretParam object; normalize only the test process metadata.
const triggerOptions = requireFunctions('./node_modules/firebase-functions/lib/v2/options.js');
const originalAnnotations = triggerOptions.optionsToTriggerAnnotations;
triggerOptions.optionsToTriggerAnnotations = (value) => {
  const annotations = originalAnnotations(value);
  if (annotations.secrets) {
    annotations.secrets = annotations.secrets.map((secret) =>
      typeof secret === 'string' ? secret : secret.name);
  }
  return annotations;
};
module.exports = { importOrSyncDatatourismeEvent, publishOrHideDatatourismeEvent };
