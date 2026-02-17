// src/components/poi/poi-map.tsx
'use client';

import type { POI } from '@/lib/types';
import { Map, AdvancedMarker, InfoWindow, useMap } from '@vis.gl/react-google-maps';
import { useEffect } from 'react';
import { User, Crosshair, MapPin } from 'lucide-react';
import { useGeolocation } from '@/providers/geolocation-provider';
import { Skeleton } from '../ui/skeleton';
import { Button } from '../ui/button';
import { POIDetails } from './poi-details';
import { useIsMobile } from '@/hooks/use-mobile';
import { MobilePOIBottomSheet } from './mobile-poi-bottom-sheet';
import { categoriesMap } from '@/lib/types';
import { cn } from '@/lib/utils';
import { ScrollArea } from '../ui/scroll-area';
import { isSponsorActive } from '@/lib/sponsor-utils';

function MapController({
  pois,
  onSelectPoi,
  selectedPoi
}: {
  pois: POI[];
  onSelectPoi: (poi: POI | null) => void;
  selectedPoi: POI | null;
}) {
  const { userLocation } = useGeolocation();
  const map = useMap();
  const isMobile = useIsMobile();

  // Effect to pan to a selected POI
  useEffect(() => {
    if (selectedPoi && map) {
      map.panTo(selectedPoi.location);
    }
  }, [selectedPoi, map]);

  // Effect to fit bounds when category changes (and no POI is selected)
  useEffect(() => {
    if (selectedPoi || !map || pois.length === 0) {
      return;
    }

    if (pois.length === 1) {
      map.panTo(pois[0].location);
      map.setZoom(15);
    } else {
      const bounds = new google.maps.LatLngBounds();
      pois.forEach(poi => {
        bounds.extend(poi.location);
      });
      map.fitBounds(bounds, 100); // 100px padding
    }
  }, [pois, selectedPoi, map]);


  const handleRecenter = () => {
    if (map && userLocation) {
      map.panTo(userLocation);
      map.setZoom(14);
    }
  };

  return (
    <>
      {/* Position utilisateur */}
      {userLocation && (
        <AdvancedMarker position={userLocation}>
          <div className="text-blue-500 rounded-full bg-white p-1 shadow-lg">
            <User size={24} />
          </div>
        </AdvancedMarker>
      )}

      {/* POI Markers */}
      {pois.map((poi) => {
        const isSelected = selectedPoi?.id === poi.id;
        const sponsorIsActive = isSponsorActive(poi);
        
        let colorClass = categoriesMap[poi.mainCategory]?.markerColor || 'text-primary';
        if (sponsorIsActive) {
            colorClass = 'text-amber-500'; // Specific color for active sponsors
        }
        if (isSelected) {
            colorClass = 'text-accent';
        }

        return (
          <AdvancedMarker
            key={poi.id}
            position={poi.location}
            onClick={() => onSelectPoi(poi)}
          >
            <div
              className={cn(
                'transition-transform drop-shadow-md',
                colorClass,
                isSelected
                  ? 'scale-125'
                  : 'hover:scale-110',
                sponsorIsActive && !isSelected && 'drop-shadow-lg'
              )}
            >
              <MapPin size={36} />
            </div>
          </AdvancedMarker>
        );
      })}

      {/* InfoWindow desktop */}
      {!isMobile && selectedPoi && (
        <InfoWindow
          position={selectedPoi.location}
          onCloseClick={() => onSelectPoi(null)}
          pixelOffset={[0, -48]}
          maxWidth={400}
        >
          <ScrollArea className="h-[50vh] w-full max-w-sm">
            <div className="pr-4">
              <POIDetails poi={poi} />
            </div>
          </ScrollArea>
        </InfoWindow>
      )}

      {/* Bouton recentrage */}
      {userLocation && (
        <div className="absolute bottom-4 left-4 z-10">
          <Button
            size="icon"
            onClick={handleRecenter}
            type="button"
            title="Recentrer sur ma position"
          >
            <Crosshair className="h-5 w-5" />
          </Button>
        </div>
      )}
    </>
  );
}

export function POIMap({
  selectedPoi,
  onSelectPoi,
  pois
}: {
  selectedPoi: POI | null;
  onSelectPoi: (poi: POI | null) => void;
  pois: POI[];
}) {
  const { userLocation, loading: geoLoading } = useGeolocation();
  const isMobile = useIsMobile();

  const defaultCenter =
    userLocation ||
    (pois.length > 0
      ? pois[0].location
      : { lat: -21.3393, lng: 55.4781 }); // Default to Réunion Island

  if (geoLoading && pois.length === 0) {
    return <Skeleton className="w-full h-full" />;
  }

  return (
    <div className="w-full h-full">
      <Map
        defaultCenter={defaultCenter}
        defaultZoom={13}
        gestureHandling="greedy"
        mapTypeControl={false}
        streetViewControl={false}
        fullscreenControl={false}
        disableDefaultUI={false}
        mapId={process.env.NEXT_PUBLIC_GOOGLE_MAP_ID}
        className="w-full h-full"
      >
        <MapController
          pois={pois}
          onSelectPoi={onSelectPoi}
          selectedPoi={selectedPoi}
        />
      </Map>

      {isMobile && (
        <MobilePOIBottomSheet
          poi={selectedPoi}
          onOpenChange={(open) => {
            if (!open) onSelectPoi(null);
          }}
        />
      )}
    </div>
  );
}
