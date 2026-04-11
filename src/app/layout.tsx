import type { Metadata } from 'next'
import Script from 'next/script'
import './globals.css'

import { AuthProvider } from '@/providers/auth-provider'
import { Toaster } from '@/components/ui/toaster'
import { cn } from '@/lib/utils'
import { MapsApiProvider } from '@/providers/maps-api-provider'
import { GeolocationProvider } from '@/providers/geolocation-provider'

export const metadata: Metadata = {
  title: 'Leu Tempo',
  description: "Votre guide pour les points d'intérêt de l'événement.",
  manifest: '/manifest.json',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  const GA_ID = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID

  return (
    <html lang="fr" className="h-full" suppressHydrationWarning>
      <head>
        {/* Google Fonts */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin="anonymous"
        />
        <link
          href="https://fonts.googleapis.com/css2?family=PT+Sans:ital,wght@0,400;0,700;1,400;1,700&display=swap"
          rel="stylesheet"
        />

        {/* PWA */}
        <meta name="theme-color" content="#673AB7" />
        <link rel="apple-touch-icon" href="/icon.svg" />

        {/* Google Analytics */}
        {GA_ID && (
          <>
            <Script
              src={`https://www.googletagmanager.com/gtag/js?id=${GA_ID}`}
              strategy="afterInteractive"
            />
            <Script id="ga4-init" strategy="afterInteractive">
              {`
                window.dataLayer = window.dataLayer || [];
                function gtag(){dataLayer.push(arguments);}
                gtag('js', new Date());
                gtag('config', '${GA_ID}', {
                  anonymize_ip: true,
                  send_page_view: true
                });
              `}
            </Script>
          </>
        )}
      </head>

      <body
        className={cn(
          'h-full w-full font-body antialiased bg-background'
        )}
      >
        <MapsApiProvider>
          <AuthProvider>
            <GeolocationProvider>
              {children}
              <Toaster />
            </GeolocationProvider>
          </AuthProvider>
        </MapsApiProvider>
      </body>
    </html>
  )
}