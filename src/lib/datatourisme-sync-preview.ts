import { httpsCallable } from 'firebase/functions';
import type { OperationResult } from '../../functions/src/datatourisme-operations';
import { functions } from './firebase';
import type { PilotDepartment } from './datatourisme-admin-demo';

export type SyncPreviewCommand = {
  action: 'sync'; uuid: string; department: PilotDepartment; mode: 'dry-run';
};

const uuidPattern = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/;
const pilotDepartments = ['22', '29', '35', '56'];

export function syncPreviewCommand(uuid: string, department: string): SyncPreviewCommand {
  const normalizedUuid = uuid.trim().toLowerCase();
  if (!uuidPattern.test(normalizedUuid)) throw new Error('INVALID_UUID');
  if (!pilotDepartments.includes(department)) throw new Error('INVALID_DEPARTMENT');
  return { action: 'sync', uuid: normalizedUuid, department: department as PilotDepartment, mode: 'dry-run' };
}

export async function requestDatatourismeSyncPreview(
  uuid: string, department: string,
  invoke: (command: SyncPreviewCommand) => Promise<OperationResult> = async (command) => {
    const callable = httpsCallable<SyncPreviewCommand, OperationResult>(
      functions, 'importOrSyncDatatourismeEvent', { timeout: 45000 },
    );
    return (await callable(command)).data;
  },
): Promise<OperationResult> {
  return invoke(syncPreviewCommand(uuid, department));
}
