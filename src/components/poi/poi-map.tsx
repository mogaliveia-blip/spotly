'use client';

import type { POI } from '@/lib/types';
import { Map, AdvancedMarker, InfoWindow } from '@vis.gl/react-google-maps';
import { useState } from 'react';
import { Button } from '../ui/button';
import { useRouter } from 'next/navigation';
import { MapPin, User, Crosshair } from 'lucide-react';
import { getDistance } from '@/lib/utils';
import { useGeolocation } from '@/providers/geolocation-provider';

interface POIMapProps {
  pois: POI[];
}

export function POIMap({ pois }: POIMapProps) {
  const router = useRouter();
  const [selectedPoi, setSelectedPoi] = useState<POI | null>(null);
  const { userLocation } = useGeolocation();
  const [map, setMap] = useState<google.maps.Map | null>(null);


  const defaultCenter = userLocation || (pois.length > 0 ? pois[0].location : { lat: 48.8566, lng: 2.3522 });

  const handleRecenter = () => {
    if (map && userLocation) {
      map.panTo(userLocation);
      map.setZoom(14);
    }
  };

  return (
    <div className="relative w-full h-full">
      <Map
        ref={setMap}
        defaultCenter={defaultCenter}
        defaultZoom={13}
        gestureHandling={'greedy'}
        disableDefaultUI={false}
        mapId={process.env.NEXT_PUBLIC_GOOGLE_MAP_ID}
      >
        {userLocation && (
          <AdvancedMarker position={userLocation}>
              <div className="text-blue-500 rounded-full bg-white p-1 shadow-lg">
                  <User size={24} />
              </div>
          </AdvancedMarker>
        )}

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
              {userLocation && (
                  <p className="text-xs text-muted-foreground mb-2 font-semibold">
                      À {getDistance(userLocation.lat, userLocation.lng, selectedPoi.location.lat, selectedPoi.location.lng).toFixed(2)} km
                  </p>
              )}
              <Button size="sm" onClick={() => router.push(`/pois/${selectedPoi.id}`)}>
                Voir les détails
              </Button>
            </div>
          </InfoWindow>
        )}
      </Map>
      {userLocation && (
        <div className="absolute bottom-4 right-4">
          <Button size="icon" onClick={handleRecenter} type="button" title="Recentrer sur ma position">
            <Crosshair className="h-5 w-5" />
          </Button>
        </div>
      )}
    </div>
  );
}
