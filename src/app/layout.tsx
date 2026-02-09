import type { Metadata } from 'next';
import './globals.css';
import { AuthProvider } from '@/providers/auth-provider';
import { Toaster } from '@/components/ui/toaster';
import { cn } from '@/lib/utils';
import { MapsApiProvider } from '@/providers/maps-api-provider';
import { GeolocationProvider } from '@/providers/geolocation-provider';

export const metadata: Metadata = {
  title: 'Leu Tempo',
  description: 'Votre guide pour les points d\'intérêt de l\'événement.',
  manifest: '/manifest.json',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="fr" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=PT+Sans:ital,wght@0,400;0,700;1,400;1,700&display=swap"
          rel="stylesheet"
        />
        <meta name="theme-color" content="#673AB7" />
        <link rel="apple-touch-icon" href="/icon.svg" />
      </head>
      <body className={cn('font-body antialiased')}>
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
  );
}
