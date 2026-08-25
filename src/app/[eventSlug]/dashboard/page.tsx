import type { Metadata } from 'next'

import { DashboardClient } from './dashboard-client'
import { fetchEventBySlug, fetchPublicPoiMetadataById, isPubliclyAccessibleEvent, type PublicPoiMetadata } from '@/lib/data'
import { fetchPrivateEventPreviewBySlugAndToken } from '@/lib/private-event-preview.server'

type DashboardPageProps = {
  params: Promise<{ eventSlug: string }>
  searchParams: Promise<{ poi?: string | string[]; privateAccess?: string | string[] }>
}

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://spotly.anavastudio.fr'
const SPOTLY_TITLE = 'Spotly'
const SPOTLY_DESCRIPTION = "Votre guide pour les points d'intérêt de l'événement."
const SPOTLY_IMAGE_URL = new URL('/og-default.png', SITE_URL).toString()
const SPOTLY_IMAGE_WIDTH = 1200
const SPOTLY_IMAGE_HEIGHT = 630
const SPOTLY_IMAGE_TYPE = 'image/png'

function getSingleSearchParam(value: string | string[] | undefined): string | null {
  if (Array.isArray(value)) return value[0] || null
  return value || null
}

function normalizeText(value: string | undefined, fallback: string, maxLength: number): string {
  const normalized = (value || fallback)
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

  if (normalized.length <= maxLength) return normalized
  return `${normalized.slice(0, maxLength - 1).trim()}…`
}

function getPoiImageUrl(poi: PublicPoiMetadata | undefined): string {
  return poi?.headerPhotoUrl || poi?.galleryUrls?.[0]?.url || SPOTLY_IMAGE_URL
}

function getEventImageUrl(event: { eventCoverUrl?: string }): string {
  return event.eventCoverUrl?.trim() || SPOTLY_IMAGE_URL
}

function buildDashboardUrl(eventSlug: string, poiId: string | null): string {
  const url = new URL(`/${eventSlug}/dashboard`, SITE_URL)
  if (poiId) url.searchParams.set('poi', poiId)
  return url.toString()
}

function buildMetadata({
  title,
  description,
  url,
  imageUrl,
}: {
  title: string
  description: string
  url: string
  imageUrl: string
}): Metadata {
  const usesFallbackImage = imageUrl === SPOTLY_IMAGE_URL
  const image = {
    url: imageUrl,
    secureUrl: imageUrl,
    ...(usesFallbackImage
      ? {
          width: SPOTLY_IMAGE_WIDTH,
          height: SPOTLY_IMAGE_HEIGHT,
          type: SPOTLY_IMAGE_TYPE,
        }
      : {}),
    alt: title,
  }

  return {
    title,
    description,
    alternates: {
      canonical: url,
    },
    openGraph: {
      title,
      description,
      url,
      siteName: SPOTLY_TITLE,
      type: 'website',
      images: [image],
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: [image],
    },
  }
}

export async function generateMetadata({
  params,
  searchParams,
}: DashboardPageProps): Promise<Metadata> {
  const { eventSlug } = await params
  const resolvedSearchParams = await searchParams
  const poiId = getSingleSearchParam(resolvedSearchParams.poi)
  const privateAccessToken = getSingleSearchParam(resolvedSearchParams.privateAccess)
  const dashboardUrl = buildDashboardUrl(eventSlug, poiId)
  const eventDashboardUrl = buildDashboardUrl(eventSlug, null)

  try {
    const event = await fetchEventBySlug(eventSlug)
    if (!isPubliclyAccessibleEvent(event)) {
      const privatePreviewEvent = await fetchPrivateEventPreviewBySlugAndToken(eventSlug, privateAccessToken)
      if (privatePreviewEvent) {
        const title = `${privatePreviewEvent.name} | ${SPOTLY_TITLE}`
        const description = normalizeText(
          privatePreviewEvent.description,
          `Découvrez ${privatePreviewEvent.name} sur Spotly.`,
          180
        )

        return buildMetadata({
          title,
          description,
          url: eventDashboardUrl,
          imageUrl: getEventImageUrl(privatePreviewEvent),
        })
      }

      return buildMetadata({
        title: SPOTLY_TITLE,
        description: SPOTLY_DESCRIPTION,
        url: eventDashboardUrl,
        imageUrl: SPOTLY_IMAGE_URL,
      })
    }

    if (!poiId) {
      const title = `${event.name} | ${SPOTLY_TITLE}`
      const description = normalizeText(event.description, `Découvrez ${event.name} sur Spotly.`, 180)
      return buildMetadata({
        title,
        description,
        url: dashboardUrl,
        imageUrl: getEventImageUrl(event),
      })
    }

    const poi = await fetchPublicPoiMetadataById(poiId, event.id)
    if (!poi?.title) {
      const title = `${event.name} | ${SPOTLY_TITLE}`
      return buildMetadata({
        title,
        description: normalizeText(undefined, `Découvrez ${event.name} sur Spotly.`, 180),
        url: dashboardUrl,
        imageUrl: SPOTLY_IMAGE_URL,
      })
    }

    const title = `${poi.title} | ${event.name} | ${SPOTLY_TITLE}`
    const description = normalizeText(poi.description, `Découvrez ${poi.title} pendant ${event.name}.`, 180)

    return buildMetadata({
      title,
      description,
      url: dashboardUrl,
      imageUrl: getPoiImageUrl(poi),
    })
  } catch (error) {
    console.error('[Dashboard Metadata] generation failed', {
      eventSlug,
      poiId,
      errorCode: (error as any)?.code ?? null,
      errorMessage: (error as any)?.message ?? null,
    })

    return buildMetadata({
      title: SPOTLY_TITLE,
      description: SPOTLY_DESCRIPTION,
      url: dashboardUrl,
      imageUrl: SPOTLY_IMAGE_URL,
    })
  }
}

export default function DashboardPage() {
  return <DashboardClient />
}
