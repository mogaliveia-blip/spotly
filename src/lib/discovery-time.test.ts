import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { matchesDiscoveryWhen, discoveryCandidateWindow } from '../../functions/src/discovery-time'
import { instantFromMillis, compareInstants } from '../../functions/src/discovery-search-contract'
import type { DiscoveryResultDto, DiscoveryWhen } from '../../functions/src/discovery-search-contract'
import { calendarDaySegments } from '../../functions/src/event-calendar-segments'

const instant = (iso: string) => instantFromMillis(Date.parse(iso))
const now = instant('2026-09-12T12:00:00Z') // Saturday.
function event(start: string, end: string, timezone = 'Europe/Paris'): DiscoveryResultDto {
  return { id: 'event_test', contentType: 'event', sourceId: 'test', title: 'Festival test', slug: 'festival-test',
    position: { lat: 48.85, lng: 2.35 }, typeId: 'festival', categoryId: 'culture', timePrecision: 'datetime',
    timezone, windowStartAt: instant(start), windowEndAt: instant(end) }
}
function date(day: string, timezone = 'Europe/Paris'): DiscoveryResultDto {
  return { ...event('2026-09-12T00:00:00Z', '2026-09-12T23:00:00Z', timezone), timePrecision: 'date', startDay: day, endDay: day }
}
describe('Discovery temporal policy', () => {
  it('Now is datetime only, inclusive at both exact boundaries', () => {
    const p = event('2026-09-12T12:00:00Z', '2026-09-12T13:00:00Z')
    assert.equal(matchesDiscoveryWhen(p, { kind: 'now' }, now), true)
    assert.equal(matchesDiscoveryWhen(p, { kind: 'now' }, p.windowEndAt), true)
    assert.equal(matchesDiscoveryWhen(p, { kind: 'now' }, { ...p.windowEndAt, nanoseconds: 1 }), false)
    assert.equal(matchesDiscoveryWhen(date('2026-09-12'), { kind: 'now' }, now), false)
  })
  it('Today retains date Events and active/future datetime Events but removes ended ones', () => {
    assert.equal(matchesDiscoveryWhen(date('2026-09-12'), { kind: 'today' }, now), true)
    assert.equal(matchesDiscoveryWhen(event('2026-09-12T11:00:00Z', '2026-09-12T13:00:00Z'), { kind: 'today' }, now), true)
    assert.equal(matchesDiscoveryWhen(event('2026-09-12T18:00:00Z', '2026-09-12T19:00:00Z'), { kind: 'today' }, now), true)
    assert.equal(matchesDiscoveryWhen(event('2026-09-12T08:00:00Z', '2026-09-12T09:00:00Z'), { kind: 'today' }, now), false)
  })
  it('uses each Event timezone rather than the runtime timezone', () => {
    const reference = instant('2026-09-12T23:30:00Z')
    assert.equal(matchesDiscoveryWhen(date('2026-09-13', 'Europe/Paris'), { kind: 'today' }, reference), true)
    assert.equal(matchesDiscoveryWhen(date('2026-09-12', 'America/New_York'), { kind: 'today' }, reference), true)
    assert.equal(matchesDiscoveryWhen(date('2026-09-13', 'America/New_York'), { kind: 'today' }, reference), false)
  })
  it('Saturday includes Saturday and Sunday; weekdays select the next weekend', () => {
    for (const reference of [now, instant('2026-09-10T12:00:00Z')]) {
      assert.equal(matchesDiscoveryWhen(date('2026-09-12'), { kind: 'weekend' }, reference), true)
      assert.equal(matchesDiscoveryWhen(date('2026-09-13'), { kind: 'weekend' }, reference), true)
      assert.equal(matchesDiscoveryWhen(date('2026-09-14'), { kind: 'weekend' }, reference), false)
    }
  })
  it('Sunday excludes Saturday and datetime Events already ended, retaining the rest of Sunday', () => {
    const sunday = instant('2026-09-13T12:00:00Z')
    assert.equal(matchesDiscoveryWhen(date('2026-09-12'), { kind: 'weekend' }, sunday), false)
    assert.equal(matchesDiscoveryWhen(date('2026-09-13'), { kind: 'weekend' }, sunday), true)
    assert.equal(matchesDiscoveryWhen(event('2026-09-13T08:00:00Z', '2026-09-13T09:00:00Z'), { kind: 'weekend' }, sunday), false)
    assert.equal(matchesDiscoveryWhen(event('2026-09-13T12:00:00Z', '2026-09-13T13:00:00Z'), { kind: 'weekend' }, sunday), true)
  })
  it('chosen dates have no future horizon and do not exclude completed historical Events', () => {
    assert.equal(matchesDiscoveryWhen(date('2099-07-01'), { kind: 'date', day: '2099-07-01' }, now), true)
    assert.equal(matchesDiscoveryWhen(event('2006-10-29T02:30:10Z', '2006-10-29T02:30:50Z', 'America/St_Johns'), { kind: 'date', day: '2006-10-29' }, now), true)
  })
  it('rejects a datetime entirely inside the historical hole, including its exclusive endpoint', () => {
    const filter = { kind: 'date' as const, day: '2006-10-29' }
    assert.equal(matchesDiscoveryWhen(event('2006-10-29T02:31:00Z', '2006-10-29T03:29:59Z', 'America/St_Johns'), filter, now), false)
    assert.equal(matchesDiscoveryWhen(event('2006-10-29T03:29:59Z', '2006-10-29T03:30:00Z', 'America/St_Johns'), filter, now), true)
  })
  it('does not invent a datetime intersection with a nonexistent civil date', () => {
    assert.equal(matchesDiscoveryWhen(event('2011-12-29T00:00:00Z', '2011-12-31T23:00:00Z', 'Pacific/Apia'), { kind: 'date', day: '2011-12-30' }, now), false)
  })
  it('keeps candidate envelopes conservative for historical/DST portions and the supported date extremes', () => {
    for (const [day, timezone] of [
      ['2006-10-29', 'America/St_Johns'], ['1969-09-30', 'Pacific/Kwajalein'], ['1972-01-07', 'Africa/Monrovia'],
      ['2026-03-29', 'Europe/Paris'], ['2026-11-01', 'America/New_York'], ['2099-07-01', 'Pacific/Kiritimati'],
    ]) {
      const envelope = discoveryCandidateWindow({ kind: 'date', day }, now)
      for (const segment of calendarDaySegments(day, timezone)) {
        assert.ok(compareInstants(envelope.start, instantFromMillis(segment.start)) <= 0)
        assert.ok(compareInstants(envelope.end, instantFromMillis(segment.endExclusive - 1)) >= 0)
      }
    }
    assert.equal(discoveryCandidateWindow({ kind: 'date', day: '0001-01-01' }, now).start.seconds, -62135596800)
    assert.equal(discoveryCandidateWindow({ kind: 'date', day: '9999-12-31' }, now).end.seconds, 253402300799)
  })
  it('Now preselection retains exact nanoseconds', () => {
    const reference = { seconds: now.seconds, nanoseconds: 123456789 }
    assert.deepEqual(discoveryCandidateWindow({ kind: 'now' }, reference), { start: reference, end: reference })
  })
  it('Today/weekend envelopes include all matching days around UTC/local week boundaries', () => {
    for (const timezone of ['Etc/GMT+12', 'Pacific/Kiritimati', 'America/New_York', 'Europe/Paris']) {
      for (const reference of [instant('2026-09-11T23:59:59Z'), now, instant('2026-09-13T00:00:00Z')]) {
        for (const kind of ['today', 'weekend'] as const) {
          const filter: DiscoveryWhen = { kind }
          const envelope = discoveryCandidateWindow(filter, reference)
          for (let d = 10; d <= 21; d++) {
            const day = `2026-09-${d}`
            if (!matchesDiscoveryWhen(date(day, timezone), filter, reference)) continue
            for (const segment of calendarDaySegments(day, timezone)) {
              assert.ok(compareInstants(envelope.start, instantFromMillis(segment.start)) <= 0)
              assert.ok(compareInstants(envelope.end, instantFromMillis(segment.endExclusive - 1)) >= 0)
            }
          }
        }
      }
    }
  })
})
