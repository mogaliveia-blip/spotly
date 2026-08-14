import type { AppEvent, POI, POILite } from './types'

type ShareableEvent = Pick<AppEvent, 'slug' | 'status' | 'visibility'>
type ShareablePoi = Pick<POI | POILite, 'id'>

export function canSharePoi(event: Pick<AppEvent, 'status' | 'visibility'> | null | undefined): boolean {
  return event?.status === 'published' && event.visibility === 'public'
}

export function buildPoiShareUrl(event: ShareableEvent, poi: ShareablePoi, origin: string): string {
  const url = new URL(`/${event.slug}/dashboard`, origin)
  url.searchParams.set('poi', poi.id)
  return url.toString()
}
