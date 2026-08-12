import type { Metadata } from 'next'

import { DashboardClient } from './dashboard-client'
import { fetchEventBySlug, fetchPublicPoiMetadataById, type PublicPoiMetadata } from '@/lib/data'

type DashboardPageProps = {
  params: Promise<{ eventSlug: string }>
  searchParams: Promise<{ poi?: string | string[] }>
}

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://spotly.anavastudio.fr'
const SPOTLY_TITLE = 'Spotly'
const SPOTLY_DESCRIPTION = "Votre guide pour les points d'intérêt de l'événement."
const SPOTLY_IMAGE_URL = new URL('/icon.svg', SITE_URL).toString()

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
      images: [
        {
          url: imageUrl,
          alt: title,
        },
      ],
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: [imageUrl],
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
  const dashboardUrl = buildDashboardUrl(eventSlug, poiId)

  try {
    const event = await fetchEventBySlug(eventSlug)
    if (!event || event.status !== 'published') {
      return buildMetadata({
        title: SPOTLY_TITLE,
        description: SPOTLY_DESCRIPTION,
        url: dashboardUrl,
        imageUrl: SPOTLY_IMAGE_URL,
      })
    }

    if (!poiId) {
      const title = `${event.name} | ${SPOTLY_TITLE}`
      return buildMetadata({
        title,
        description: normalizeText(undefined, `Découvrez ${event.name} sur Spotly.`, 180),
        url: dashboardUrl,
        imageUrl: SPOTLY_IMAGE_URL,
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
