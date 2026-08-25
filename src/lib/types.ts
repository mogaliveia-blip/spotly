// src/lib/types.ts
import type { User as FirebaseUser } from 'firebase/auth'

export type UserRole = 'user' | 'owner'

export interface AppUser {
  uid: string
  email: string | null
  displayName: string | null
  role: UserRole
  isApproved: boolean
  photoURL?: string | null
  emailVerified: boolean
}

export type EventPoiCategory = {
  id: string
  label: string
  icon: string
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
  categoryId: string
  averageRating: number
  reviewCount: number
  sponsor?: POISponsor
}

export type POILite = Pick<
  POI,
  | 'id'
  | 'title'
  | 'location'
  | 'categoryId'
  | 'averageRating'
  | 'reviewCount'
  | 'sponsor'
> & { headerPhotoUrl?: string }

export interface Review {
  id: string
  poiId: string
  userId: string
  userName: string
  userDisplayName?: string | null
  displayName?: string | null
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

export type EventStatus = 'draft' | 'published' | 'paused'
export type EventVisibility = 'public' | 'private'

export interface AppEvent {
  id: string
  name: string
  slug: string
  description?: string
  eventCoverUrl?: string
  adminId: string
  status: EventStatus
  visibility: EventVisibility
  privatePreviewEnabled?: boolean
  privateAccessTokenHash?: string
  privateAccessVersion?: number
  privateAccessTokenUpdatedAt?: Date
  privateAccessTokenRevokedAt?: Date
  createdAt: Date
  updatedAt: Date
  startDate?: Date
  endDate?: Date
  timezone?: string
  city?: string
  departmentCode?: string
  departmentName?: string
  region?: string
  country?: string
  defaultMapCenter?: { lat: number; lng: number }
  poiCategories?: EventPoiCategory[]
  branding?: {
    primaryColor?: string
    accentColor?: string
  }
}

export type EventRole = 'admin' | 'editor'

export interface EventPrivateAccessGrant {
  uid: string
  eventId: string
  createdAt: Date
  expiresAt: Date
  accessVersion?: number
  linkId?: string
}

export interface EventPrivateLink {
  id: string
  title?: string
  description?: string
  createdAt: Date
  expiresAt: Date
  revokedAt?: Date
  createdBy?: string
  revokedBy?: string
}

export interface EventMember {
  uid: string
  role: EventRole
  joinedAt: Date
}

export interface EventMemberWithProfile extends EventMember {
  displayName: string | null;
  email: string | null;
  photoURL: string | null;
}
