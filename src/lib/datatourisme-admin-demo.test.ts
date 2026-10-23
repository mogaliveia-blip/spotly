import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import { DatatourismeAdminPreview, SyncPreviewResult } from '../components/admin/datatourisme-admin-preview';
import { canAccessPlatformAdmin } from './access-control';
import { DEMO_CANDIDATES, PILOT_DEPARTMENTS, demoCandidatesForDepartments } from './datatourisme-admin-demo';

describe('DATAtourisme Super Admin prototype', () => {
  it('keeps the pilot to four departments with clearly fictional examples', () => {
    assert.deepEqual(PILOT_DEPARTMENTS.map((item) => item.code), ['22', '29', '35', '56']);
    assert.equal(DEMO_CANDIDATES.length, 4);
    assert.equal(new Set(DEMO_CANDIDATES.map((item) => item.id)).size, 4);
    assert.ok(DEMO_CANDIDATES.every((item) => item.id.startsWith('demo_') &&
      /fictif|fictive/.test(item.title) && item.provenance.includes('fictive') && !('sourceUrl' in item)));
    assert.equal(demoCandidatesForDepartments(['29', '56']).length, 2);
    assert.deepEqual(demoCandidatesForDepartments([]), []);
  });

  it('allows a future start without an end date and never decides a possible native duplicate automatically', () => {
    assert.ok(DEMO_CANDIDATES.some((item) => item.decision === 'retenu' && !item.endDay && item.reason?.includes('fin')));
    assert.ok(DEMO_CANDIDATES.some((item) => item.possibleNativeDuplicate && item.decision === 'a_confirmer'));
    assert.ok(DEMO_CANDIDATES.every((item) => item.decision !== 'rejete' || !!item.reason));
  });

  it('renders a read-only analysis action and disabled future operations', () => {
    const html = renderToStaticMarkup(createElement(DatatourismeAdminPreview));
    assert.match(html, /Analyse sans importation/);
    assert.match(html, /Analyser les données/);
    assert.match(html, /Département/);
    assert.match(html, /Sélection éditoriale temporaire/);
    assert.match(html, /Voir la sélection \(0\)/);
    assert.match(html, /Aucune sauvegarde Firestore, aucune importation et aucune publication/);
    assert.doesNotMatch(html, /événements examinés sur cette page/);
    assert.match(html, /Masquage global non disponible/);
    assert.match(html, /Prévisualiser la synchronisation/);
    assert.match(html, /UUID de la source déjà importée/);
    assert.doesNotMatch(html, /<button[^>]*>Appliquer<\/button>/);
    const buttons = html.match(/<button[^>]*>/g) ?? [];
    assert.equal(buttons.filter((tag) => /\sdisabled=""/.test(tag)).length, 4);
  });

  it('renders current and proposed fields, availability, and the no-write notice', () => {
    const field = (current: string | null, proposed: string | null,
      status: 'new' | 'modified' | 'unchanged' | 'unavailable') => ({ current, proposed, status });
    const html = renderToStaticMarkup(createElement(SyncPreviewResult, { preview: {
      sourceId: 'dt_' + 'a'.repeat(64), publicationState: 'approved', hasFieldChanges: true,
      privateFieldsCleared: [],
      publicProjectionChanges: [],
      fields: {
        title: field('Concert fictif', 'Concert fictif', 'unchanged'),
        venueName: field(null, 'Salle fictive', 'new'),
        address: field(null, null, 'unavailable'),
        city: field('Vannes', 'Vannes', 'unchanged'),
        department: field('56', '56', 'unchanged'),
        producer: field('Producteur fictif', 'Producteur fictif', 'unchanged'),
        sourceUpdatedAt: field(null, '2026-10-22', 'new'),
      },
    } }));
    assert.match(html, /Publié — approved/);
    assert.match(html, /Salle fictive/);
    assert.match(html, /Non disponible dans la source/);
    assert.match(html, /Nouveau/);
    assert.match(html, /Changements confirmés dans les champs affichés/);
    assert.match(html, /Aucune modification enregistrée/);
    assert.doesNotMatch(html, /<button/);
  });

  it('warns about a public address removal even without a confirmed private field change', () => {
    const unchanged = (value: string) => ({ current: value, proposed: value, status: 'unchanged' as const });
    const html = renderToStaticMarkup(createElement(SyncPreviewResult, { preview: {
      sourceId: 'dt_' + 'b'.repeat(64), publicationState: 'approved', hasFieldChanges: false,
      privateFieldsCleared: [],
      publicProjectionChanges: [{ field: 'address', current: '6 rue du Port, 56000',
        proposed: null, status: 'removed' }],
      fields: {
        title: unchanged('Concert fictif'), venueName: unchanged('Salle fictive'),
        address: { current: '6 rue du Port, 56000', proposed: null, status: 'unavailable' },
        city: unchanged('Vannes'), department: unchanged('56'), producer: unchanged('Producteur fictif'),
        sourceUpdatedAt: { current: null, proposed: null, status: 'unavailable' },
      },
    } }));
    assert.match(html, /Aucun changement confirmé dans les champs affichés/);
    assert.match(html, /Attention : impact possible sur la fiche publique/);
    assert.match(html, /Adresse : la valeur serait retirée de la fiche publique/);
    assert.match(html, /Non disponible dans la source/);
    assert.match(html, /Aucune modification enregistrée/);
  });

  it('distinguishes a private date clearing from an unavailable public address', () => {
    const unchanged = (value: string) => ({ current: value, proposed: value, status: 'unchanged' as const });
    const html = renderToStaticMarkup(createElement(SyncPreviewResult, { preview: {
      sourceId: 'dt_' + 'c'.repeat(64), publicationState: 'approved', hasFieldChanges: false,
      privateFieldsCleared: ['sourceUpdatedAt'],
      publicProjectionChanges: [{ field: 'address', current: '6 rue du Port, 56000',
        proposed: null, status: 'removed' }],
      fields: {
        title: unchanged('Concert fictif'), venueName: unchanged('Salle fictive'),
        address: { current: '6 rue du Port, 56000', proposed: null, status: 'unavailable' },
        city: unchanged('Vannes'), department: unchanged('56'), producer: unchanged('Producteur fictif'),
        sourceUpdatedAt: { current: '2026-10-22', proposed: null, status: 'unavailable' },
      },
    } }));
    assert.match(html, /Une future synchronisation effacerait dans la source privée : Dernière mise à jour source/);
    assert.match(html, /Adresse : la valeur serait retirée de la fiche publique/);
  });

  it('uses the existing platform owner gate for the route and navigation', () => {
    assert.equal(canAccessPlatformAdmin('owner'), true);
    assert.equal(canAccessPlatformAdmin('user'), false);
    assert.equal(canAccessPlatformAdmin(null), false);
  });
});
