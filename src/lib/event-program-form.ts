import { updateEventProgramItemData } from './event-program'
import type { EventProgramItem, UpdateEventProgramItemInput } from './types'

export interface ProgramItemDraft {
  name: string
  description: string
  day: string
  startTime: string
  endTime: string
  poiId: string
  sortOrder: string
}

export function programDraftFromItem(item: EventProgramItem): ProgramItemDraft {
  return {
    name: item.name,
    description: item.description ?? '',
    day: item.day ?? '',
    startTime: item.startTime ?? '',
    endTime: item.endTime ?? '',
    poiId: item.poiId ?? '',
    sortOrder: String(item.sortOrder),
  }
}

/** Only changed form fields are sent; photoPath and publication remain untouched. */
export function programPatchFromDraft(
  item: EventProgramItem, draft: ProgramItemDraft, eventId: string
): UpdateEventProgramItemInput {
  const patch: UpdateEventProgramItemInput = {}
  const name = draft.name.trim()
  if (name !== item.name) patch.name = name

  if (!draft.sortOrder.trim() || !/^-?\d+$/.test(draft.sortOrder.trim())) {
    throw new Error('PROGRAM_INVALID_SORT_ORDER')
  }
  const sortOrder = Number(draft.sortOrder.trim())
  if (sortOrder !== item.sortOrder) patch.sortOrder = sortOrder

  for (const key of ['description', 'day', 'startTime', 'endTime', 'poiId'] as const) {
    const next = draft[key].trim()
    if (next !== (item[key] ?? '')) patch[key] = next || null
  }

  if (Object.keys(patch).length) {
    const { id: _id, ...current } = item
    updateEventProgramItemData(current, patch, eventId, item.id)
  }
  return patch
}

export function programFormError(draft: ProgramItemDraft): string | null {
  if (!draft.name.trim()) return 'Indiquez le nom de l’artiste ou de la prestation.'
  if (draft.startTime && !draft.day) return 'Choisissez un jour avant de renseigner une heure.'
  if (draft.endTime && !draft.startTime) return 'Renseignez l’heure de début avant l’heure de fin.'
  if (draft.startTime && draft.endTime && draft.endTime <= draft.startTime) {
    return 'L’heure de fin doit être postérieure à l’heure de début.'
  }
  return null
}
