/** Prepared entry points. Keep this module out of index.ts until deployment is approved. */
import { getFirestore } from 'firebase-admin/firestore';
import { defineSecret } from 'firebase-functions/params';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import {
  executeOwnerDatatourismeDetailCommand, executeOwnerDatatourismePublicationCommand,
} from './datatourisme-admin-entry';
import type { Firestore } from 'firebase-admin/firestore';
import type { OperationResult } from './datatourisme-operations';

const datatourismeApiKey = defineSecret('DATATOURISME_API_KEY');
const cors = ['http://localhost:9002', 'https://uninstantici.com'];

type AdminRequest = { auth?: { uid: string }; data: unknown };

async function administrativeResult(operation: () => Promise<OperationResult>): Promise<OperationResult> {
  try {
    return await operation();
  } catch (error) {
    if (error instanceof HttpsError) throw error;
    // Unexpected transaction and SDK errors must never expose secrets or document contents.
    throw new HttpsError('internal', 'DATATOURISME_ADMIN_OPERATION_FAILED');
  }
}

export function handleDatatourismeImportOrSync(
  request: AdminRequest, db: Firestore, apiKey: () => string,
  fetcher: typeof fetch = fetch, now: Date = new Date(),
): Promise<OperationResult> {
  return administrativeResult(() => executeOwnerDatatourismeDetailCommand(
    db, request.auth?.uid, request.data, apiKey, fetcher, now,
  ));
}

export function handleDatatourismePublication(
  request: AdminRequest, db: Firestore, now: Date = new Date(),
): Promise<OperationResult> {
  return administrativeResult(() => executeOwnerDatatourismePublicationCommand(
    db, request.auth?.uid, request.data, now,
  ));
}

// Instance and concurrency bounds limit simultaneous work; they do not guarantee a request quota.
// These service identities are future deployment prerequisites and are not created by this module.
export const importOrSyncDatatourismeEvent = onCall(
  {
    region: 'europe-west1', cors, timeoutSeconds: 30, memory: '256MiB',
    maxInstances: 2, concurrency: 1, secrets: [datatourismeApiKey],
    serviceAccount: 'datatourisme-import@spotly-app-events.iam.gserviceaccount.com',
  },
  (request) => handleDatatourismeImportOrSync(request, getFirestore(), () => datatourismeApiKey.value()),
);

export const publishOrHideDatatourismeEvent = onCall(
  {
    region: 'europe-west1', cors, timeoutSeconds: 15, memory: '256MiB',
    maxInstances: 2, concurrency: 1,
    serviceAccount: 'datatourisme-publication@spotly-app-events.iam.gserviceaccount.com',
  },
  (request) => handleDatatourismePublication(request, getFirestore()),
);
