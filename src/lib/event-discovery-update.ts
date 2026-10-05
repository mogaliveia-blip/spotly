import { httpsCallable } from 'firebase/functions'
import { functions } from './firebase'
import type { EventDiscoverySettingsPatch } from './event-discovery'

export async function updateEventDiscoverySettings(
  eventId: string, settings: EventDiscoverySettingsPatch
): Promise<EventDiscoverySettingsPatch> {
  const update = httpsCallable<EventDiscoverySettingsPatch & { eventId: string }, EventDiscoverySettingsPatch>(
    functions, 'updateEventDiscoverySettings'
  )
  return (await update({ ...settings, eventId })).data
}
