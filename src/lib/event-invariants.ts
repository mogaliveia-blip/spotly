import type { EventStatus, EventVisibility } from './types'

/** Valeurs du futur flux autonome ; le flux owner actuel n'est pas branché ici. */
export const AUTONOMOUS_EVENT_INITIAL_STATUS: EventStatus = 'draft'
export const AUTONOMOUS_EVENT_INITIAL_VISIBILITY: EventVisibility = 'private'

export function normalizeEventSlug(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

/** Invariant à appliquer par la future Function createEventDraft. */
export function hasValidRequiredEventDateRange(
  startDate: Date | null | undefined,
  endDate: Date | null | undefined
): boolean {
  if (!startDate || !endDate) return false

  const startTime = startDate.getTime()
  const endTime = endDate.getTime()

  return Number.isFinite(startTime) && Number.isFinite(endTime) && endTime >= startTime
}
