import type { EventRole, UserRole } from './types'

type MyEventsAccessInput = {
  globalRole: UserRole | null
  isApproved?: boolean
  eventRole?: EventRole | null
  hasEventMembership?: boolean
}

export function canAccessPlatformAdmin(globalRole: UserRole | null): boolean {
  return globalRole === 'owner'
}

export function canManageEvent(globalRole: UserRole | null, eventRole?: EventRole | null): boolean {
  return canAccessPlatformAdmin(globalRole) || eventRole === 'admin' || eventRole === 'editor'
}

export function canAccessMyEvents({
  globalRole,
  isApproved = false,
  eventRole,
  hasEventMembership = false,
}: MyEventsAccessInput): boolean {
  return canAccessPlatformAdmin(globalRole) || isApproved || eventRole === 'admin' || eventRole === 'editor' || hasEventMembership
}
