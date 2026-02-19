
'use client';

import type { POI } from '@/lib/types';
import { Map, AdvancedMarker, InfoWindow, useMap } from '@vis.gl/react-google-maps';
import { useEffect } from 'react';
import { User, Crosshair, MapPin, AlertCircle } from 'lucide-react';
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
import { useToast } from '@/hooks/use-toast';

function MapController({
  pois,
  onSelectPoi,
  selectedPoi
}: {
  pois: POI[];
  onSelectPoi: (poi: POI | null) => void;
  selectedPoi: POI | null;
}) {
  const { userLocation, error: geoError } = useGeolocation();
  const map = useMap();
  const isMobile = useIsMobile();
  const { toast } = useToast();

  /* =============================
     PAN VERS POI SÉLECTIONNÉ
  ============================= */
  useEffect(() => {
    if (selectedPoi && map) {
      map.panTo(selectedPoi.location);
    }
  }, [selectedPoi, map]);

  /* =============================
     FIT BOUNDS AUTOMATIQUE
  ============================= */
  useEffect(() => {
    if (selectedPoi || !map || pois.length === 0) return;
    if (typeof window === 'undefined' || !window.google?.maps) return;

    if (pois.length === 1) {
      map.panTo(pois[0].location);
      map.setZoom(15);
    } else {
      const bounds = new window.google.maps.LatLngBounds();
      pois.forEach((poi) => bounds.extend(poi.location));
      map.fitBounds(bounds, 100);
    }
  }, [pois, selectedPoi, map]);

  /* =============================
     NOTIFICATION ERREUR GEO
  ============================= */
  useEffect(() => {
    if (geoError) {
      const message = geoError.code === 1 
        ? "La géolocalisation a été refusée. Veuillez l'activer dans vos réglages pour vous situer."
        : "Impossible de récupérer votre position précise.";
      
      toast({
        variant: "destructive",
        title: "Géolocalisation",
        description: message,
      });
    }
  }, [geoError, toast]);

  const handleRecenter = () => {
    if (map && userLocation) {
      map.panTo(userLocation);
      map.setZoom(15);
    } else if (!userLocation && geoError) {
       toast({
        variant: "destructive",
        title: "Position indisponible",
        description: "Veuillez autoriser l'accès GPS pour utiliser cette fonctionnalité.",
      });
    }
  };

  return (
    <>
      {/* Position utilisateur */}
      {userLocation && (
        <AdvancedMarker position={userLocation}>
          <div className="text-blue-500 rounded-full bg-white p-1 shadow-lg ring-2 ring-white">
            <User size={24} />
          </div>
        </AdvancedMarker>
      )}

      {/* Markers POI */}
      {pois.map((poi) => {
        const isSelected = selectedPoi?.id === poi.id;
        const sponsorIsActive = isSponsorActive(poi);

        let colorClass =
          categoriesMap[poi.mainCategory]?.markerColor || 'text-primary';

        if (sponsorIsActive) colorClass = 'text-amber-500';
        if (isSelected) colorClass = 'text-accent';

        return (
          <AdvancedMarker
            key={poi.id}
            position={poi.location}
            onClick={() => onSelectPoi(poi)}
          >
            {isMobile ? (
              <div className="flex flex-col items-center -translate-y-2 select-none">
                <div
                  className={cn(
                    "rounded-full bg-white shadow-md p-1 transition-all",
                    sponsorIsActive && "border-2 border-amber-400",
                    isSelected && "ring-2 ring-accent scale-110"
                  )}
                >
                  <MapPin
                    size={18}
                    className={
                      sponsorIsActive ? "text-amber-500" : "text-primary"
                    }
                  />
                </div>
                <div
                  className={cn(
                    "mt-1 px-3 py-1 rounded-full text-[11px] font-semibold shadow-md",
                    "bg-white border max-w-[140px] text-center truncate",
                    sponsorIsActive && "border-amber-400",
                    isSelected && "ring-2 ring-accent scale-105"
                  )}
                >
                  {poi.title}
                </div>
              </div>
            ) : (
              <div
                className={cn(
                  "transition-transform drop-shadow-md",
                  colorClass,
                  isSelected ? "scale-125" : "hover:scale-110",
                  sponsorIsActive && !isSelected && "drop-shadow-lg"
                )}
              >
                <MapPin size={36} />
              </div>
            )}
          </AdvancedMarker>
        );
      })}

      {!isMobile && selectedPoi && (
        <InfoWindow
          position={selectedPoi.location}
          onCloseClick={() => onSelectPoi(null)}
          pixelOffset={[0, -48]}
          maxWidth={400}
        >
          <ScrollArea className="h-[50vh] w-full max-w-sm">
            <div className="pr-4">
              <POIDetails poi={selectedPoi} />
            </div>
          </ScrollArea>
        </InfoWindow>
      )}

      {/* Bouton recentrage personnalisé amélioré */}
      <div className="absolute top-4 right-4 z-10">
        <Button
          onClick={handleRecenter}
          type="button"
          variant="secondary"
          className="shadow-lg bg-background/95 backdrop-blur-sm hover:bg-background text-primary border border-primary/30 flex items-center gap-2 h-10 px-4 rounded-full transition-all active:scale-95 hover:border-primary/50"
          title="Recentrer sur ma position"
        >
          <Crosshair className={cn("h-4 w-4", !userLocation && "text-muted-foreground")} />
          <span className="font-semibold text-xs whitespace-nowrap">Ma position</span>
          {(!userLocation && !geoError) && <Skeleton className="h-2 w-2 rounded-full bg-primary animate-pulse" />}
        </Button>
      </div>
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
      : { lat: -21.3393, lng: 55.4781 });

  if (geoLoading && pois.length === 0) {
    return <Skeleton className="w-full h-full" />;
  }

  return (
    <div className="w-full h-full min-h-0">
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
