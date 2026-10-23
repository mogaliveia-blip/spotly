import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { requestDatatourismeSyncPreview, syncPreviewCommand } from './datatourisme-sync-preview';
import type { SyncPreviewCommand } from './datatourisme-sync-preview';
import type { OperationResult } from '../../functions/src/datatourisme-operations';

const uuid = '11111111-2222-3333-4444-555555555555';

describe('DATAtourisme sync preview command', () => {
  it('accepts one pilot UUID and constructs only sync / dry-run parameters', () => {
    assert.deepEqual(syncPreviewCommand(` ${uuid.toUpperCase()} `, '56'), {
      action: 'sync', uuid, department: '56', mode: 'dry-run',
    });
    for (const invalid of ['dt_123', '../events/native', '', uuid.slice(1)]) {
      assert.throws(() => syncPreviewCommand(invalid, '56'), /INVALID_UUID/);
    }
    assert.throws(() => syncPreviewCommand(uuid, '75'), /INVALID_DEPARTMENT/);
  });

  it('invokes the callable once only when explicitly requested and propagates its result', async () => {
    const commands: SyncPreviewCommand[] = [];
    const result: OperationResult = { status: 'unchanged', reason: 'NO_USEFUL_CHANGE',
      changes: { create: false, update: false, publish: false, withdraw: false } };
    const invoke = async (command: SyncPreviewCommand): Promise<OperationResult> => {
      commands.push(command);
      return result;
    };
    assert.equal(commands.length, 0);
    assert.equal(await requestDatatourismeSyncPreview(uuid, '29', invoke), result);
    assert.deepEqual(commands, [{ action: 'sync', uuid, department: '29', mode: 'dry-run' }]);
    await assert.rejects(requestDatatourismeSyncPreview('invalid', '29', invoke), /INVALID_UUID/);
    assert.equal(commands.length, 1);
  });
});
