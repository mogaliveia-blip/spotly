import type { AnalysisCandidate } from './datatourisme-analysis';
import type { PilotDepartment } from './datatourisme-admin-demo';
import { classifyDatatourisme } from './datatourisme-classification';
import { discoveryCategories, isCatalogId } from './event-discovery';
import type { DiscoveryCategoryId } from './event-discovery';

export const MAX_DATATOURISME_SELECTION = 100;

export type SelectedCandidate = {
  candidate: AnalysisCandidate;
  examinedDepartment: PilotDepartment;
  categoryId: DiscoveryCategoryId | null;
  categoryManuallySet: boolean;
  confirmed: boolean;
};

export type SelectionAction =
  | { type: 'add'; candidate: AnalysisCandidate; department: PilotDepartment; rejectionReviewed: boolean }
  | { type: 'remove'; id: string }
  | { type: 'category'; id: string; categoryId: DiscoveryCategoryId | null }
  | { type: 'confirm'; id: string; confirmed: boolean };

export function hasUsableSourceId(candidate: AnalysisCandidate): boolean {
  return !!candidate.id.trim() && !candidate.id.startsWith('source_sans_identifiant_') &&
    !candidate.reasons.includes('Identifiant source absent.');
}

export function hasTechnicalCategory(candidate: AnalysisCandidate): boolean {
  return !candidate.sourceTypes && ['product', 'traineeship', 'pointofinterest'].includes(candidate.category?.trim().toLowerCase() ?? '');
}

export function needsEditorialConfirmation(candidate: AnalysisCandidate): boolean {
  return candidate.quality === 'a_verifier' || candidate.possibleDuplicate || classifyDatatourisme(candidate).needsReview;
}

export function isReadyForFuturePreparation(entry: SelectedCandidate): boolean {
  return entry.candidate.quality !== 'rejete' && entry.categoryId !== null &&
    (!needsEditorialConfirmation(entry.candidate) || entry.confirmed);
}

export function datatourismeSelectionReducer(
  selection: Map<string, SelectedCandidate>, action: SelectionAction
): Map<string, SelectedCandidate> {
  if (action.type === 'add') {
    if (selection.has(action.candidate.id) || selection.size >= MAX_DATATOURISME_SELECTION ||
        !hasUsableSourceId(action.candidate) ||
        (action.candidate.quality === 'rejete' && !action.rejectionReviewed)) return selection;
    return new Map(selection).set(action.candidate.id, {
      candidate: action.candidate, examinedDepartment: action.department,
      categoryId: classifyDatatourisme(action.candidate).categoryId, categoryManuallySet: false, confirmed: false
    });
  }
  if (!selection.has(action.id)) return selection;
  const next = new Map(selection);
  if (action.type === 'remove') {
    next.delete(action.id);
  } else {
    const entry = selection.get(action.id)!;
    if (action.type === 'category') {
      if (action.categoryId !== null && !isCatalogId(discoveryCategories, action.categoryId)) return selection;
      next.set(action.id, { ...entry, categoryId: action.categoryId, categoryManuallySet: true });
    } else {
      if (entry.candidate.quality === 'rejete' || !needsEditorialConfirmation(entry.candidate)) return selection;
      next.set(action.id, { ...entry, confirmed: action.confirmed });
    }
  }
  return next;
}

export function summarizeDatatourismeSelection(selection: Map<string, SelectedCandidate>) {
  const departments: Record<PilotDepartment, number> = { '22': 0, '29': 0, '35': 0, '56': 0 };
  let acceptable = 0;
  let pendingConfirmation = 0;
  let possibleDuplicates = 0;
  let rejectedAfterReview = 0;
  let categoriesToDefine = 0;
  let readyForFuturePreparation = 0;
  for (const entry of selection.values()) {
    departments[entry.examinedDepartment] += 1;
    if (entry.candidate.quality === 'acceptable') acceptable += 1;
    if (entry.candidate.quality === 'rejete') rejectedAfterReview += 1;
    else if (needsEditorialConfirmation(entry.candidate) && !entry.confirmed) pendingConfirmation += 1;
    if (entry.candidate.possibleDuplicate) possibleDuplicates += 1;
    if (entry.categoryId === null) categoriesToDefine += 1;
    if (isReadyForFuturePreparation(entry)) readyForFuturePreparation += 1;
  }
  return { departments, acceptable, pendingConfirmation, possibleDuplicates, rejectedAfterReview, categoriesToDefine, readyForFuturePreparation };
}
