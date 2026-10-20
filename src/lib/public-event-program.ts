import type { EventProgramItem, POILite } from './types'

export type PublicProgramStatus = 'loading' | 'success' | 'error'
export type PublicProgramAvailability = 'loading' | 'empty' | 'available' | 'error'

export interface PublicProgramGroup {
  key: string
  label: string
  items: EventProgramItem[]
}

const UNDATED_KEY = 'undated'

/** Program days are local civil dates, not instants to convert into the browser timezone. */
export function formatProgramDay(day: string): string {
  const [year, month, date] = day.split('-').map(Number)
  return new Intl.DateTimeFormat('fr-FR', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC',
  }).format(new Date(Date.UTC(year, month - 1, date, 12)))
}

function compareItems(a: EventProgramItem, b: EventProgramItem): number {
  if (!!a.startTime !== !!b.startTime) return a.startTime ? -1 : 1
  return (a.startTime ?? '').localeCompare(b.startTime ?? '') ||
    a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, 'fr') || a.id.localeCompare(b.id)
}

export function groupPublicProgram(items: EventProgramItem[]): PublicProgramGroup[] {
  const published = items.filter((item) => item.published === true)
  const days = [...new Set(published.flatMap((item) => item.day ? [item.day] : []))].sort()
  const groups = days.map((day) => ({
    key: day,
    label: formatProgramDay(day),
    items: published.filter((item) => item.day === day).sort(compareItems),
  }))
  const undated = published.filter((item) => !item.day).sort(compareItems)
  if (undated.length) groups.push({ key: UNDATED_KEY, label: 'Programmation à préciser', items: undated })
  return groups
}

export function publicProgramAvailability(
  status: PublicProgramStatus, items: EventProgramItem[]
): PublicProgramAvailability {
  if (status === 'loading') return 'loading'
  if (status === 'error') return 'error'
  return items.some((item) => item.published === true) ? 'available' : 'empty'
}

export function findProgramPoi(item: EventProgramItem, pois: POILite[]): POILite | undefined {
  return item.poiId ? pois.find((poi) => poi.id === item.poiId) : undefined
}
