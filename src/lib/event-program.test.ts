import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  createEventProgramItemData, updateEventProgramItemData, validateEventProgramItem,
} from './event-program'

const eventId = 'festival'
const itemId = 'concert'

describe('Event program V1', () => {
  it('creates a name-only draft with no invented day or time, then publishes it', () => {
    const draft = createEventProgramItemData({ name: '  Groupe A  ' }, eventId, itemId)
    assert.deepEqual(draft, { name: 'Groupe A', published: false, sortOrder: 0 })
    const published = updateEventProgramItemData(draft, { published: true }, eventId, itemId)
    assert.deepEqual(published, { name: 'Groupe A', published: true, sortOrder: 0 })
  })

  it('accepts a day without hours and hours only with a day', () => {
    const dayOnly = createEventProgramItemData({ name: 'Concert', day: '2026-10-25' }, eventId, itemId)
    assert.equal(dayOnly.startTime, undefined)
    const scheduled = updateEventProgramItemData(dayOnly, {
      startTime: '21:00', endTime: '22:30', sortOrder: 2,
    }, eventId, itemId)
    assert.deepEqual([scheduled.day, scheduled.startTime, scheduled.endTime], ['2026-10-25', '21:00', '22:30'])
    const unscheduled = updateEventProgramItemData(scheduled, {
      day: null, startTime: null, endTime: null,
    }, eventId, itemId)
    assert.deepEqual(unscheduled, { name: 'Concert', published: false, sortOrder: 2 })
  })

  it('rejects malformed calendar dates, time strings and inconsistent optional fields', () => {
    const invalid = [
      { day: '2026-02-30' }, { day: '2026-02-29' }, { day: '2026-2-3' },
      { startTime: '21:00' }, { endTime: '22:00' },
      { day: '2026-10-25', endTime: '22:00' },
      { day: '2026-10-25', startTime: '24:00' },
      { day: '2026-10-25', startTime: '21:00', endTime: '21:00' },
      { day: '2026-10-25', startTime: '21:00', endTime: '20:59' },
    ]
    for (const fields of invalid) {
      assert.throws(() => createEventProgramItemData({ name: 'Concert', ...fields }, eventId, itemId), /PROGRAM_INVALID_PAYLOAD/)
    }
  })

  it('rejects whitespace names, unknown fields, invalid ranks and wrong photo paths', () => {
    for (const input of [
      { name: '   ' }, { name: 'x'.repeat(121) }, { name: 'Concert', extra: true },
      { name: 'Concert', published: true }, { name: 'Concert', sortOrder: null },
      { name: 'Concert', sortOrder: 1.5 },
      { name: 'Concert', sortOrder: Number.POSITIVE_INFINITY },
      { name: 'Concert', photoPath: 'events/other/program/concert/photo.jpg' },
      { name: 'Concert', photoPath: 'events/festival/program/other/photo.jpg' },
      { name: 'Concert', poiId: 'other/point' },
    ]) {
      assert.throws(() => createEventProgramItemData(input as any, eventId, itemId), /PROGRAM_INVALID_PAYLOAD/)
    }
    assert.throws(() => createEventProgramItemData({
      name: 'Concert', photoPath: 'events/festival/program/concert/photo.jpg',
    } as any, eventId, itemId), /PROGRAM_INVALID_PAYLOAD/)
    assert.equal(updateEventProgramItemData(
      createEventProgramItemData({ name: 'Concert' }, eventId, itemId),
      { photoPath: 'events/festival/program/concert/photo.jpg' }, eventId, itemId
    ).photoPath, 'events/festival/program/concert/photo.jpg')
  })

  it('validates full replacements and refuses partial changes that leave invalid hours', () => {
    const draft = createEventProgramItemData({ name: 'Concert', day: '2026-10-25', startTime: '21:00' }, eventId, itemId)
    assert.throws(() => updateEventProgramItemData(draft, { day: null }, eventId, itemId), /PROGRAM_INVALID_PAYLOAD/)
    assert.throws(() => updateEventProgramItemData(draft, { startTime: null, endTime: '22:00' }, eventId, itemId), /PROGRAM_INVALID_PAYLOAD/)
    assert.throws(() => validateEventProgramItem({ ...draft, hidden: true }, eventId, itemId), /PROGRAM_INVALID_PAYLOAD/)
  })
})
