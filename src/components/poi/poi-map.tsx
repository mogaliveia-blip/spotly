'use client';

import type { POI } from '@/lib/types';
import { Map, AdvancedMarker, InfoWindow } from '@vis.gl/react-google-maps';
import { useState } from 'react';
import { Button } from '../ui/button';
import { useRouter } from 'next/navigation';
import { MapPin } from 'lucide-react';

interface POIMapProps {
  pois: POI[];
}

const mapStyles = [
  {
    "featureType": "poi.business",
    "stylers": [
      { "visibility": "off" }
    ]
  },
  {
    "featureType": "poi.park",
    "elementType": "labels.text",
    "stylers": [
      { "visibility": "off" }
    ]
  },
   {
    "featureType": "road.local",
    "elementType": "labels",
    "stylers": [
      { "visibility": "off" }
    ]
  },
];

export function POIMap({ pois }: POIMapProps) {
  const router = useRouter();
  const [selectedPoi, setSelectedPoi] = useState<POI | null>(null);

  const defaultCenter = pois.length > 0 ? pois[0].location : { lat: 48.8566, lng: 2.3522 };

  return (
    <Map
      defaultCenter={defaultCenter}
      defaultZoom={13}
      gestureHandling={'greedy'}
      disableDefaultUI={true}
      mapId={process.env.NEXT_PUBLIC_GOOGLE_MAP_ID}
      styles={mapStyles}
    >
      {pois.map((poi) => (
        <AdvancedMarker
          key={poi.id}
          position={poi.location}
          onClick={() => setSelectedPoi(poi)}
        >
          <div className="text-primary hover:scale-110 transition-transform">
            <MapPin size={32} />
          </div>
        </AdvancedMarker>
      ))}

      {selectedPoi && (
        <InfoWindow
          position={selectedPoi.location}
          onCloseClick={() => setSelectedPoi(null)}
          pixelOffset={[0, -40]}
        >
          <div className="p-2 max-w-xs">
            <h3 className="font-bold text-lg mb-1">{selectedPoi.title}</h3>
            <p className="text-sm text-muted-foreground mb-2 line-clamp-2">
              {selectedPoi.description}
            </p>
            <Button size="sm" onClick={() => router.push(`/pois/${selectedPoi.id}`)}>
              View Details
            </Button>
          </div>
        </InfoWindow>
      )}
    </Map>
  );
}
