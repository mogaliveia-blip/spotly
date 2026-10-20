import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { programDraftFromItem, programFormError, programPatchFromDraft } from './event-program-form'
import type { EventProgramItem } from './types'

const eventId = 'festival'
const item: EventProgramItem = {
  id: 'concert', name: 'Concert', published: false, sortOrder: 0,
  photoPath: 'events/festival/program/concert/photo.jpg',
  description: 'Présentation', day: '2026-10-20', startTime: '18:00', endTime: '19:00',
  poiId: 'scene',
}

describe('Event program organizer form', () => {
  it('sends only changed fields and preserves publication, photo and unchanged details', () => {
    const draft = programDraftFromItem(item)
    draft.name = '  Nouveau concert  '
    assert.deepEqual(programPatchFromDraft(item, draft, eventId), { name: 'Nouveau concert' })
    assert.equal(item.photoPath, 'events/festival/program/concert/photo.jpg')
  })

  it('clears optional fields explicitly without inventing day or hours', () => {
    const draft = programDraftFromItem(item)
    draft.day = ''
    draft.startTime = ''
    draft.endTime = ''
    draft.poiId = ''
    assert.deepEqual(programPatchFromDraft(item, draft, eventId), {
      day: null, startTime: null, endTime: null, poiId: null,
    })
  })

  it('keeps a removed POI association when editing another field', () => {
    const draft = programDraftFromItem(item)
    draft.description = 'Nouvelle description'
    assert.deepEqual(programPatchFromDraft(item, draft, eventId), { description: 'Nouvelle description' })
  })

  it('accepts name-only items and optional fields remaining empty', () => {
    const bare: EventProgramItem = { id: 'new', name: 'Artiste', published: false, sortOrder: 0 }
    const draft = programDraftFromItem(bare)
    assert.equal(programFormError(draft), null)
    assert.deepEqual(programPatchFromDraft(bare, draft, eventId), {})
    draft.name = '  Artiste  '
    assert.deepEqual(programPatchFromDraft(bare, draft, eventId), {})
  })

  it('explains inconsistent hours and rejects invalid order and date formats', () => {
    const draft = programDraftFromItem(item)
    draft.day = ''
    assert.match(programFormError(draft) ?? '', /jour/)
    draft.day = '2026-10-20'
    draft.startTime = ''
    assert.match(programFormError(draft) ?? '', /début/)
    draft.startTime = '20:00'
    assert.match(programFormError(draft) ?? '', /postérieure/)
    draft.endTime = '21:00'
    draft.sortOrder = '1.5'
    assert.throws(() => programPatchFromDraft(item, draft, eventId), /PROGRAM_INVALID_SORT_ORDER/)
    draft.sortOrder = '1'
    draft.day = '2026-02-30'
    assert.throws(() => programPatchFromDraft(item, draft, eventId), /PROGRAM_INVALID_PAYLOAD/)
  })
})
