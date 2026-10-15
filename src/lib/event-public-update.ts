import { httpsCallable } from 'firebase/functions'
import { functions } from './firebase'
import type { EventStatus, EventVisibility } from './types'

type PublicDetailsPatch = {
  name?: string
  status?: EventStatus
  visibility?: EventVisibility
  eventCoverUrl?: string | null
}

export type CommercialAuthorizationAction = 'authorize_private' | 'authorize_public' | 'suspend' | 'reactivate'

export async function updateEventCommercialAuthorization(
  eventId: string, action: CommercialAuthorizationAction
): Promise<{ projectionExpected: boolean }> {
  const update = httpsCallable<{ eventId: string; action: CommercialAuthorizationAction }, { updated: boolean; projectionExpected: boolean }>(
    functions, 'updateEventCommercial'
  )
  const result = await update({ eventId, action })
  return { projectionExpected: result.data.projectionExpected }
}

export async function updateEventPublicDetails(eventId: string, patch: PublicDetailsPatch): Promise<void> {
  const update = httpsCallable<PublicDetailsPatch & { eventId: string }, PublicDetailsPatch>(
    functions, 'updateEventPublicDetails'
  )
  await update({ ...patch, eventId })
}
