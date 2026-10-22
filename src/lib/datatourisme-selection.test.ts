import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { AnalysisCandidate } from './datatourisme-analysis';
import type { PilotDepartment } from './datatourisme-admin-demo';
import {
  datatourismeSelectionReducer as reduce, hasTechnicalCategory, isReadyForFuturePreparation,
  MAX_DATATOURISME_SELECTION, needsEditorialConfirmation, summarizeDatatourismeSelection
} from './datatourisme-selection';
import type { SelectedCandidate } from './datatourisme-selection';

const base: AnalysisCandidate = {
  id: 'source-1', title: 'Événement', description: 'Description', startDay: '2027-06-14', endDay: null,
  city: 'Vannes', department: '56', category: 'Festival', subcategory: null, producer: 'Office de tourisme',
  provenance: 'DATAtourisme', location: { lat: 47.66, lng: -2.76 }, positionPrecision: 'source_coordinates',
  updatedAt: null, sourceUrl: 'https://example.com/source-1', quality: 'acceptable', reasons: [], possibleDuplicate: false
};

function candidate(id: string, changes: Partial<AnalysisCandidate> = {}): AnalysisCandidate {
  return { ...base, id, ...changes };
}

function add(selection: Map<string, SelectedCandidate>, item: AnalysisCandidate, department: PilotDepartment = '56', rejectionReviewed = false) {
  return reduce(selection, { type: 'add', candidate: item, department, rejectionReviewed });
}

describe('temporary DATAtourisme editorial selection', () => {
  it('deduplicates source IDs across departments and caps the whole pilot at 100', () => {
    let selection = new Map<string, SelectedCandidate>();
    for (let index = 0; index < MAX_DATATOURISME_SELECTION; index += 1) {
      selection = add(selection, candidate(`source-${index}`), index % 2 ? '22' : '56');
    }
    assert.equal(selection.size, 100);
    assert.equal(add(selection, candidate('source-0'), '29'), selection);
    assert.equal(add(selection, candidate('source-101'), '35'), selection);
    assert.deepEqual(summarizeDatatourismeSelection(selection).departments, { '22': 50, '29': 0, '35': 0, '56': 50 });
    selection = reduce(selection, { type: 'remove', id: 'source-0' });
    selection = add(selection, candidate('source-101'), '35');
    assert.equal(selection.size, 100);
    assert.equal(selection.get('source-101')?.examinedDepartment, '35');
  });

  it('requires explicit review for rejected records and never selects a generated missing-ID placeholder', () => {
    const rejected = candidate('source-rejected', { quality: 'rejete', reasons: ['Date de début absente.'] });
    const empty = new Map<string, SelectedCandidate>();
    assert.equal(add(empty, rejected), empty);
    let reviewed = add(empty, rejected, '56', true);
    assert.equal(reviewed.size, 1);
    reviewed = reduce(reviewed, { type: 'category', id: rejected.id, categoryId: 'culture' });
    assert.equal(reduce(reviewed, { type: 'confirm', id: rejected.id, confirmed: true }), reviewed);
    assert.equal(isReadyForFuturePreparation(reviewed.get(rejected.id)!), false);
    assert.equal(summarizeDatatourismeSelection(reviewed).rejectedAfterReview, 1);
    assert.equal(add(reviewed, candidate('source_sans_identifiant_0', { quality: 'rejete', reasons: ['Identifiant source absent.'] }), '22', true), reviewed);
  });

  it('keeps Discovery classification manual and requires confirmation for review and technical labels', () => {
    for (const label of ['Product', 'Traineeship', 'PointOfInterest']) {
      assert.equal(hasTechnicalCategory(candidate(label, { category: label })), true);
    }
    const needsReview = candidate('source-review', { quality: 'a_verifier', reasons: ['Description absente.'], possibleDuplicate: true });
    let selection = add(new Map(), needsReview);
    assert.equal(selection.get(needsReview.id)?.categoryId, null);
    assert.equal(needsEditorialConfirmation(needsReview), true);
    assert.equal(summarizeDatatourismeSelection(selection).pendingConfirmation, 1);
    assert.equal(summarizeDatatourismeSelection(selection).categoriesToDefine, 1);
    selection = reduce(selection, { type: 'category', id: needsReview.id, categoryId: 'culture' });
    assert.equal(isReadyForFuturePreparation(selection.get(needsReview.id)!), false);
    selection = reduce(selection, { type: 'confirm', id: needsReview.id, confirmed: true });
    assert.equal(isReadyForFuturePreparation(selection.get(needsReview.id)!), true);
    assert.equal(summarizeDatatourismeSelection(selection).possibleDuplicates, 1);

    const generic = candidate('source-generic', { category: 'Product' });
    selection = add(selection, generic);
    assert.equal(selection.get(generic.id)?.categoryId, null);
    assert.equal(isReadyForFuturePreparation(selection.get(generic.id)!), false);
    selection = reduce(selection, { type: 'category', id: generic.id, categoryId: 'nature' });
    assert.equal(isReadyForFuturePreparation(selection.get(generic.id)!), false);
    selection = reduce(selection, { type: 'confirm', id: generic.id, confirmed: true });
    assert.equal(isReadyForFuturePreparation(selection.get(generic.id)!), true);
  });

  it('prefills a proposal, keeps a manual correction across duplicate pages and confirms legacy data', () => {
    const enriched = candidate('source-music', { category: 'Product', sourceTypes: [
      { key: 'Product', label: 'Product' }, { key: 'Concert', label: 'Concert' }
    ], sourceThemes: [] });
    let selection = add(new Map(), enriched, '22');
    assert.equal(selection.get(enriched.id)?.categoryId, 'music');
    assert.equal(selection.get(enriched.id)?.categoryManuallySet, false);
    assert.equal(isReadyForFuturePreparation(selection.get(enriched.id)!), true);
    selection = reduce(selection, { type: 'category', id: enriched.id, categoryId: 'culture' });
    assert.equal(selection.get(enriched.id)?.categoryManuallySet, true);
    assert.equal(add(selection, candidate(enriched.id, { category: 'Market' }), '29'), selection);
    assert.equal(selection.get(enriched.id)?.categoryId, 'culture');
    assert.equal(selection.get(enriched.id)?.examinedDepartment, '22');

    const legacy = candidate('source-legacy', { category: 'Concert' });
    selection = add(selection, legacy, '56');
    assert.equal(selection.get(legacy.id)?.categoryId, 'music');
    assert.equal(isReadyForFuturePreparation(selection.get(legacy.id)!), false);
    selection = reduce(selection, { type: 'confirm', id: legacy.id, confirmed: true });
    assert.equal(isReadyForFuturePreparation(selection.get(legacy.id)!), true);
  });
});
