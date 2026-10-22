import { isDeepStrictEqual } from 'node:util';
import type { Firestore, Transaction } from 'firebase-admin/firestore';
import { verifyAttestedDatatourismeDetail } from './datatourisme-detail';
import type { AttestedDetailResult } from './datatourisme-detail';
import {
  decideExternalCleanup, externalEventId, isExternalEvent, matchesExternalIdentity,
  prepareDatatourismeCandidate, reconcileExternalCandidate,
} from './datatourisme-external';
import type { ExternalEvent, PrepareInput } from './datatourisme-external';
import { buildDatatourismeDiscoveryProjection } from './datatourisme-discovery-projection';

export const DATATOURISME_PILOT_CONTROL_PATH = 'datatourisme_control/bretagne_pilot';
export const DATATOURISME_PILOT_LIMIT = 100;
export type OperationMode = 'dry-run' | 'apply';
export type OperationChanges = { create: boolean; update: boolean; publish: boolean; withdraw: boolean };
export type OperationResult = {
  status: 'would_apply' | 'applied' | 'unchanged' | 'deferred' | 'purge_candidate';
  reason: string;
  changes: OperationChanges;
};
export type OperationSummary = {
  examined: number; creations: number; updates: number; publications: number;
  withdrawals: number; deferred: number; purgeCandidates: number; reasons: Record<string, number>;
};

const EXTERNAL_ID = /^dt_[0-9a-f]{64}$/;
const noChanges = (): OperationChanges => ({ create: false, update: false, publish: false, withdraw: false });
const deferred = (reason: string): OperationResult => ({ status: 'deferred', reason, changes: noChanges() });
const unchanged = (reason: string): OperationResult => ({ status: 'unchanged', reason, changes: noChanges() });
function changed(mode: OperationMode, reason: string, changes: Partial<OperationChanges>): OperationResult {
  return { status: mode === 'dry-run' ? 'would_apply' : 'applied', reason, changes: { ...noChanges(), ...changes } };
}
function validMode(mode: unknown): mode is OperationMode { return mode === 'dry-run' || mode === 'apply'; }
function validNow(now: Date): boolean { return now instanceof Date && Number.isFinite(now.getTime()); }
function projectionId(sourceId: string): string { return `datatourisme_${sourceId}`; }
function projectionIdentity(data: unknown, sourceId: string): boolean {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return false;
  const value = data as Record<string, unknown>;
  return value.origin === 'datatourisme' && value.contentType === 'event' && value.sourceId === sourceId;
}
function pilotCount(data: unknown): number | null {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return null;
  const value = data as Record<string, unknown>;
  return value.origin === 'datatourisme' && value.version === 1 && value.maxSources === DATATOURISME_PILOT_LIMIT &&
    Number.isSafeInteger(value.sourceCount) && (value.sourceCount as number) >= 0 &&
    (value.sourceCount as number) <= DATATOURISME_PILOT_LIMIT ? value.sourceCount as number : null;
}
function linkedProjection(source: ExternalEvent | null, projectionExists: boolean, projectionData: unknown): boolean {
  if (!source) return !projectionExists;
  const linked = source.projectionIds.length === 1 && source.projectionIds[0] === projectionId(source.id);
  return linked ? projectionExists && projectionIdentity(projectionData, source.id) : !projectionExists;
}
function sourceChanged(previous: ExternalEvent, next: ExternalEvent): boolean {
  return !isDeepStrictEqual(Object.fromEntries(Object.keys(next).map((key) =>
    [key, (previous as unknown as Record<string, unknown>)[key]])), next);
}
function writeSource(tx: Transaction, reference: ReturnType<Firestore['doc']>, source: ExternalEvent): void {
  // Merge preserves unrelated private fields; every contract field in source is explicit.
  tx.set(reference, source, { merge: true });
}

export type VerifiedDetailInput = Omit<PrepareInput, 'poi' | 'complete'> & {
  detail: AttestedDetailResult;
  /** The future owner entry point supplies an explicit operation; omitted only by legacy local callers. */
  intent?: 'import' | 'sync';
  mode: OperationMode;
};

/** No network access here. A future owner-only caller must fetch and verify the detail first. */
export async function importOrSyncExternalTransaction(firestore: Firestore, input: VerifiedDetailInput): Promise<OperationResult> {
  if (!validMode(input.mode) || !validNow(input.now) ||
      (input.intent !== undefined && input.intent !== 'import' && input.intent !== 'sync')) return deferred('INVALID_OPERATION');
  if (input.detail?.kind === 'not_found') return deferred('DETAIL_NOT_FOUND');
  if (input.detail?.kind === 'error') return deferred(`DETAIL_${input.detail.reason.toUpperCase()}`);
  const attestation = verifyAttestedDatatourismeDetail(input.detail, input.expectedUuid, input.timezone);
  if (!attestation) return deferred('DETAIL_NOT_ATTESTED');
  if (attestation.temporalIssue) return deferred(attestation.temporalIssue);
  const detail = attestation.detail;
  const candidateId = externalEventId(input.expectedUuid);
  if (!candidateId) return deferred('UUID_INCOHERENT');
  const sourceRef = firestore.doc(`datatourisme_events/${candidateId}`);
  const publicRef = firestore.doc(`discovery_public/${projectionId(candidateId)}`);
  const counterRef = firestore.doc(DATATOURISME_PILOT_CONTROL_PATH);
  return firestore.runTransaction(async (tx) => {
    // All reads precede all writes; Firestore retries concurrent changes to the shared counter.
    const [sourceSnap, publicSnap, counterSnap] = await Promise.all([
      tx.get(sourceRef), tx.get(publicRef), tx.get(counterRef),
    ]);
    const count = pilotCount(counterSnap.data());
    if (count === null) return deferred('PILOT_COUNTER_UNINITIALIZED_OR_INVALID');
    const stored = sourceSnap.exists ? sourceSnap.data() : null;
    if (stored !== null && (!isExternalEvent(stored) || !matchesExternalIdentity(stored, input.expectedUuid))) {
      return deferred('SOURCE_IDENTITY_COLLISION');
    }
    const existing = stored as ExternalEvent | null;
    if (!linkedProjection(existing, publicSnap.exists, publicSnap.data())) return deferred('PROJECTION_IDENTITY_MISMATCH');
    if (input.intent === 'import' && existing) return deferred('SOURCE_ALREADY_IMPORTED');
    if (input.intent === 'sync' && !existing) return deferred('SOURCE_NOT_IMPORTED');
    const prepared = prepareDatatourismeCandidate({
      ...input, poi: detail.poi, complete: detail.complete,
      manualCategory: existing?.editorial.categoryMode === 'manual'
        ? existing.editorial.categoryId : input.manualCategory,
      allowExpired: true,
    });
    if (prepared.kind === 'rejected') return deferred(prepared.reasons[0] ?? 'CANDIDATE_REJECTED');
    const candidate = prepared.event;
    if (!existing && count >= DATATOURISME_PILOT_LIMIT) return deferred('PILOT_LIMIT_REACHED');
    if (existing && count === 0) return deferred('PILOT_COUNTER_INCONSISTENT');
    if (!existing && candidate.periods.length !== 1) return deferred('PERIOD_COUNT_UNSUPPORTED');
    if (!existing && Date.parse(candidate.expiresAt!) <= input.now.getTime()) return deferred('EXPIRED');
    const reconciled = reconcileExternalCandidate(existing, candidate);
    if (reconciled.kind === 'rejected') return deferred(reconciled.reasons[0] ?? 'CANDIDATE_REJECTED');
    const expired = Date.parse(reconciled.event.expiresAt!) <= input.now.getTime();
    // A fetched detail is pilot-compatible, but the API does not guarantee occurrence exhaustiveness.
    if (expired && reconciled.event.projectionIds.length) return deferred('TEMPORAL_EXHAUSTIVENESS_UNPROVEN');
    const next: ExternalEvent = reconciled.event;
    let nextProjection: ReturnType<typeof buildDatatourismeDiscoveryProjection> = null;
    if (next.projectionIds.length) {
      nextProjection = buildDatatourismeDiscoveryProjection(next, input.now);
      if (!nextProjection) return deferred('PUBLISHED_SOURCE_NO_LONGER_ELIGIBLE');
    }
    const create = !existing;
    const update = !!existing && sourceChanged(existing, next);
    const refresh = !!nextProjection && !isDeepStrictEqual(publicSnap.data(), nextProjection.data);
    if (!create && !update && !refresh) return unchanged('NO_USEFUL_CHANGE');
    if (input.mode === 'apply') {
      if (create) {
        tx.create(sourceRef, next);
        tx.update(counterRef, { sourceCount: count + 1 });
      } else if (update) writeSource(tx, sourceRef, next);
      if (refresh && nextProjection) tx.set(publicRef, nextProjection.data);
    }
    return changed(input.mode, create ? 'SOURCE_CREATED' : 'SOURCE_SYNCHRONIZED',
      { create, update, publish: refresh });
  });
}

/** Publication is a separate, explicit editorial decision; hiding always wins over sync. */
export async function decideExternalPublicationTransaction(
  firestore: Firestore, sourceId: string, decision: 'approve' | 'hide', now: Date, mode: OperationMode,
): Promise<OperationResult> {
  if (!EXTERNAL_ID.test(sourceId) || !validNow(now) || !validMode(mode) || !['approve', 'hide'].includes(decision)) {
    return deferred('INVALID_OPERATION');
  }
  const sourceRef = firestore.doc(`datatourisme_events/${sourceId}`);
  const publicRef = firestore.doc(`discovery_public/${projectionId(sourceId)}`);
  return firestore.runTransaction(async (tx) => {
    const [sourceSnap, publicSnap] = await Promise.all([tx.get(sourceRef), tx.get(publicRef)]);
    const source = sourceSnap.data();
    if (!isExternalEvent(source) || source.id !== sourceId) return deferred('SOURCE_MISSING_OR_INVALID');
    if (!linkedProjection(source, publicSnap.exists, publicSnap.data())) return deferred('PROJECTION_IDENTITY_MISMATCH');
    if (decision === 'hide') {
      const next: ExternalEvent = { ...source, publication: { state: 'hidden' }, projectionIds: [] };
      const update = sourceChanged(source, next);
      const withdraw = publicSnap.exists;
      if (!update && !withdraw) return unchanged('ALREADY_HIDDEN');
      if (mode === 'apply') {
        if (update) writeSource(tx, sourceRef, next);
        if (withdraw) tx.delete(publicRef);
      }
      return changed(mode, 'EDITORIAL_HIDE', { update, withdraw });
    }
    if (source.periods.length !== 1 || source.periods[0].timePrecision !== 'date' ||
        !source.periods[0].endDay || source.periods[0].startDay !== source.periods[0].endDay) {
      return deferred('PERIOD_PILOT_UNSUPPORTED');
    }
    const next: ExternalEvent = {
      ...source, publication: { state: 'approved' }, projectionIds: [publicRef.id],
    };
    const publicValue = buildDatatourismeDiscoveryProjection(next, now);
    if (!publicValue) return deferred('PUBLICATION_NOT_ELIGIBLE');
    const update = sourceChanged(source, next);
    const publish = !isDeepStrictEqual(publicSnap.data(), publicValue.data);
    if (!update && !publish) return unchanged('ALREADY_PUBLISHED');
    if (mode === 'apply') {
      if (update) writeSource(tx, sourceRef, next);
      if (publicSnap.exists) {
        if (publish) tx.set(publicRef, publicValue.data);
      } else tx.create(publicRef, publicValue.data);
    }
    return changed(mode, 'EDITORIAL_PUBLICATION', { update, publish });
  });
}

/** One bounded cleanup decision, with no physical source deletion. */
export async function inspectExternalCleanupTransaction(
  firestore: Firestore, sourceId: string, now: Date, mode: OperationMode,
): Promise<OperationResult> {
  if (!EXTERNAL_ID.test(sourceId) || !validNow(now) || !validMode(mode)) return deferred('INVALID_OPERATION');
  const sourceRef = firestore.doc(`datatourisme_events/${sourceId}`);
  const publicRef = firestore.doc(`discovery_public/${projectionId(sourceId)}`);
  return firestore.runTransaction(async (tx) => {
    const [sourceSnap, publicSnap] = await Promise.all([tx.get(sourceRef), tx.get(publicRef)]);
    const source = sourceSnap.data();
    if (!isExternalEvent(source) || source.id !== sourceId) return deferred('SOURCE_MISSING_OR_INVALID');
    if (!linkedProjection(source, publicSnap.exists, publicSnap.data())) return deferred('PROJECTION_IDENTITY_MISMATCH');
    const decision = decideExternalCleanup(source, now, 30,
      publicSnap.exists ? { ...publicSnap.data(), id: publicRef.id } : undefined);
    if (decision.action === 'defer_review') return deferred(decision.reason);
    if (decision.action === 'purge_candidate') {
      return { status: 'purge_candidate', reason: decision.reason, changes: noChanges() };
    }
    if (decision.action === 'remove_external_projection' || decision.action === 'hide_publicly') {
      if (decision.projectionId !== publicRef.id || !publicSnap.exists) return deferred('PROJECTION_IDENTITY_MISMATCH');
      const next: ExternalEvent = { ...source, projectionIds: [] };
      if (mode === 'apply') {
        writeSource(tx, sourceRef, next);
        tx.delete(publicRef);
      }
      return changed(mode, decision.reason, { update: true, withdraw: true });
    }
    if (source.projectionIds.length && source.publication.state === 'approved') {
      const rebuilt = buildDatatourismeDiscoveryProjection(source, now);
      if (!rebuilt) return deferred('PROJECTION_REFRESH_UNCERTAIN');
      if (!isDeepStrictEqual(publicSnap.data(), rebuilt.data)) {
        if (mode === 'apply') tx.set(publicRef, rebuilt.data);
        return changed(mode, 'PROJECTION_REFRESH', { publish: true });
      }
    }
    return unchanged(decision.reason);
  });
}

export function summarizeExternalOperations(results: readonly OperationResult[]): OperationSummary {
  const summary: OperationSummary = {
    examined: results.length, creations: 0, updates: 0, publications: 0,
    withdrawals: 0, deferred: 0, purgeCandidates: 0, reasons: {},
  };
  for (const result of results) {
    summary.creations += Number(result.changes.create);
    summary.updates += Number(result.changes.update);
    summary.publications += Number(result.changes.publish);
    summary.withdrawals += Number(result.changes.withdraw);
    summary.deferred += Number(result.status === 'deferred');
    summary.purgeCandidates += Number(result.status === 'purge_candidate');
    summary.reasons[result.reason] = (summary.reasons[result.reason] ?? 0) + 1;
  }
  return summary;
}

/** Caller supplies at most 100 IDs; no collection scan or scheduler is introduced here. */
export async function inspectExternalCleanupBatch(
  firestore: Firestore, sourceIds: readonly string[], now: Date, mode: OperationMode,
): Promise<OperationSummary> {
  if (sourceIds.length > DATATOURISME_PILOT_LIMIT || new Set(sourceIds).size !== sourceIds.length ||
      sourceIds.some((id) => !EXTERNAL_ID.test(id))) throw new Error('INVALID_CLEANUP_BATCH');
  const results: OperationResult[] = [];
  for (const id of sourceIds) results.push(await inspectExternalCleanupTransaction(firestore, id, now, mode));
  return summarizeExternalOperations(results);
}
