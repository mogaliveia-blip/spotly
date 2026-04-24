// src/lib/types.ts
import type { User as FirebaseUser } from 'firebase/auth'
import type { LucideIcon } from 'lucide-react'
import {
  Music,
  UtensilsCrossed,
  HeartPulse,
  Bus,
  ShoppingBag,
  Shapes
} from 'lucide-react'

export type UserRole = 'user' | 'editor' | 'admin'

export interface AppUser {
  uid: string
  email: string | null
  displayName: string | null
  role: UserRole
  isApproved: boolean // ✅ Nouveau champ
  photoURL?: string | null
  emailVerified: boolean
}

export type MainCategory =
  | 'programmation'
  | 'nourriture_boissons'
  | 'services_essentiels'
  | 'logistique_mobilite'
  | 'merchandising_partenaires'
  | 'espaces_specifiques'

export type SubCategory =
  | 'concert_headliner'
  | 'concert_scene_secondaire'
  | 'spectacle_rue'
  | 'dj_set'
  | 'food_truck'
  | 'restaurant'
  | 'bar'
  | 'buvette'
  | 'toilettes'
  | 'poste_secours'
  | 'securite'
  | 'point_eau'
  | 'entree_principale'
  | 'parking'
  | 'navette'
  | 'info_point'
  | 'acces_pmr'
  | 'boutique_officielle'
  | 'stand_partenaire'
  | 'sponsor'
  | 'espace_vip'
  | 'espace_enfant'
  | 'zone_detente'
  | 'backstage'

export const categoriesMap: Record<
  MainCategory,
  {
    label: string
    subCategories: Partial<Record<SubCategory, string>>
    icon: LucideIcon
    color: string
    markerColor: string
  }
> = {
  programmation: {
    label: 'Programmation',
    subCategories: {
      concert_headliner: 'Concert Headliner',
      concert_scene_secondaire: 'Concert Scène Secondaire',
      spectacle_rue: 'Spectacle de Rue',
      dj_set: 'DJ Set'
    },
    icon: Music,
    color: 'text-violet-500',
    markerColor: 'text-violet-500'
  },
  nourriture_boissons: {
    label: 'Nourriture',
    subCategories: {
      food_truck: 'Food Truck',
      restaurant: 'Restaurant',
      bar: 'Bar',
      buvette: 'Buvette'
    },
    icon: UtensilsCrossed,
    color: 'text-orange-500',
    markerColor: 'text-orange-500'
  },
  services_essentiels: {
    label: 'Services',
    subCategories: {
      toilettes: 'Toilettes',
      poste_secours: 'Poste de Secours',
      securite: 'Sécurité',
      point_eau: "Point d'eau"
    },
    icon: HeartPulse,
    color: 'text-blue-500',
    markerColor: 'text-blue-500'
  },
  logistique_mobilite: {
    label: 'Mobilité',
    subCategories: {
      entree_principale: 'Entrée Principale',
      parking: 'Parking',
      navette: 'Navette',
      info_point: 'Point Info',
      acces_pmr: 'Accès PMR'
    },
    icon: Bus,
    color: 'text-green-500',
    markerColor: 'text-green-500'
  },
  merchandising_partenaires: {
    label: 'Partenaires',
    subCategories: {
      boutique_officielle: 'Boutique Officielle',
      stand_partenaire: 'Stand Partenaire',
      sponsor: 'Sponsor'
    },
    icon: ShoppingBag,
    color: 'text-pink-500',
    markerColor: 'text-pink-500'
  },
  espaces_specifiques: {
    label: 'Espaces',
    subCategories: {
      espace_vip: 'Espace VIP',
      espace_enfant: 'Espace Enfants',
      zone_detente: 'Zone Détente',
      backstage: 'Backstage'
    },
    icon: Shapes,
    color: 'text-teal-500',
    markerColor: 'text-teal-500'
  }
}

export interface POISponsor {
  enabled: boolean
  level: 'standard' | 'premium' | 'official'
  priority: number
  startDate?: Date
  endDate?: Date
}

export interface POI {
  id: string
  title: string
  description: string
  headerPhotoUrl: string
  galleryUrls: { url: string; path: string }[]
  location: {
    lat: number
    lng: number
  }
  mainCategory: MainCategory
  subCategory: SubCategory
  averageRating: number
  reviewCount: number
  sponsor?: POISponsor
}

export type POILite = Pick<
  POI,
  | 'id'
  | 'title'
  | 'location'
  | 'mainCategory'
  | 'subCategory'
  | 'averageRating'
  | 'reviewCount'
  | 'sponsor'
> & { headerPhotoUrl?: string }

export interface Review {
  id: string
  poiId: string
  userId: string
  userDisplayName: string
  userPhotoURL: string | null
  rating: number
  comment: string
  createdAt: Date
}

export interface AppConfig {
  isLandingPageActive: boolean
  festivalMode?: boolean
  reviewsEnabled?: boolean
}

export type HeroCtaMode = 'auth' | 'external' | 'none' | 'close'

export interface MarketingConfig {
  heroEnabled: boolean
  heroTitle: string
  heroSubtitle: string
  heroImageUrl: string
  heroCtaText: string
  heroCtaMode: HeroCtaMode
  heroCtaLink?: string
}

// --- NEW MULTI-EVENT TYPES ---

export type EventStatus = 'draft' | 'published' | 'archived'

export interface AppEvent {
  id: string
  name: string
  slug: string
  ownerId: string
  status: EventStatus
  createdAt: Date
  updatedAt: Date
  defaultMapCenter?: { lat: number; lng: number }
  branding?: {
    primaryColor?: string
    accentColor?: string
  }
}

export type EventRole = 'owner' | 'admin' | 'editor' | 'viewer'

export interface EventMember {
  uid: string
  role: EventRole
  joinedAt: Date
}
