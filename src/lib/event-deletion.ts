import { httpsCallable } from 'firebase/functions'

import { functions } from './firebase'

type DeleteEventCompletelyResult = {
  deleted: boolean
  eventId: string
  eventExisted: boolean
  deletedChildCollectionCount: number
}

export async function deleteEventCompletely(eventId: string): Promise<DeleteEventCompletelyResult> {
  const deleteEventCallable = httpsCallable<
    { eventId: string },
    DeleteEventCompletelyResult
  >(
    functions,
    'deleteEventCompletely'
  )

  const result = await deleteEventCallable({ eventId })
  return result.data
}
