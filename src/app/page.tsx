import type { Metadata } from 'next'

import PortalPage from './portal-client'

const SITE_URL = 'https://uninstantici.com'
const HOME_TITLE = 'Un Instant Ici | Carte interactive pour vos événements'
const HOME_DESCRIPTION = 'Créez et partagez la carte interactive de votre événement : lieux, points d’intérêt, informations, avis et accès public ou privé. Un Instant Ici est une création Anava Studio.'
const HOME_IMAGE_URL = `${SITE_URL}/og-default.png`

export const metadata: Metadata = {
  title: HOME_TITLE,
  description: HOME_DESCRIPTION,
  alternates: {
    canonical: `${SITE_URL}/`,
  },
  openGraph: {
    title: HOME_TITLE,
    description: HOME_DESCRIPTION,
    url: `${SITE_URL}/`,
    siteName: 'Un Instant Ici',
    type: 'website',
    images: [
      {
        url: HOME_IMAGE_URL,
        secureUrl: HOME_IMAGE_URL,
        width: 1200,
        height: 630,
        type: 'image/png',
        alt: HOME_TITLE,
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: HOME_TITLE,
    description: HOME_DESCRIPTION,
    images: [HOME_IMAGE_URL],
  },
}

const spotlyJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'WebApplication',
  name: 'Un Instant Ici',
  url: SITE_URL,
  description: HOME_DESCRIPTION,
  applicationCategory: 'EventApplication',
  creator: {
    '@type': 'Organization',
    name: 'Anava Studio',
    url: 'https://anavastudio.fr',
  },
  publisher: {
    '@type': 'Organization',
    name: 'Anava Studio',
    url: 'https://anavastudio.fr',
  },
}

export default function HomePage() {
  return (
    <>
      <script
        id="spotly-webapplication-jsonld"
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(spotlyJsonLd) }}
      />
      <PortalPage />
    </>
  )
}
