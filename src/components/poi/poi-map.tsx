'use client';

import type { POI, POILite } from '@/lib/types';
import { Map, AdvancedMarker, InfoWindow, useMap } from '@vis.gl/react-google-maps';
import { useEffect } from 'react';
import { User, Crosshair, MapPin } from 'lucide-react';
import { useGeolocation } from '@/providers/geolocation-provider';
import { Skeleton } from '../ui/skeleton';
import { Button } from '../ui/button';
import { POIDetails } from './poi-details';
import { useIsMobile } from '@/hooks/use-mobile';
import { categoriesMap } from '@/lib/types';
import { cn } from '@/lib/utils';
import { ScrollArea } from '../ui/scroll-area';
import { isSponsorActive } from '@/lib/sponsor-utils';
import { useToast } from '@/hooks/use-toast';

type POIAny = POILite | POI;

function MapController({
  pois,
  onSelectPoi,
  selectedPoi,
  isListVisible
}: {
  pois: POIAny[];
  onSelectPoi: (poi: POIAny | null) => void;
  selectedPoi: POIAny | null;
  isListVisible: boolean;
}) {
  const { userLocation, error: geoError } = useGeolocation();
  const map = useMap();
  const isMobile = useIsMobile();
  const { toast } = useToast();

  useEffect(() => {
    if (selectedPoi && map) {
      map.panTo(selectedPoi.location);
    }
  }, [selectedPoi, map]);

  useEffect(() => {
    if (selectedPoi || !map || pois.length === 0) return;
    if (typeof window === 'undefined' || !window.google?.maps) return;

    if (pois.length === 1) {
      const poi = pois[0];
      const latOffset = 0.002;
      const lngOffset = 0.002;
      const bounds = new window.google.maps.LatLngBounds(
        { lat: poi.location.lat - latOffset, lng: poi.location.lng - lngOffset },
        { lat: poi.location.lat + latOffset, lng: poi.location.lng + lngOffset }
      );
      const topPadding = 140;
      const bottomPadding = isListVisible ? window.innerHeight * 0.55 : 100;
      map.fitBounds(bounds, { top: topPadding, bottom: bottomPadding, left: 60, right: 60 });
    } else {
      const bounds = new window.google.maps.LatLngBounds();
      pois.forEach((poi) => bounds.extend(poi.location));
      const topPadding = 140;
      const bottomPadding = isListVisible ? window.innerHeight * 0.55 : 100;
      map.fitBounds(bounds, { top: topPadding, bottom: bottomPadding, left: 60, right: 60 });
    }
  }, [pois, selectedPoi, map, isListVisible]);

  useEffect(() => {
    if (geoError && geoError.code === 1) {
      toast({
        variant: "destructive",
        title: "Géolocalisation bloquée",
        description: "Veuillez autoriser l'accès GPS dans vos réglages pour vous situer sur la carte.",
      });
    }
  }, [geoError, toast]);

  const handleRecenter = () => {
    if (map && userLocation) {
      map.panTo(userLocation);
      map.setZoom(15);
    } else {
      let message = "Impossible de récupérer votre position actuelle.";
      if (geoError?.code === 1) message = "L'accès au GPS est désactivé.";
      else if (geoError?.code === 3) message = "Délai d'attente dépassé. Vérifiez votre signal.";
      toast({ variant: "destructive", title: "Position indisponible", description: message });
    }
  };

  return (
    <>
      {userLocation && (
        <AdvancedMarker position={userLocation}>
          <div className="text-blue-500 rounded-full bg-white p-1 shadow-lg ring-2 ring-white">
            <User size={24} />
          </div>
        </AdvancedMarker>
      )}

      {pois.map((poi) => {
        const isSelected = selectedPoi?.id === poi.id;
        const sponsorIsActive = isSponsorActive(poi as any);
        let colorClass = categoriesMap[poi.mainCategory]?.markerColor || 'text-primary';
        if (sponsorIsActive) colorClass = 'text-amber-500';
        if (isSelected) colorClass = 'text-accent';

        return (
          <AdvancedMarker key={poi.id} position={poi.location} onClick={() => onSelectPoi(poi)}>
            {isMobile ? (
              <div className="flex flex-col items-center -translate-y-2 select-none">
                <div className={cn("rounded-full bg-white shadow-md p-1 transition-all", sponsorIsActive && "border-2 border-amber-400 bg-amber-50", isSelected && "ring-2 ring-accent scale-110")}>
                  <MapPin size={18} className={sponsorIsActive ? "text-amber-500" : colorClass} />
                </div>
                <div className={cn("mt-1 px-3 py-1 rounded-full text-[11px] font-semibold shadow-md", "bg-white border max-w-[140px] text-center truncate", sponsorIsActive && "border-amber-400", isSelected && "ring-2 ring-accent scale-105")}>
                  {poi.title}
                </div>
              </div>
            ) : (
              <div className="relative">
                {sponsorIsActive && !isSelected && (
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="w-10 h-10 rounded-full bg-amber-400/20 blur-md" />
                  </div>
                )}
                <MapPin size={36} className={cn("relative transition-transform drop-shadow-md", colorClass, isSelected ? "scale-125" : "hover:scale-110", sponsorIsActive && !isSelected && "drop-shadow-lg")} />
              </div>
            )}
          </AdvancedMarker>
        );
      })}

      {!isMobile && selectedPoi && (
        <InfoWindow position={selectedPoi.location} onCloseClick={() => onSelectPoi(null)} pixelOffset={[0, -48]} maxWidth={460}>
          <ScrollArea className="h-[50vh] w-[min(420px,calc(100vw-4rem))]">
            <div className="pr-4 min-w-0">
              <POIDetails poi={selectedPoi} />
            </div>
          </ScrollArea>
        </InfoWindow>
      )}

      <div className="absolute top-24 right-4 z-30">
        <Button onClick={handleRecenter} type="button" variant="secondary" className="shadow-lg bg-background/95 backdrop-blur-sm hover:bg-background text-primary border border-primary/30 flex items-center gap-2 h-10 px-4 rounded-full transition-all active:scale-95 hover:border-primary/50" title="Recentrer sur ma position">
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
  pois,
  isListVisible
}: {
  selectedPoi: POIAny | null;
  onSelectPoi: (poi: POIAny | null) => void;
  pois: POIAny[];
  isListVisible: boolean;
}) {
  const { userLocation, loading: geoLoading } = useGeolocation();

  const defaultCenter = userLocation || (pois.length > 0 ? pois[0].location : { lat: -21.3393, lng: 55.4781 });

  if (geoLoading && pois.length === 0) {
    return <Skeleton className="w-full h-full" />;
  }

  return (
    <div className="w-full h-full min-h-0 relative">
      <Map
        defaultCenter={defaultCenter}
        defaultZoom={13}
        gestureHandling="greedy"
        mapTypeControl={false}
        streetViewControl={false}
        fullscreenControl={false}
        disableDefaultUI={false}
        mapId={process.env.NEXT_PUBLIC_GOOGLE_MAP_ID || 'default_map_id'}
        className="w-full h-full"
        onClick={() => onSelectPoi(null)}
      >
        <MapController pois={pois} onSelectPoi={onSelectPoi} selectedPoi={selectedPoi} isListVisible={isListVisible} />
      </Map>
    </div>
  );
}
