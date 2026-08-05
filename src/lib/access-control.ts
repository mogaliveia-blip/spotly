import type { EventRole, UserRole } from './types'

type MyEventsAccessInput = {
  globalRole: UserRole | null
  eventRole?: EventRole | null
  hasEventMembership?: boolean
}

export function canAccessPlatformAdmin(globalRole: UserRole | null): boolean {
  return globalRole === 'owner'
}

export function canManageEvent(globalRole: UserRole | null, eventRole?: EventRole | null): boolean {
  return canAccessPlatformAdmin(globalRole) || eventRole === 'admin' || eventRole === 'editor'
}

export function canCreateEvent(globalRole: UserRole | null): boolean {
  return canAccessPlatformAdmin(globalRole)
}

export function canAccessMyEvents({
  globalRole,
  eventRole,
  hasEventMembership = false,
}: MyEventsAccessInput): boolean {
  return canAccessPlatformAdmin(globalRole) || eventRole === 'admin' || eventRole === 'editor' || hasEventMembership
}
