import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { calendarDaySegments } from '../../functions/src/event-calendar-segments'

const iso = (day: string, zone: string) => calendarDaySegments(day, zone).map((s) =>
  [new Date(s.start).toISOString(), new Date(s.endExclusive).toISOString()])
describe('Exact UTC portions of civil days', () => {
  it('preserves both St. John’s portions and the hole belonging to the previous day', () => {
    assert.deepEqual(iso('2006-10-29', 'America/St_Johns'), [
      ['2006-10-29T02:30:00.000Z', '2006-10-29T02:31:00.000Z'],
      ['2006-10-29T03:30:00.000Z', '2006-10-30T03:30:00.000Z'],
    ])
  })
  it('returns no segments for a skipped day or invalid calendar input', () => {
    assert.deepEqual(calendarDaySegments('2011-12-30', 'Pacific/Apia'), [])
    assert.deepEqual(calendarDaySegments('2026-02-30', 'Europe/Paris'), [])
  })
  it('preserves a 47-hour repeated day and a historical seconds-based offset', () => {
    assert.deepEqual(iso('1969-09-30', 'Pacific/Kwajalein'), [['1969-09-29T13:00:00.000Z', '1969-10-01T12:00:00.000Z']])
    assert.deepEqual(iso('1972-01-07', 'Africa/Monrovia'), [['1972-01-07T00:44:30.000Z', '1972-01-08T00:00:00.000Z']])
  })
  for (const [day, zone, hours] of [
    ['2026-03-29', 'Europe/Paris', 23], ['2026-10-25', 'Europe/Paris', 25],
    ['2026-03-08', 'America/New_York', 23], ['2026-11-01', 'America/New_York', 25],
  ] as const) it(`respects DST ${day} ${zone}`, () => {
    const segments = calendarDaySegments(day, zone)
    assert.equal(segments.length, 1)
    assert.equal(segments[0].endExclusive - segments[0].start, hours * 3_600_000)
  })
})
