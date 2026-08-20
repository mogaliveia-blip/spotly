import type { Metadata } from 'next'
import { headers } from 'next/headers'

import { DashboardClient } from './dashboard-client'
import { fetchEventBySlug, fetchPublicPoiMetadataById, isPubliclyAccessibleEvent, type PublicPoiMetadata } from '@/lib/data'

type DashboardPageProps = {
  params: Promise<{ eventSlug: string }>
  searchParams: Promise<{ poi?: string | string[] }>
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

function getPoiImageUrl(poi: PublicPoiMetadata | undefined, useCrawlerSafeFallback: boolean): string {
  if (useCrawlerSafeFallback) return SPOTLY_IMAGE_URL
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
  const userAgent = (await headers()).get('user-agent') || ''
  const useCrawlerSafeImage = /WhatsApp/i.test(userAgent)
  const poiId = getSingleSearchParam(resolvedSearchParams.poi)
  const dashboardUrl = buildDashboardUrl(eventSlug, poiId)

  try {
    const event = await fetchEventBySlug(eventSlug)
    if (!isPubliclyAccessibleEvent(event)) {
      return buildMetadata({
        title: SPOTLY_TITLE,
        description: SPOTLY_DESCRIPTION,
        url: dashboardUrl,
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
      imageUrl: getPoiImageUrl(poi, useCrawlerSafeImage),
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
