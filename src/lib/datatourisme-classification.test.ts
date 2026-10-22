import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { classifyDatatourisme } from './datatourisme-classification';
import type { SourceTerm } from './datatourisme-analysis';

function classify(keys: string[], themes: string[] = []) {
  const terms = (values: string[]): SourceTerm[] => values.map((key) => ({ key, label: key }));
  return classifyDatatourisme({ category: keys[0] ?? null, sourceTypes: terms(keys), sourceThemes: terms(themes) });
}

describe('DATAtourisme deterministic classification', () => {
  it('recognizes music and concert despite generic and broader types', () => {
    assert.deepEqual(classify(['Product', 'PointOfInterest', 'CulturalEvent', 'ShowEvent', 'MusicEvent', 'Concert']), {
      categoryId: 'music', editorialType: 'Concert', needsReview: false, reason: null, completeTypes: true
    });
  });

  it('distinguishes theatre from other shows', () => {
    assert.equal(classify(['ShowEvent', 'TheaterEvent']).editorialType, 'Théâtre');
    assert.equal(classify(['ShowEvent']).editorialType, 'Spectacle');
    assert.equal(classify(['ShowEvent']).categoryId, 'culture');
  });

  it('classifies sport and distinguishes a ramble from a sporting hike', () => {
    assert.equal(classify(['SportsEvent']).categoryId, 'sport');
    assert.deepEqual([classify(['Rambling']).categoryId, classify(['Rambling']).editorialType], ['nature', 'Balade']);
    assert.deepEqual([classify(['Rambling', 'SportsEvent']).categoryId, classify(['Rambling', 'SportsEvent']).editorialType], ['sport', 'Randonnée']);
  });

  it('holds an ambiguous rambling visit for review', () => {
    const proposal = classify(['Visit', 'Rambling', 'SportsEvent', 'CulturalEvent']);
    assert.equal(proposal.categoryId, null);
    assert.equal(proposal.needsReview, true);
    assert.match(proposal.reason!, /contradictoires/);
    assert.equal(classify(['Visit', 'Rambling']).categoryId, null);
    assert.match(classify(['Visit', 'Rambling']).reason!, /Balade et visite/);
    assert.equal(classify(['Visit']).categoryId, null);
    assert.equal(classify(['Visit', 'CulturalSite']).categoryId, 'culture');
  });

  it('recognizes an atelier or stage but checks mixed show and training types', () => {
    const stage = classify(['Traineeship', 'Practice', 'CulturalEvent']);
    assert.equal(stage.categoryId, 'culture');
    assert.equal(stage.editorialType, 'Stage / atelier');
    const mixed = classify(['ShowEvent', 'Traineeship', 'Practice', 'CulturalEvent']);
    assert.equal(mixed.categoryId, 'culture');
    assert.equal(mixed.editorialType, null);
    assert.equal(mixed.needsReview, true);
  });

  it('keeps market and festival subject to context', () => {
    assert.equal(classify(['Market']).editorialType, 'Marché');
    assert.equal(classify(['Market']).categoryId, null);
    assert.equal(classify(['Market'], ['Gastronomy']).categoryId, 'gastronomy');
    assert.equal(classify(['Festival']).editorialType, 'Festival');
    assert.equal(classify(['Festival']).categoryId, null);
    assert.equal(classify(['Festival', 'MusicEvent']).categoryId, 'music');
  });

  it('does not classify generic-only, unknown or contradictory precise types', () => {
    assert.equal(classify(['Product', 'PointOfInterest', 'Event']).categoryId, null);
    assert.equal(classify(['UnrecognizedEvent', 'Concert']).categoryId, null);
    const conflict = classify(['Concert', 'TheaterEvent']);
    assert.equal(conflict.categoryId, null);
    assert.equal(conflict.editorialType, null);
    assert.equal(conflict.needsReview, true);
  });

  it('accepts the deployed single-type response only as a proposal to verify', () => {
    const proposal = classifyDatatourisme({ category: 'Concert' });
    assert.equal(proposal.categoryId, 'music');
    assert.equal(proposal.completeTypes, false);
    assert.equal(proposal.needsReview, true);
    assert.equal(classifyDatatourisme({ category: 'Product' }).categoryId, null);
  });
});
