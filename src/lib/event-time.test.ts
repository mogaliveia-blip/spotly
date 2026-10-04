import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  calendarDayInTimezone, formatEventDateRange, getEventCalendarRange, getEventTimeState,
  getEventTiming, getEventMonitorTiming, isCalendarDay, isCalendarRange, isEventNow, isIanaTimezone, matchesEventPeriod,
} from './event-time'
import type { CalendarEventTime, ExactEventTime } from './event-time'

function days(startDay = '2026-10-10', endDay = '2026-10-12', timezone = 'Europe/Paris'): CalendarEventTime {
  return { timePrecision: 'date', startDay, endDay, timezone }
}

function exact(timezone = 'Europe/Paris'): ExactEventTime {
  return {
    timePrecision: 'datetime', timezone,
    startDate: new Date('2026-10-10T16:00:00Z'),
    endDate: new Date('2026-10-10T18:00:00Z'),
  }
}

describe('calendar Event contract', () => {
  it('accepts one inclusive day and multiple days, rejecting inverted or impossible dates', () => {
    assert.equal(getEventTimeState(days('2026-10-10', '2026-10-10')), 'date')
    assert.equal(getEventTimeState(days()), 'date')
    assert.equal(isCalendarRange('2026-10-12', '2026-10-10'), false)
    for (const invalid of ['2026-02-29', '2026-02-30', '1900-02-29', '2026-04-31', '2026-13-01', '2026-00-01', '2026-10-00', '2026-1-10', '0000-01-01']) {
      assert.equal(isCalendarDay(invalid), false, invalid)
    }
    assert.equal(isCalendarDay('2000-02-29'), true)
    assert.equal(isCalendarDay('2028-02-29'), true)
  })

  it('validates named timezones and refuses invalid zones and numeric offsets', () => {
    for (const zone of ['Europe/Paris', 'America/New_York', 'Asia/Tokyo', 'UTC']) assert.equal(isIanaTimezone(zone), true)
    for (const zone of ['Europe/Invalid', 'not-a-zone', '', '+02:00', ' Europe/Paris']) assert.equal(isIanaTimezone(zone), false)
  })

  it('preserves calendar days and display across browser timezone equivalents', () => {
    const previous = process.env.TZ
    try {
      for (const timezone of ['Europe/Paris', 'America/New_York', 'Asia/Tokyo', 'Pacific/Honolulu']) {
        process.env.TZ = timezone
        const original = days('2026-10-10', '2026-10-10')
        const reloaded = JSON.parse(JSON.stringify(original))
        const edited = { ...reloaded, endDay: '2026-10-12' }
        assert.deepEqual(getEventCalendarRange(reloaded), { startDay: '2026-10-10', endDay: '2026-10-10' })
        assert.equal(formatEventDateRange(reloaded), '10/10/2026')
        assert.equal(formatEventDateRange(edited), '10/10/2026 – 12/10/2026')
        assert.equal(edited.startDay, original.startDay)
      }
    } finally {
      if (previous === undefined) delete process.env.TZ
      else process.env.TZ = previous
    }
  })

  it('rejects competing fields, incomplete modes, invalid precision and invalid timezone', () => {
    assert.equal(getEventTimeState({ ...days(), startDate: new Date() }), 'invalid')
    assert.equal(getEventTimeState({ ...exact(), startDay: '2026-10-10' }), 'invalid')
    assert.equal(getEventTimeState({ ...days(), endDay: undefined }), 'invalid')
    assert.equal(getEventTimeState({ ...days(), timezone: 'invalid' }), 'invalid')
    assert.equal(getEventTimeState({ ...days(), timePrecision: 'hour' }), 'invalid')
    assert.equal(getEventTimeState({ ...exact(), endDate: new Date('2026-10-09') }), 'invalid')
    assert.equal(getEventTimeState({ ...exact(), startDate: new Date('invalid') }), 'invalid')
  })
})

describe('Event periods in the content timezone', () => {
  it('uses interval overlap, including the first and last calendar day', () => {
    for (const day of ['2026-10-10', '2026-10-11', '2026-10-12']) {
      assert.equal(matchesEventPeriod(days(), { kind: 'date', day }, new Date('2026-10-01')), true)
    }
    for (const day of ['2026-10-09', '2026-10-13', '2026-02-30']) {
      assert.equal(matchesEventPeriod(days(), { kind: 'date', day }, new Date('2026-10-01')), false)
    }
    assert.equal(isEventNow(days(), new Date('2026-10-11')), false)
  })

  it('computes today in the Event timezone, independent of the browser', () => {
    const now = new Date('2026-10-10T01:00:00Z')
    assert.equal(matchesEventPeriod(days('2026-10-10', '2026-10-10'), { kind: 'today' }, now), true)
    assert.equal(matchesEventPeriod(days('2026-10-10', '2026-10-10', 'America/New_York'), { kind: 'today' }, now), false)
    assert.equal(calendarDayInTimezone(now, 'America/New_York'), '2026-10-09')
  })

  it('uses the upcoming weekend on weekdays, and the current weekend on Saturday/Sunday', () => {
    for (const now of ['2026-10-05T12:00:00Z', '2026-10-09T12:00:00Z', '2026-10-10T12:00:00Z', '2026-10-11T12:00:00Z']) {
      assert.equal(matchesEventPeriod(days('2026-10-10', '2026-10-11'), { kind: 'weekend' }, new Date(now)), true)
      assert.equal(matchesEventPeriod(days('2026-10-17', '2026-10-18'), { kind: 'weekend' }, new Date(now)), false)
    }
    assert.equal(matchesEventPeriod(days('2026-10-17', '2026-10-18'), { kind: 'weekend' }, new Date('2026-10-12T12:00:00Z')), true)
    assert.equal(matchesEventPeriod(days('2027-01-02', '2027-01-03'), { kind: 'weekend' }, new Date('2026-12-31T12:00:00Z')), true)
  })

  it('keeps calendar days stable across DST changes', () => {
    assert.equal(matchesEventPeriod(days('2026-03-29', '2026-03-29'), { kind: 'today' }, new Date('2026-03-29T21:59:59Z')), true)
    assert.equal(matchesEventPeriod(days('2026-03-29', '2026-03-29'), { kind: 'today' }, new Date('2026-03-29T22:00:00Z')), false)
    assert.equal(matchesEventPeriod(days('2026-11-01', '2026-11-01', 'America/New_York'), { kind: 'today' }, new Date('2026-11-02T04:59:59Z')), true)
    assert.equal(matchesEventPeriod(days('2026-11-01', '2026-11-01', 'America/New_York'), { kind: 'today' }, new Date('2026-11-02T05:00:00Z')), false)
  })

  it('uses actual instants for Now including exact endpoints, without a second timezone shift', () => {
    for (const timezone of ['Europe/Paris', 'America/New_York']) {
      const event = exact(timezone)
      assert.equal(isEventNow(event, event.startDate), true)
      assert.equal(isEventNow(event, event.endDate), true)
      assert.equal(isEventNow(event, new Date(event.startDate.getTime() - 1)), false)
      assert.equal(isEventNow(event, new Date(event.endDate.getTime() + 1)), false)
      assert.equal(matchesEventPeriod(event, { kind: 'now' }, new Date('2026-10-10T17:00:00Z')), true)
    }
  })

  it('handles exact intervals crossing midnight and DST, including repeated local hours', () => {
    const event = {
      timePrecision: 'datetime', timezone: 'Europe/Paris',
      startDate: new Date('2026-10-24T22:30:00Z'), endDate: new Date('2026-10-25T01:30:00Z'),
    }
    assert.equal(matchesEventPeriod(event, { kind: 'date', day: '2026-10-25' }, new Date()), true)
    assert.equal(matchesEventPeriod(event, { kind: 'date', day: '2026-10-24' }, new Date()), false)
    assert.equal(isEventNow(event, new Date('2026-10-25T00:30:00Z')), true)
    assert.equal(isEventNow(event, new Date('2026-10-25T01:30:00Z')), true)
    assert.match(formatEventDateRange(event), /25\/10\/2026/)
  })
})

describe('monitor Event classification', () => {
  const now = new Date('2026-10-10T14:00:00+02:00') // 14:00 in Europe/Paris.
  const hours = (startHour: string, endHour: string): ExactEventTime => ({
    timePrecision: 'datetime', timezone: 'Europe/Paris',
    startDate: new Date(`2026-10-10T${startHour}:00:00+02:00`),
    endDate: new Date(`2026-10-10T${endHour}:00:00+02:00`),
  })

  for (const [start, end, expected] of [
    ['18', '20', 'upcoming'], ['10', '12', 'ended'], ['13', '15', 'ongoing'],
  ] as const) {
    it(`classifies ${start}:00–${end}:00 Paris as ${expected} at 14:00 the same day`, () => {
      assert.equal(getEventMonitorTiming(hours(start, end), now), expected)
    })
  }

  it('includes both exact endpoints and classifies immediately before/after them', () => {
    const event = hours('13', '15')
    assert.equal(getEventMonitorTiming(event, event.startDate), 'ongoing')
    assert.equal(getEventMonitorTiming(event, event.endDate), 'ongoing')
    assert.equal(getEventMonitorTiming(event, new Date(event.startDate.getTime() - 1)), 'upcoming')
    assert.equal(getEventMonitorTiming(event, new Date(event.endDate.getTime() + 1)), 'ended')
    assert.equal(getEventMonitorTiming({ ...event, endDate: event.startDate }, event.startDate), 'ongoing')
  })

  it('classifies inclusive calendar days in the Event timezone without inventing hours', () => {
    const event = days('2026-10-10', '2026-10-10')
    assert.equal(getEventMonitorTiming(event, new Date('2026-10-09T21:59:59Z')), 'upcoming')
    assert.equal(getEventMonitorTiming(event, new Date('2026-10-09T22:00:00Z')), 'ongoing')
    assert.equal(getEventMonitorTiming(event, now), 'ongoing')
    assert.equal(getEventMonitorTiming(event, new Date('2026-10-10T21:59:59Z')), 'ongoing')
    assert.equal(getEventMonitorTiming(event, new Date('2026-10-10T22:00:00Z')), 'ended')
    const nearMidnight = new Date('2026-10-10T01:00:00Z')
    assert.equal(getEventMonitorTiming(event, nearMidnight), 'ongoing')
    assert.equal(getEventMonitorTiming({ ...event, timezone: 'America/New_York' }, nearMidnight), 'upcoming')
    assert.equal(isEventNow(event, now), false)
    assert.deepEqual(event, days('2026-10-10', '2026-10-10'))
  })

  it('preserves calendar Today grouping and strict Now for hourly Events', () => {
    for (const event of [hours('18', '20'), hours('10', '12')]) {
      assert.equal(getEventTiming(event, now), 'ongoing') // Portal group "Today", not monitor state.
      assert.equal(matchesEventPeriod(event, { kind: 'today' }, now), true)
      assert.equal(isEventNow(event, now), false)
    }
  })

  it('leaves historical precision unknown regardless of Timestamp hours', () => {
    for (const hour of ['00', '12', '18']) {
      assert.equal(getEventMonitorTiming({
        startDate: new Date(`2026-10-10T${hour}:00:00Z`),
        endDate: new Date('2026-10-12T18:00:00Z'), timezone: 'Europe/Paris',
      }, now), 'unknown')
    }
  })

  it('does not classify invalid temporal states or an invalid current instant', () => {
    const event = hours('13', '15')
    assert.equal(getEventMonitorTiming({ ...event, endDate: undefined }, now), 'unknown')
    assert.equal(getEventMonitorTiming({ ...event, timezone: 'Invalid/Zone' }, now), 'unknown')
    assert.equal(getEventMonitorTiming({ ...event, startDay: '2026-10-10' }, now), 'unknown')
    assert.equal(getEventMonitorTiming(days('2026-10-12', '2026-10-10'), now), 'unknown')
    assert.equal(getEventMonitorTiming(event, new Date('invalid')), 'unknown')
  })
})

describe('historical Events', () => {
  it('never infers precision from old midnight, noon or evening timestamps', () => {
    for (const hour of ['00', '12', '18']) {
      const event = { startDate: new Date(`2026-10-10T${hour}:00:00Z`), endDate: new Date('2026-10-12T18:00:00Z'), timezone: 'Europe/Paris' }
      assert.equal(getEventTimeState(event), 'legacy')
      assert.equal(isEventNow(event, new Date('2026-10-11T12:00:00Z')), false)
      assert.equal(matchesEventPeriod(event, { kind: 'today' }, new Date('2026-10-11T12:00:00Z')), false)
      assert.equal(formatEventDateRange(event), 'Dates à vérifier')
      assert.equal(getEventTiming(event, new Date()), 'unknown')
    }
  })
})
