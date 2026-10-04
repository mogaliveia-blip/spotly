// src/lib/types.ts
import type { User as FirebaseUser } from 'firebase/auth'
import type { EventTime } from './event-time'

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

/**
 * Droit commercial attaché à un Event, indépendant de son statut éditorial et
 * de sa visibilité. Un nouvel Event réel devra toujours recevoir ce résumé via
 * un flux serveur. Il reste optionnel pendant la transition des démos.
 *
 * Ce résumé peut être exposé avec le document Event : aucune donnée de paiement
 * sensible ne doit y être stockée.
 */
export type CommercialOfferCode = 'free_draft' | 'private' | 'public'
export type CommercialEntitlementState = 'active' | 'revoked'

export interface EventCommercial {
  offerCode: CommercialOfferCode
  offerVersion: number
  state: CommercialEntitlementState
  grantedAt: Date
  purchasedAt?: Date
  coveredFrom?: Date
  coveredEndDate?: Date
  eventStartDateAtPurchase?: Date
  eventEndDateAtPurchase?: Date
}

export interface EventCapabilities {
  /** Absent ou différent de true : partenariat désactivé. */
  partnershipEnabled?: boolean
}

interface AppEventBase {
  id: string
  name: string
  slug: string
  description?: string
  eventCoverUrl?: string
  /** UID historique du créateur. Ce champ n'accorde aucune permission. */
  createdBy?: string
  /** Clé d'idempotence serveur des Events créés par le flux autonome. */
  creationRequestId?: string
  /** Autorité héritée conservée jusqu'à la migration vers members comme source. */
  adminId: string
  status: EventStatus
  visibility: EventVisibility
  /** Optionnel uniquement pendant la transition des Events de démonstration. */
  commercial?: EventCommercial
  capabilities?: EventCapabilities
  privatePreviewEnabled?: boolean
  privateAccessTokenHash?: string
  privateAccessVersion?: number
  privateAccessTokenUpdatedAt?: Date
  privateAccessTokenRevokedAt?: Date
  createdAt: Date
  updatedAt: Date
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

export type AppEvent = AppEventBase & EventTime

/** Verrou serveur /freeDraftSlots/{uid}. */
export interface FreeDraftSlot {
  eventId: string
  reservedAt: Date
}

/** Réservation serveur /eventSlugs/{normalizedSlug}. */
export interface EventSlugReservation {
  eventId: string
  reservedAt: Date
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
