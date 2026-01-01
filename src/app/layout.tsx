import type { Metadata } from 'next';
import './globals.css';
import { AuthProvider } from '@/providers/auth-provider';
import { Toaster } from '@/components/ui/toaster';
import { cn } from '@/lib/utils';
import { APIProvider } from '@vis.gl/react-google-maps';

export const metadata: Metadata = {
  title: 'Eventide Guide',
  description: 'Your guide to event points of interest.',
  manifest: '/manifest.json',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
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
        <APIProvider apiKey={process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY!}>
          <AuthProvider>
            {children}
            <Toaster />
          </AuthProvider>
        </APIProvider>
      </body>
    </html>
  );
}
