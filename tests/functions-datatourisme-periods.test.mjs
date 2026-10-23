import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import periods from '../functions/lib/datatourisme-periods.js';

const { assessDatatourismePeriods, normalizeDatatourismePeriods, definitiveExpirationAt, pilotTemporalIssue } = periods;
const at = (value) => new Date(value);
const period = (startDate, endDate) => ({ startDate, ...(endDate === undefined ? {} : { endDate }) });

describe('DATAtourisme external periods', () => {
  it('distinguishes a future day, an active calendar day and a finished day', () => {
    const one = [period('2026-10-23', '2026-10-23')];
    assert.equal(assessDatatourismePeriods(one, 'Europe/Paris', at('2026-10-22T12:00:00Z')).timing, 'upcoming');
    const active = assessDatatourismePeriods(one, 'Europe/Paris', at('2026-10-23T12:00:00Z'));
    assert.equal(active.timing, 'active');
    assert.equal(active.activePrecision, 'date');
    assert.equal(active.definitivelyExpired, false);
    const ended = assessDatatourismePeriods(one, 'Europe/Paris', at('2026-10-23T22:00:00Z'));
    assert.equal(ended.timing, 'expired');
    assert.equal(ended.definitivelyExpired, true);
  });

  it('does not treat the gap between distinct sessions as an active period', () => {
    const sessions = [period('2026-10-20', '2026-10-20'), period('2026-10-25', '2026-10-25')];
    const gap = assessDatatourismePeriods(sessions, 'Europe/Paris', at('2026-10-22T12:00:00Z'));
    assert.equal(gap.timing, 'between');
    assert.equal(gap.definitivelyExpired, false);
    assert.equal(assessDatatourismePeriods(sessions, 'Europe/Paris', at('2026-10-25T12:00:00Z')).timing, 'active');
    assert.equal(assessDatatourismePeriods(sessions, 'Europe/Paris', at('2026-10-25T23:00:00Z')).definitivelyExpired, true);
  });

  it('withholds expiry when any source period is invalid, missing or open-ended', () => {
    const partlyInvalid = [period('2026-10-20', '2026-10-20'), period('2026-10-21', '2026-10-19')];
    const result = assessDatatourismePeriods(partlyInvalid, 'Europe/Paris', at('2026-10-22T12:00:00Z'));
    assert.deepEqual([result.validCount, result.invalidCount, result.definitivelyExpired], [1, 1, false]);
    assert.equal(result.timing, 'indeterminate');
    assert.equal(assessDatatourismePeriods(undefined, 'Europe/Paris', at('2026-10-22T12:00:00Z')).definitivelyExpired, false);
    assert.equal(assessDatatourismePeriods([], 'Europe/Paris', at('2026-10-22T12:00:00Z')).timing, 'indeterminate');
    const noEnd = [period('2026-10-23')];
    assert.equal(assessDatatourismePeriods(noEnd, 'Europe/Paris', at('2026-10-22T12:00:00Z')).timing, 'upcoming');
    const started = assessDatatourismePeriods(noEnd, 'Europe/Paris', at('2026-10-24T12:00:00Z'));
    assert.equal(started.timing, 'indeterminate');
    assert.equal(started.openEndedCount, 1);
    assert.equal(started.definitivelyExpired, false);
  });

  it('uses the event civil day across UTC midnight and both Paris DST changes', () => {
    const day = [period('2026-03-29', '2026-03-29')];
    assert.equal(assessDatatourismePeriods(day, 'Europe/Paris', at('2026-03-28T22:30:00Z')).timing, 'upcoming');
    assert.equal(assessDatatourismePeriods(day, 'Europe/Paris', at('2026-03-28T23:30:00Z')).timing, 'active');
    assert.equal(assessDatatourismePeriods(day, 'Europe/Paris', at('2026-03-29T22:30:00Z')).timing, 'expired');
    const autumn = [period('2026-10-25', '2026-10-25')];
    assert.equal(assessDatatourismePeriods(autumn, 'Europe/Paris', at('2026-10-25T22:30:00Z')).timing, 'active');
    assert.equal(assessDatatourismePeriods(autumn, 'Europe/Paris', at('2026-10-25T23:30:00Z')).timing, 'expired');
    assert.equal(assessDatatourismePeriods([period('2026-10-25', '2026-10-25')], 'America/New_York', at('2026-10-25T23:30:00Z')).timing, 'active');
  });

  it('uses exact instants only when offsets are explicit and never bridges exact sessions', () => {
    const sessions = [
      period('2026-10-25T01:30:00+02:00', '2026-10-25T02:15:00+02:00'),
      period('2026-10-25T02:30:00+01:00', '2026-10-25T03:30:00+01:00'),
    ];
    const first = assessDatatourismePeriods(sessions, 'Europe/Paris', at('2026-10-25T00:00:00Z'));
    assert.equal(first.timing, 'active');
    assert.equal(first.activePrecision, 'datetime');
    assert.equal(assessDatatourismePeriods(sessions, 'Europe/Paris', at('2026-10-25T00:45:00Z')).timing, 'between');
    assert.equal(assessDatatourismePeriods(sessions, 'Europe/Paris', at('2026-10-25T02:00:00Z')).timing, 'active');
    assert.equal(assessDatatourismePeriods(sessions, 'Europe/Paris', at('2026-10-25T03:00:00Z')).definitivelyExpired, true);
    const naive = assessDatatourismePeriods([period('2026-10-25T02:30:00', '2026-10-25T03:30:00')], 'Europe/Paris', at('2026-10-26T00:00:00Z'));
    assert.equal(naive.invalidCount, 1);
    assert.equal(naive.definitivelyExpired, false);
  });

  it('rejects impossible calendar days, mixed precision and invalid zones', () => {
    const now = at('2026-10-22T12:00:00Z');
    for (const bad of [period('2026-02-30', '2026-03-01'), period('2026-10-20', '2026-10-20T23:00:00Z'), period('2026-10-20T25:00:00Z', '2026-10-20T26:00:00Z')]) {
      assert.equal(assessDatatourismePeriods([bad], 'Europe/Paris', now).definitivelyExpired, false);
    }
    assert.equal(assessDatatourismePeriods([period('2026-10-20', '2026-10-20')], 'not/a-zone', now).definitivelyExpired, false);
  });

  it('retains every source period and withholds a final expiry for unresolved ends', () => {
    const normalized = normalizeDatatourismePeriods([
      period('2026-10-20', '2026-10-20'), period('2026-10-25', '2026-10-25'),
    ], 'Europe/Paris');
    assert.equal(normalized.length, 2);
    assert.equal(definitiveExpirationAt(normalized, 'Europe/Paris'), '2026-10-25T23:00:00.000Z');
    assert.equal(definitiveExpirationAt(normalizeDatatourismePeriods([period('2026-10-25')], 'Europe/Paris'), 'Europe/Paris'), null);
    assert.equal(normalizeDatatourismePeriods([period('2026-10-25', '2026-10-25'), period('2026-10-27', '2026-10-26')], 'Europe/Paris'), null);
    assert.equal(definitiveExpirationAt([{ timePrecision: 'date', startDay: '2026-10-27', endDay: '2026-10-26' }], 'Europe/Paris'), null);
  });

  it('admits only a known single civil day for the initial pilot', () => {
    assert.equal(pilotTemporalIssue([period('2026-10-25', '2026-10-25')], 'Europe/Paris'), null);
    assert.equal(pilotTemporalIssue([{ ...period('2026-10-25', '2026-10-25'), type: 'https://example.test/LimitedPeriod' }], 'Europe/Paris'), null);
    assert.equal(pilotTemporalIssue([period('2026-10-25', '2026-10-26')], 'Europe/Paris'), 'PERIOD_MULTI_DAY_UNVERIFIED');
    assert.equal(pilotTemporalIssue([period('2026-10-25')], 'Europe/Paris'), 'PERIOD_END_MISSING');
    assert.equal(pilotTemporalIssue([period('2026-10-25', '2026-10-25')], 'invalid/zone'), 'TIMEZONE_INVALID');
    assert.equal(pilotTemporalIssue([period('2026-10-25', '2026-10-25'), period('2026-10-30', '2026-10-30')], 'Europe/Paris'), 'PERIOD_COUNT_UNSUPPORTED');
    assert.equal(pilotTemporalIssue([period('2026-10-25T08:00:00Z', '2026-10-25T12:00:00Z')], 'Europe/Paris'), null);
    assert.equal(pilotTemporalIssue([period('2026-10-25T08:00:00Z', '2026-10-25T08:00:00Z')], 'Europe/Paris'), 'PERIOD_TIME_ORDER_INVALID');
  });

  it('preserves a reliable start without inventing an end, and bounds two reliable hours', () => {
    const base = period('2027-05-15', '2027-05-15');
    const startOnly = [{ ...base, startTime: '18:30' }];
    assert.equal(pilotTemporalIssue(startOnly, 'Europe/Paris'), null);
    assert.deepEqual(normalizeDatatourismePeriods(startOnly, 'Europe/Paris'),
      [{ timePrecision: 'date', startDay: '2027-05-15', endDay: '2027-05-15', startTime: '18:30' }]);
    assert.equal(assessDatatourismePeriods(startOnly, 'Europe/Paris', at('2027-05-15T18:00:00Z')).activePrecision, 'date');
    const bounded = [{ ...base, startTime: '18:30:00', endTime: '20:15' }];
    assert.equal(pilotTemporalIssue(bounded, 'Europe/Paris'), null);
    assert.deepEqual(normalizeDatatourismePeriods(bounded, 'Europe/Paris'),
      [{ timePrecision: 'datetime', startAt: '2027-05-15T16:30:00.000Z', endAt: '2027-05-15T18:15:00.000Z' }]);
  });

  it('rejects invalid, contradictory, nonexistent and ambiguous local hours', () => {
    const base = period('2027-05-15', '2027-05-15');
    const cases = [
      [{ ...base, startTime: '25:00' }, 'PERIOD_TIME_UNSUPPORTED'],
      [{ ...base, startTime: '18:30', endTime: '17:00' }, 'PERIOD_TIME_ORDER_INVALID'],
      [{ ...base, endTime: '20:00' }, 'PERIOD_TIME_START_MISSING'],
      [{ ...period('2026-03-29', '2026-03-29'), startTime: '02:30' }, 'PERIOD_TIME_INVALID'],
      [{ ...period('2026-10-25', '2026-10-25'), startTime: '02:30' }, 'PERIOD_TIME_AMBIGUOUS'],
      [{ ...period('2026-10-25', '2026-10-25'), startTime: '01:30', endTime: '02:30' }, 'PERIOD_TIME_AMBIGUOUS'],
    ];
    for (const [candidate, reason] of cases) {
      assert.equal(pilotTemporalIssue([candidate], 'Europe/Paris'), reason);
      assert.equal(normalizeDatatourismePeriods([candidate], 'Europe/Paris'), null);
    }
  });

  it('withholds admission and definitive expiry for recurrence or unknown temporal fields', () => {
    const base = period('2026-10-25', '2026-10-25');
    const cases = [
      [{ ...base, appliesOnDay: ['Sunday'] }, 'PERIOD_RECURRENT_UNSUPPORTED'],
      [{ ...base, weekOfMonth: [4] }, 'PERIOD_RECURRENT_UNSUPPORTED'],
      [{ ...base, type: 'https://example.test/RecurrentPeriod' }, 'PERIOD_RECURRENT_UNSUPPORTED'],
      [{ ...base, type: 'https://example.test/UnknownPeriod' }, 'PERIOD_TYPE_UNSUPPORTED'],
      [{ ...base, openingHours: '08:00' }, 'PERIOD_FIELD_UNSUPPORTED'],
    ];
    for (const [candidate, reason] of cases) {
      assert.equal(pilotTemporalIssue([candidate], 'Europe/Paris'), reason);
      assert.equal(normalizeDatatourismePeriods([candidate], 'Europe/Paris'), null);
      assert.equal(assessDatatourismePeriods([candidate], 'Europe/Paris', at('2026-10-26T12:00:00Z')).definitivelyExpired, false);
    }
  });
});
