import { httpsCallable } from 'firebase/functions'
import { functions } from './firebase'
import type { EventStatus, EventVisibility } from './types'

type PublicDetailsPatch = {
  name?: string
  status?: EventStatus
  visibility?: EventVisibility
  eventCoverUrl?: string | null
}

export async function updateEventPublicDetails(eventId: string, patch: PublicDetailsPatch): Promise<void> {
  const update = httpsCallable<PublicDetailsPatch & { eventId: string }, PublicDetailsPatch>(
    functions, 'updateEventPublicDetails'
  )
  await update({ ...patch, eventId })
}
