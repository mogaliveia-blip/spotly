import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { EventProgramItem, POILite } from './types'
import {
  findProgramPoi, formatProgramDay, groupPublicProgram, publicProgramAvailability,
} from './public-event-program'

function item(id: string, extra: Partial<EventProgramItem> = {}): EventProgramItem {
  return { id, name: id, published: true, sortOrder: 0, ...extra }
}

describe('public Event program', () => {
  it('keeps an Event without published program visually empty and distinguishes read errors', () => {
    assert.deepEqual(groupPublicProgram([]), [])
    assert.deepEqual(groupPublicProgram([item('draft', { published: false })]), [])
    assert.equal(publicProgramAvailability('loading', []), 'loading')
    assert.equal(publicProgramAvailability('success', []), 'empty')
    assert.equal(publicProgramAvailability('success', [item('draft', { published: false })]), 'empty')
    assert.equal(publicProgramAvailability('success', [item('concert')]), 'available')
    assert.equal(publicProgramAvailability('error', [item('concert')]), 'error')
  })

  it('groups known days chronologically and puts undated items last', () => {
    const groups = groupPublicProgram([
      item('undated', { sortOrder: 2 }),
      item('later', { day: '2026-07-15', startTime: '20:00' }),
      item('earlier', { day: '2026-07-14', startTime: '17:00' }),
      item('draft', { day: '2026-07-13', published: false }),
    ])
    assert.deepEqual(groups.map((group) => group.key), ['2026-07-14', '2026-07-15', 'undated'])
    assert.deepEqual(groups.map((group) => group.items.map((entry) => entry.id)), [['earlier'], ['later'], ['undated']])
    assert.equal(groups[2].label, 'Programmation à préciser')
  })

  it('sorts timed items first, then pending times, with sortOrder breaking ties', () => {
    const groups = groupPublicProgram([
      item('pending-2', { day: '2026-07-14', sortOrder: 2 }),
      item('same-2', { day: '2026-07-14', startTime: '18:00', sortOrder: 2 }),
      item('early', { day: '2026-07-14', startTime: '17:00', sortOrder: 9 }),
      item('same-1', { day: '2026-07-14', startTime: '18:00', sortOrder: 1, endTime: '19:00' }),
      item('pending-1', { day: '2026-07-14', sortOrder: 1 }),
    ])
    assert.deepEqual(groups[0].items.map((entry) => entry.id),
      ['early', 'same-1', 'same-2', 'pending-1', 'pending-2'])
  })

  it('formats civil days without shifting them through the browser or Event timezone', () => {
    assert.match(formatProgramDay('2026-03-29'), /29 mars 2026/)
    assert.match(formatProgramDay('2026-10-25'), /25 octobre 2026/)
    assert.match(formatProgramDay('2026-01-01'), /1 janvier 2026/)
  })

  it('resolves only a currently loaded Point, including its latest name', () => {
    const poi = { id: 'scene', title: 'Grande scène' } as POILite
    const renamed = { ...poi, title: 'Scène principale' }
    const concert = item('concert', { poiId: 'scene' })
    assert.equal(findProgramPoi(concert, [poi])?.title, 'Grande scène')
    assert.equal(findProgramPoi(concert, [renamed])?.title, 'Scène principale')
    assert.equal(findProgramPoi(concert, []), undefined)
    assert.equal(findProgramPoi(item('solo'), [poi]), undefined)
  })
})
