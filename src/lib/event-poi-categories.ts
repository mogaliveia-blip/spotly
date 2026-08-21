import type { LucideIcon } from 'lucide-react'
import {
  Activity,
  Bed,
  Bus,
  Camera,
  Car,
  Droplets,
  HeartPulse,
  Info,
  MapPin,
  Music,
  ShoppingBag,
  Star,
  Tent,
  Utensils
} from 'lucide-react'

export const MAX_EVENT_POI_CATEGORIES = 20
export const EVENT_POI_CATEGORY_LABEL_MAX_LENGTH = 40

export type EventPoiCategoryIconKey =
  | 'map-pin'
  | 'music'
  | 'utensils'
  | 'car'
  | 'info'
  | 'droplets'
  | 'heart-pulse'
  | 'bed'
  | 'bus'
  | 'activity'
  | 'shopping-bag'
  | 'tent'
  | 'camera'
  | 'star'

export const categoryIconMap: Record<EventPoiCategoryIconKey, LucideIcon> = {
  'map-pin': MapPin,
  music: Music,
  utensils: Utensils,
  car: Car,
  info: Info,
  droplets: Droplets,
  'heart-pulse': HeartPulse,
  bed: Bed,
  bus: Bus,
  activity: Activity,
  'shopping-bag': ShoppingBag,
  tent: Tent,
  camera: Camera,
  star: Star
}

export const supportedCategoryIcons: Array<{
  key: EventPoiCategoryIconKey
  label: string
}> = [
  { key: 'map-pin', label: 'Lieu' },
  { key: 'music', label: 'Musique' },
  { key: 'utensils', label: 'Restauration' },
  { key: 'car', label: 'Parking' },
  { key: 'info', label: 'Informations' },
  { key: 'droplets', label: 'Eau' },
  { key: 'heart-pulse', label: 'Secours' },
  { key: 'bed', label: 'Hébergement' },
  { key: 'bus', label: 'Transport' },
  { key: 'activity', label: 'Activité' },
  { key: 'shopping-bag', label: 'Boutique' },
  { key: 'tent', label: 'Camping' },
  { key: 'camera', label: 'Visite' },
  { key: 'star', label: 'Favori' }
]

export const spotlyPoiCategorySuggestions: Array<{
  label: string
  icon: EventPoiCategoryIconKey
}> = [
  { label: 'Programmation', icon: 'music' },
  { label: 'Restauration', icon: 'utensils' },
  { label: 'Bar', icon: 'utensils' },
  { label: 'Parking', icon: 'car' },
  { label: 'Informations', icon: 'info' },
  { label: "Point d'eau", icon: 'droplets' },
  { label: 'Secours', icon: 'heart-pulse' },
  { label: 'Hébergement', icon: 'bed' },
  { label: 'Transport', icon: 'bus' },
  { label: 'Activité', icon: 'activity' }
]

export function resolveCategoryIcon(icon: string | undefined): LucideIcon {
  return categoryIconMap[(icon || 'map-pin') as EventPoiCategoryIconKey] || MapPin
}

export function normalizeCategoryLabel(label: string): string {
  return label.trim().replace(/\s+/g, ' ')
}

export function getComparableCategoryLabel(label: string): string {
  return normalizeCategoryLabel(label).toLocaleLowerCase('fr-FR')
}
