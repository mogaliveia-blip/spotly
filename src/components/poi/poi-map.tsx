'use client';

import type { POI, Review } from '@/lib/types';
import { Map, AdvancedMarker, InfoWindow, useMap } from '@vis.gl/react-google-maps';
import { useState, useEffect, useCallback, useMemo } from 'react';
import { User, Crosshair, MapPin } from 'lucide-react';
import { useGeolocation } from '@/providers/geolocation-provider';
import { Skeleton } from '../ui/skeleton';
import { Button } from '../ui/button';
import { useAuth } from '@/hooks/use-auth-user';
import { POIDetails } from './poi-details';


function MapController({ pois, onSelectPoi, selectedPoiId }: { pois: POI[], onSelectPoi: (poi: POI | null) => void, selectedPoiId: string | null }) {
  const { userLocation } = useGeolocation();
  const map = useMap();
  const selectedPoi = selectedPoiId ? pois.find(p => p.id === selectedPoiId) || null : null;

  useEffect(() => {
    if (selectedPoi && map) {
      map.panTo(selectedPoi.location);
    }
  }, [selectedPoi, map]);


  const handleRecenter = () => {
    if (map && userLocation) {
      map.panTo(userLocation);
      map.setZoom(14);
    }
  };

  return (
    <>
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
          onClick={() => onSelectPoi(poi)}
        >
          <div className={`transition-transform ${selectedPoi?.id === poi.id ? 'text-accent scale-125' : 'text-primary hover:scale-110'}`}>
            <MapPin size={32} />
          </div>
        </AdvancedMarker>
      ))}

      {selectedPoi && (
        <InfoWindow
          position={selectedPoi.location}
          onCloseClick={() => onSelectPoi(null)}
          pixelOffset={[0, -40]}
          maxWidth={400}
        >
          <POIDetails poi={selectedPoi} />
        </InfoWindow>
      )}
      {userLocation && (
        <div className="absolute bottom-4 left-4 z-10">
          <Button size="icon" onClick={handleRecenter} type="button" title="Recentrer sur ma position">
            <Crosshair className="h-5 w-5" />
          </Button>
        </div>
      )}
    </>
  );
}

export function POIMap({ selectedPoiId, onSelectPoi, pois, setPois }: { selectedPoiId: string | null; onSelectPoi: (poi: POI | null) => void; pois: POI[]; setPois: React.Dispatch<React.SetStateAction<POI[]>> }) {
    const { userLocation, loading: geoLoading } = useGeolocation();
    const [loading, setLoading] = useState(true);
    const { user } = useAuth();

    // This effect is removed because pois are now fetched in the parent dashboard page.
    // This component now only displays the pois it receives.

    useEffect(() => {
      if (pois.length > 0) {
        setLoading(false);
      }
    }, [pois]);


    const visiblePois = useMemo(() => {
        if (user) {
            return pois;
        }
        // Limit visible POIs for non-authenticated users
        return pois.slice(0, 2);
    }, [pois, user]);

    const defaultCenter = userLocation || (pois.length > 0 ? pois[0].location : { lat: 48.8566, lng: 2.3522 });

    if (loading || geoLoading) {
        return <Skeleton className="w-full h-full" />;
    }

    return (
        <div className="w-full h-full rounded-lg overflow-hidden border">
            <Map
                defaultCenter={defaultCenter}
                defaultZoom={13}
                gestureHandling={'greedy'}
                disableDefaultUI={false}
                mapId={process.env.NEXT_PUBLIC_GOOGLE_MAP_ID}
                className="w-full h-full"
            >
                <MapController 
                    pois={visiblePois} 
                    onSelectPoi={onSelectPoi} 
                    selectedPoiId={selectedPoiId}
                />
            </Map>
        </div>
    )
}
