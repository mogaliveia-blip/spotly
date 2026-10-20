import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { getSponsorLabel, isSponsorActive } from './sponsor-utils';

describe('Public partnership presentation', () => {
  it('shows only enabled partnerships within their optional date interval', () => {
    const now = Date.now();
    const base = { level: 'premium' as const, priority: 7 };
    assert.equal(isSponsorActive({}), false);
    assert.equal(isSponsorActive({ sponsor: { ...base, enabled: false } }), false);
    assert.equal(isSponsorActive({ sponsor: { ...base, enabled: true } }), true);
    assert.equal(isSponsorActive({ sponsor: {
      ...base, enabled: true,
      startDate: new Date(now - 60_000), endDate: new Date(now + 60_000),
    } }), true);
    assert.equal(isSponsorActive({ sponsor: { ...base, enabled: true, startDate: new Date(now + 60_000) } }), false);
    assert.equal(isSponsorActive({ sponsor: { ...base, enabled: true, endDate: new Date(now - 60_000) } }), false);
  });

  it('retains the existing public badge label', () => {
    assert.equal(getSponsorLabel('premium'), 'Partenaire Premium');
  });
});
