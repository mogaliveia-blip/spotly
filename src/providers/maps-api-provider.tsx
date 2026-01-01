'use client';

import { APIProvider } from '@vis.gl/react-google-maps';
import { mapsConfig } from '@/lib/firebase-config';

export function MapsApiProvider({ children }: { children: React.ReactNode }) {
  return (
    <APIProvider apiKey={mapsConfig.apiKey}>
      {children}
    </APIProvider>
  );
}
