import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { AppConfig } from './types';
import { selectPortalView } from './portal-view';

describe('Home presentation follows the platform setting', () => {
  const matrix = [
    { landingActive: true, eventCount: 0, expected: 'landing' },
    { landingActive: true, eventCount: 2, expected: 'landing' },
    { landingActive: false, eventCount: 0, expected: 'portal' },
    { landingActive: false, eventCount: 2, expected: 'portal' },
  ] as const;

  for (const { landingActive, eventCount, expected } of matrix) {
    it(`selects ${expected} with landing ${landingActive ? 'enabled' : 'disabled'} and ${eventCount} published events`, () => {
      assert.equal(selectPortalView({ isLandingPageActive: landingActive }), expected);
    });
  }

  it('shows a neutral state before configuration resolves, even when events have loaded or are cached', async () => {
    let resolveConfig!: (config: AppConfig) => void;
    const pendingConfig = new Promise<AppConfig>((resolve) => { resolveConfig = resolve; });

    assert.equal(selectPortalView(undefined), 'loading');
    resolveConfig({ isLandingPageActive: true });
    assert.equal(selectPortalView(await pendingConfig), 'landing');
  });

  it('shows a configuration error when its read fails', () => {
    assert.equal(selectPortalView(null), 'config-error');
  });

  it('keeps the landing visible while events load, fail, or come from cache', () => {
    assert.equal(selectPortalView({ isLandingPageActive: true }), 'landing');
  });

  it('keeps the portal visible while events load or fail', () => {
    assert.equal(selectPortalView({ isLandingPageActive: false }), 'portal');
  });
});
