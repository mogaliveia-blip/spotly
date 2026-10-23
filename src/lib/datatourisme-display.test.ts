import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { ExternalDiscoveryResultDto } from '../../functions/src/discovery-search-contract';
import { datatourismePeriodLabel, datatourismeSourceUpdatedLabel } from './datatourisme-display';

const base = {
  timePrecision: 'date', startDay: '2026-10-24', endDay: '2026-10-24', timezone: 'Europe/Paris',
} as Extract<ExternalDiscoveryResultDto, { timePrecision: 'date' }>;

describe('DATAtourisme public dates', () => {
  it('shows a French civil date without inventing an hour', () => {
    assert.equal(datatourismePeriodLabel(base), 'Samedi 24 octobre 2026');
    assert.equal(datatourismePeriodLabel({ ...base, startTime: '18:30' }), 'Samedi 24 octobre 2026 · À 18 h 30');
    assert.equal(datatourismePeriodLabel({ ...base, endDay: '2026-10-25' }),
      'Samedi 24 octobre 2026 – Dimanche 25 octobre 2026');
  });

  it('shows both exact instants in Paris, including a change of civil day', () => {
    const exact = { ...base, timePrecision: 'datetime', startDay: undefined, endDay: undefined,
      windowStartAt: { seconds: Date.parse('2026-10-24T16:30:00Z') / 1000, nanoseconds: 0 },
      windowEndAt: { seconds: Date.parse('2026-10-24T18:00:00Z') / 1000, nanoseconds: 0 } } as ExternalDiscoveryResultDto;
    assert.equal(datatourismePeriodLabel(exact), 'Samedi 24 octobre 2026 · De 18 h 30 à 20 h 00');
    assert.equal(datatourismePeriodLabel({ ...exact,
      windowEndAt: { seconds: Date.parse('2026-10-24T23:30:00Z') / 1000, nanoseconds: 0 } }),
      'Samedi 24 octobre 2026 à 18 h 30 – Dimanche 25 octobre 2026 à 1 h 30');
  });

  it('keeps a date-only producer update separate from an instant', () => {
    assert.equal(datatourismeSourceUpdatedLabel('2026-10-20'), 'Mardi 20 octobre 2026');
    assert.equal(datatourismeSourceUpdatedLabel('2026-10-20T23:30:00.000Z'), 'Mercredi 21 octobre 2026');
  });
});
