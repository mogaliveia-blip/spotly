import type {
  CommercialOfferCode,
  EventCapabilities,
  EventCommercial,
  EventVisibility,
} from './types'

export const COMMERCIAL_OFFER_VERSION = 1 as const
export const FREE_DRAFT_POI_LIMIT = 20 as const

type PublicationCapabilities = {
  private: boolean
  public: boolean
}

/**
 * Matrice V1 pure. Elle décrit la politique future sans l'appliquer aux flux
 * actuels de publication, de création Event ou de création POI.
 */
export const COMMERCIAL_PUBLICATION_CAPABILITIES = {
  free_draft: { private: false, public: false },
  private: { private: true, public: false },
  public: { private: true, public: true },
} as const satisfies Record<CommercialOfferCode, PublicationCapabilities>

type CommercialSummary = Pick<EventCommercial, 'offerCode' | 'state'>

export function isCommercialActive(
  commercial: CommercialSummary | null | undefined
): commercial is CommercialSummary & { state: 'active' } {
  return commercial?.state === 'active'
}

/** Un free draft actif n'est jamais déduit de event.status. */
export function isFreeDraftCommercial(
  commercial: CommercialSummary | null | undefined
): boolean {
  return isCommercialActive(commercial) && commercial.offerCode === 'free_draft'
}

export function canCommercialPublishPrivate(
  commercial: CommercialSummary | null | undefined
): boolean {
  return isCommercialActive(commercial) &&
    COMMERCIAL_PUBLICATION_CAPABILITIES[commercial.offerCode].private
}

export function canCommercialPublishPublic(
  commercial: CommercialSummary | null | undefined
): boolean {
  return isCommercialActive(commercial) &&
    COMMERCIAL_PUBLICATION_CAPABILITIES[commercial.offerCode].public
}

export function canCommercialPublish(
  commercial: CommercialSummary | null | undefined,
  visibility: EventVisibility
): boolean {
  return visibility === 'private'
    ? canCommercialPublishPrivate(commercial)
    : canCommercialPublishPublic(commercial)
}

/** Partnership reste désactivé tant que l'owner ne l'a pas explicitement activé. */
export function isPartnershipEnabled(
  capabilities: EventCapabilities | null | undefined
): boolean {
  return capabilities?.partnershipEnabled === true
}
