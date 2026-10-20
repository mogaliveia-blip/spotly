import { isCalendarDay } from './event-time'
import type {
  CreateEventProgramItemInput, EventProgramItemData, UpdateEventProgramItemInput,
} from './types'

export const PROGRAM_NAME_MAX_LENGTH = 120
export const PROGRAM_DESCRIPTION_MAX_LENGTH = 2000
export const PROGRAM_SORT_ORDER_MAX = 1000000

const requiredKeys = ['name', 'published', 'sortOrder'] as const
const optionalKeys = ['description', 'photoPath', 'day', 'startTime', 'endTime', 'poiId'] as const
const allowedKeys = new Set<string>([...requiredKeys, ...optionalKeys])
const createKeys = new Set<string>(['name', 'sortOrder', 'description', 'day', 'startTime', 'endTime', 'poiId'])
const timePattern = /^([01][0-9]|2[0-3]):[0-5][0-9]$/
const photoFilenamePattern = /^[A-Za-z0-9][A-Za-z0-9._-]{0,119}$/

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('PROGRAM_INVALID_PAYLOAD')
  }
  return value as Record<string, unknown>
}

function hasKey(value: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(value, key)
}

function validPoiId(value: string): boolean {
  return value.length > 0 && value.length <= 150 &&
    !value.includes('/') && value !== '.' && value !== '..'
}

function validPhotoPath(value: string, eventId: string, itemId: string): boolean {
  const prefix = `events/${eventId}/program/${itemId}/`
  return value.length <= 500 && value.startsWith(prefix) &&
    photoFilenamePattern.test(value.slice(prefix.length))
}

/** Full document validation, shared by creation and partial updates. */
export function validateEventProgramItem(
  value: unknown, eventId: string, itemId: string
): EventProgramItemData {
  const input = record(value)
  if (requiredKeys.some((key) => !hasKey(input, key)) ||
      Object.keys(input).some((key) => !allowedKeys.has(key)) ||
      typeof input.name !== 'string' || !input.name.trim() ||
      input.name.trim().length > PROGRAM_NAME_MAX_LENGTH ||
      typeof input.published !== 'boolean' ||
      typeof input.sortOrder !== 'number' || !Number.isInteger(input.sortOrder) ||
      Math.abs(input.sortOrder) > PROGRAM_SORT_ORDER_MAX) {
    throw new Error('PROGRAM_INVALID_PAYLOAD')
  }

  for (const key of optionalKeys) {
    if (hasKey(input, key) && typeof input[key] !== 'string') {
      throw new Error('PROGRAM_INVALID_PAYLOAD')
    }
  }

  if ((hasKey(input, 'description') && (input.description as string).length > PROGRAM_DESCRIPTION_MAX_LENGTH) ||
      (hasKey(input, 'photoPath') && !validPhotoPath(input.photoPath as string, eventId, itemId)) ||
      (hasKey(input, 'day') && !isCalendarDay(input.day)) ||
      (hasKey(input, 'startTime') && !timePattern.test(input.startTime as string)) ||
      (hasKey(input, 'endTime') && !timePattern.test(input.endTime as string)) ||
      (hasKey(input, 'poiId') && !validPoiId(input.poiId as string)) ||
      (hasKey(input, 'startTime') && !hasKey(input, 'day')) ||
      (hasKey(input, 'endTime') && !hasKey(input, 'startTime')) ||
      (hasKey(input, 'endTime') && (input.endTime as string) <= (input.startTime as string))) {
    throw new Error('PROGRAM_INVALID_PAYLOAD')
  }

  return { ...input, name: input.name.trim() } as unknown as EventProgramItemData
}

export function createEventProgramItemData(
  value: CreateEventProgramItemInput, eventId: string, itemId: string
): EventProgramItemData {
  const input = record(value)
  if (Object.keys(input).some((key) => !createKeys.has(key))) {
    throw new Error('PROGRAM_INVALID_PAYLOAD')
  }
  return validateEventProgramItem({
    ...input, published: false, sortOrder: hasKey(input, 'sortOrder') ? input.sortOrder : 0,
  }, eventId, itemId)
}

export function updateEventProgramItemData(
  current: EventProgramItemData, value: UpdateEventProgramItemInput,
  eventId: string, itemId: string
): EventProgramItemData {
  const patch = record(value)
  if (!Object.keys(patch).length || Object.keys(patch).some((key) => !allowedKeys.has(key))) {
    throw new Error('PROGRAM_INVALID_PAYLOAD')
  }
  const next: Record<string, unknown> = { ...current }
  for (const [key, field] of Object.entries(patch)) {
    if (field === null && optionalKeys.some((optional) => optional === key)) delete next[key]
    else next[key] = field
  }
  return validateEventProgramItem(next, eventId, itemId)
}
