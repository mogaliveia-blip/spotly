import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import { DatatourismeAdminPreview } from '../components/admin/datatourisme-admin-preview';
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
    assert.doesNotMatch(html, /événements examinés sur cette page/);
    assert.match(html, /Masquage global non disponible/);
    const buttons = html.match(/<button[^>]*>/g) ?? [];
    assert.equal(buttons.filter((tag) => /\sdisabled=""/.test(tag)).length, 5);
  });

  it('uses the existing platform owner gate for the route and navigation', () => {
    assert.equal(canAccessPlatformAdmin('owner'), true);
    assert.equal(canAccessPlatformAdmin('user'), false);
    assert.equal(canAccessPlatformAdmin(null), false);
  });
});
