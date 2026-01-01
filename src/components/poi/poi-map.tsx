'use client';

import type { POI } from '@/lib/types';
import { Map, AdvancedMarker, InfoWindow, useMap } from '@vis.gl/react-google-maps';
import { useState, useEffect } from 'react';
import { Button } from '../ui/button';
import { MapPin, User, Crosshair } from 'lucide-react';
import { getDistance } from '@/lib/utils';
import { useGeolocation } from '@/providers/geolocation-provider';
import { fetchPois } from '@/lib/data';
import { Skeleton } from '../ui/skeleton';

interface POIMapProps {
  selectedPoiId: string | null;
  onSelectPoi: (poi: POI | null) => void;
}

function MapController({ pois, selectedPoi, onSelectPoi }: { pois: POI[], selectedPoi: POI | null, onSelectPoi: (poi: POI | null) => void }) {
  const { userLocation } = useGeolocation();
  const map = useMap();

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
            <Button size="sm" onClick={() => onSelectPoi(selectedPoi)}>
              Voir les détails
            </Button>
          </div>
        </InfoWindow>
      )}
      {userLocation && (
        <div className="absolute bottom-4 right-4 z-10">
          <Button size="icon" onClick={handleRecenter} type="button" title="Recentrer sur ma position">
            <Crosshair className="h-5 w-5" />
          </Button>
        </div>
      )}
    </>
  );
}

export function POIMap({ selectedPoiId, onSelectPoi }: POIMapProps) {
    const { userLocation } = useGeolocation();
    const [pois, setPois] = useState<POI[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        async function getPois() {
            try {
                const poiData = await fetchPois();
                setPois(poiData);
            } catch (error) {
                console.error("Impossible de récupérer les POIs", error);
            } finally {
                setLoading(false);
            }
        }
        getPois();
    }, []);

    const selectedPoi = selectedPoiId ? pois.find(p => p.id === selectedPoiId) || null : null;
    const defaultCenter = userLocation || (pois.length > 0 ? pois[0].location : { lat: 48.8566, lng: 2.3522 });

    if (loading) {
        return <Skeleton className="w-full h-full" />;
    }

    return (
        <Map
            defaultCenter={defaultCenter}
            defaultZoom={13}
            gestureHandling={'greedy'}
            disableDefaultUI={false}
            mapId={process.env.NEXT_PUBLIC_GOOGLE_MAP_ID}
            className="w-full h-full"
        >
            <MapController pois={pois} selectedPoi={selectedPoi} onSelectPoi={onSelectPoi} />
        </Map>
    )
}
