import type { EventStatus, EventVisibility } from './types'

/** Références partagées du flux autonome ; l'autorité finale reste la Function. */
export const AUTONOMOUS_EVENT_INITIAL_STATUS: EventStatus = 'draft'
export const AUTONOMOUS_EVENT_INITIAL_VISIBILITY: EventVisibility = 'private'

export function normalizeEventSlug(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}
