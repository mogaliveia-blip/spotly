'use client';

import { APIProvider } from '@vis.gl/react-google-maps';
import { POIMap } from './poi-map';
import type { POI } from '@/lib/types';
import { useEffect, useState } from 'react';

export function POIMapAdapter({
  selectedPoi,
  onSelectPoi,
  pois,
  onCrash
}: {
  selectedPoi: POI | null;
  onSelectPoi: (poi: POI | null) => void;
  pois: POI[];
  onCrash?: () => void;
}) {
  const [canLoadMap, setCanLoadMap] = useState(false);

  useEffect(() => {
    const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;

    // Si clé absente ou volontairement invalide
    if (!apiKey || apiKey === "invalid_key") {
      onCrash?.();
      return;
    }

    setCanLoadMap(true);
  }, [onCrash]);

  if (!canLoadMap) {
    return null;
  }

  return (
    <div className="w-full h-full">
      <APIProvider apiKey={process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY!}>
        <POIMap
          selectedPoi={selectedPoi}
          onSelectPoi={onSelectPoi}
          pois={pois}
        />
      </APIProvider>
    </div>
  );
  
}
