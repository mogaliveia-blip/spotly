import type { Firestore } from 'firebase-admin/firestore';
import { HttpsError } from 'firebase-functions/v2/https';
import { canonicalDatatourismeUuid, fetchAttestedDatatourismeDetail } from './datatourisme-detail';
import { externalEventId } from './datatourisme-external';
import { isDataObject } from './discovery-search-contract';
import {
  decideExternalPublicationTransaction, importOrSyncExternalTransaction,
} from './datatourisme-operations';
import type { OperationMode, OperationResult } from './datatourisme-operations';

type PilotDepartment = '22' | '29' | '35' | '56';
type DetailCommand = { action: 'import' | 'sync'; uuid: string; department: PilotDepartment; mode: OperationMode };
type PublicationCommand = { action: 'publish' | 'hide'; uuid: string; mode: OperationMode };
export type OwnerDatatourismeCommand = DetailCommand | PublicationCommand;
const DEPARTMENTS = ['22', '29', '35', '56'];

/** Only action, UUID, mode and pilot department may cross the future callable boundary. */
export function validateOwnerDatatourismeCommand(raw: unknown): OwnerDatatourismeCommand {
  if (!isDataObject(raw, ['action', 'uuid', 'mode'], ['department'])) {
    throw new HttpsError('invalid-argument', 'INVALID_DATATOURISME_COMMAND');
  }
  const uuid = canonicalDatatourismeUuid(raw.uuid);
  if (!uuid || (raw.mode !== 'dry-run' && raw.mode !== 'apply')) {
    throw new HttpsError('invalid-argument', 'INVALID_DATATOURISME_COMMAND');
  }
  if (raw.action === 'import' || raw.action === 'sync') {
    if (!isDataObject(raw, ['action', 'uuid', 'mode', 'department']) || !DEPARTMENTS.includes(raw.department as string)) {
      throw new HttpsError('invalid-argument', 'INVALID_DATATOURISME_COMMAND');
    }
    return { action: raw.action, uuid, department: raw.department as PilotDepartment, mode: raw.mode };
  }
  if (raw.action === 'publish' || raw.action === 'hide') {
    if (!isDataObject(raw, ['action', 'uuid', 'mode'])) {
      throw new HttpsError('invalid-argument', 'INVALID_DATATOURISME_COMMAND');
    }
    return { action: raw.action, uuid, mode: raw.mode };
  }
  throw new HttpsError('invalid-argument', 'INVALID_DATATOURISME_COMMAND');
}

/** The caller must pass request.auth.uid, never a uid from request.data. No external call precedes this check. */
export async function authorizeOwnerDatatourismeCommand(
  db: Pick<Firestore, 'doc'>, authUid: string | undefined, raw: unknown,
): Promise<OwnerDatatourismeCommand> {
  if (!authUid || authUid.length > 128 || /[\/\u0000-\u001f]/.test(authUid)) {
    throw new HttpsError('unauthenticated', 'AUTH_REQUIRED');
  }
  let role: unknown;
  try {
    role = (await db.doc(`users/${authUid}`).get()).data()?.role;
  } catch {
    throw new HttpsError('unavailable', 'OWNER_ROLE_UNAVAILABLE');
  }
  if (role !== 'owner') throw new HttpsError('permission-denied', 'PLATFORM_OWNER_REQUIRED');
  return validateOwnerDatatourismeCommand(raw);
}

/** Inactive local seam: a future secret-bound callable may invoke only this detail path. */
export async function executeOwnerDatatourismeDetailCommand(
  db: Firestore, authUid: string | undefined, raw: unknown, apiKey: () => string,
  fetcher: typeof fetch = fetch, now: Date = new Date(),
): Promise<OperationResult> {
  const command = await authorizeOwnerDatatourismeCommand(db, authUid, raw);
  if (command.action !== 'import' && command.action !== 'sync') {
    throw new HttpsError('invalid-argument', 'INVALID_DATATOURISME_COMMAND');
  }
  const detail = await fetchAttestedDatatourismeDetail(command.uuid, 'Europe/Paris', apiKey, fetcher);
  return importOrSyncExternalTransaction(db, {
    expectedUuid: command.uuid, expectedDepartment: command.department,
    timezone: 'Europe/Paris', now, detail, intent: command.action, mode: command.mode,
  });
}

/** Publication and hiding need no DATAtourisme secret or upstream request. */
export async function executeOwnerDatatourismePublicationCommand(
  db: Firestore, authUid: string | undefined, raw: unknown, now: Date = new Date(),
): Promise<OperationResult> {
  const command = await authorizeOwnerDatatourismeCommand(db, authUid, raw);
  if (command.action !== 'publish' && command.action !== 'hide') {
    throw new HttpsError('invalid-argument', 'INVALID_DATATOURISME_COMMAND');
  }
  const sourceId = externalEventId(command.uuid)!;
  return decideExternalPublicationTransaction(db, sourceId,
    command.action === 'publish' ? 'approve' : 'hide', now, command.mode);
}
