import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { AppConfig } from './types';
import { selectPortalView } from './portal-view';

describe('Portal display while configuration resolves', () => {
  it('shows only a neutral state during a slow configuration read', async () => {
    let resolveConfig!: (config: AppConfig) => void;
    const pendingConfig = new Promise<AppConfig>((resolve) => { resolveConfig = resolve; });
    assert.equal(selectPortalView(undefined, true, 0, 'success', true), 'loading');
    resolveConfig({ isLandingPageActive: true });
    assert.equal(selectPortalView(await pendingConfig, true, 0, 'success', true), 'landing');
  });

  it('keeps the active mode neutral until the first event read settles, even with cached events', () => {
    const active = { isLandingPageActive: true };
    assert.equal(selectPortalView(active, false, 1, 'refreshing', true), 'loading');
    assert.equal(selectPortalView(active, true, 0, 'success', true), 'landing');
    assert.equal(selectPortalView(active, true, 1, 'success', true), 'portal');
    assert.equal(selectPortalView(active, true, 0, 'refreshing', true), 'landing');
  });

  it('keeps the normal portal available when the landing mode is disabled', () => {
    assert.equal(selectPortalView({ isLandingPageActive: false }, false, 0, 'loading', false), 'portal');
  });

  it('does not expose the portal after a configuration or first event read failure', () => {
    assert.equal(selectPortalView(null, true, 1, 'success', true), 'config-error');
    assert.equal(selectPortalView({ isLandingPageActive: true }, true, 0, 'error', false), 'events-error');
    assert.equal(selectPortalView({ isLandingPageActive: true }, true, 0, 'loading', false), 'loading');
  });
});
