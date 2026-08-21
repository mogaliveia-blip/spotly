'use client';

import type { EventPoiCategory, POI, POILite } from '@/lib/types';
import { Map, AdvancedMarker, useMap } from '@vis.gl/react-google-maps';
import { useEffect, useMemo } from 'react';
import type { ElementType } from 'react';
import { User, Crosshair, MapPin } from 'lucide-react';
import { useGeolocation } from '@/providers/geolocation-provider';
import { Skeleton } from '../ui/skeleton';
import { Button } from '../ui/button';
import { useIsMobile } from '@/hooks/use-mobile';
import { cn } from '@/lib/utils';
import { isSponsorActive } from '@/lib/sponsor-utils';
import { useToast } from '@/hooks/use-toast';
import { getEventPoiCategoryColor, resolveCategoryIcon } from '@/lib/event-poi-categories';

type POIAny = POILite | POI;

function POIMarkerContent({
  poi,
  colorClass,
  isSelected,
  isMobile,
  sponsorIsActive,
  icon: Icon,
  onSelect
}: {
  poi: POIAny;
  colorClass: string;
  isSelected: boolean;
  isMobile: boolean;
  sponsorIsActive: boolean;
  icon: ElementType;
  onSelect: () => void;
}) {
  const iconSize = isMobile ? 18 : 20;

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={`Voir ${poi.title}`}
      onClick={(event) => {
        event.stopPropagation();
        onSelect();
      }}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          event.stopPropagation();
          onSelect();
        }
      }}
      className={cn(
        "group relative flex cursor-pointer touch-manipulation flex-col items-center -translate-y-2 select-none outline-none",
        isSelected && "-translate-y-3"
      )}
    >
      {sponsorIsActive && !isSelected && (
        <div className="pointer-events-none absolute mt-1 h-11 w-11 rounded-full bg-amber-400/25 blur-md" />
      )}
      <div
        className={cn(
          "relative rounded-full bg-white p-1.5 shadow-md border border-black/10 transition-all",
          "group-hover:scale-110 group-focus-visible:scale-110 group-focus-visible:ring-2 group-focus-visible:ring-accent",
          sponsorIsActive && "border-amber-400 bg-amber-50 shadow-amber-500/20",
          isSelected && "scale-110 ring-2 ring-accent shadow-lg"
        )}
      >
        <Icon size={iconSize} strokeWidth={2.75} className={cn("drop-shadow-sm", sponsorIsActive ? "text-amber-500" : colorClass)} />
      </div>
      <div
        className={cn(
          "relative mt-1 max-w-[140px] truncate rounded-full border border-black/10 bg-white px-3 py-1 text-center text-[11px] font-semibold leading-none text-slate-950 shadow-md transition-all",
          "group-hover:scale-105 group-focus-visible:scale-105 group-focus-visible:ring-2 group-focus-visible:ring-accent",
          !isMobile && "max-w-[168px] px-3.5 py-1.5 text-xs",
          sponsorIsActive && "border-amber-400 bg-amber-50",
          isSelected && "scale-105 ring-2 ring-accent shadow-lg"
        )}
      >
        {poi.title}
      </div>
    </div>
  );
}

function MapController({
  pois,
  categories,
  onSelectPoiId,
  selectedPoiId,
  isListVisible
}: {
  pois: POIAny[];
  categories: EventPoiCategory[];
  onSelectPoiId: (poiId: string | null) => void;
  selectedPoiId: string | null;
  isListVisible: boolean;
}) {
  const { userLocation, error: geoError } = useGeolocation();
  const map = useMap();
  const isMobile = useIsMobile();
  const { toast } = useToast();
  const selectedPoi = useMemo(
    () => pois.find((poi) => poi.id === selectedPoiId) ?? null,
    [pois, selectedPoiId]
  );

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

  const poiMarkers = useMemo(() => {
    return pois.map((poi) => {
      const isSelected = selectedPoiId === poi.id;
      const sponsorIsActive = isSponsorActive(poi as any);
      const CategoryIcon = resolveCategoryIcon(categories.find((category) => category.id === poi.categoryId)?.icon);
      let colorClass = getEventPoiCategoryColor(categories, poi.categoryId);
      if (sponsorIsActive) colorClass = 'text-amber-500';
      if (isSelected) colorClass = 'text-accent';

      return (
        <AdvancedMarker
          key={poi.id}
          position={poi.location}
          onClick={(event: any) => {
            event?.domEvent?.stopPropagation?.();
            onSelectPoiId(poi.id);
          }}
        >
          <POIMarkerContent
            poi={poi}
            colorClass={colorClass}
            isSelected={isSelected}
            isMobile={isMobile}
            sponsorIsActive={sponsorIsActive}
            icon={CategoryIcon}
            onSelect={() => onSelectPoiId(poi.id)}
          />
        </AdvancedMarker>
      );
    });
  }, [pois, categories, selectedPoiId, isMobile, onSelectPoiId]);

  return (
    <>
      {userLocation && (
        <AdvancedMarker position={userLocation}>
          <div className="text-blue-500 rounded-full bg-white p-1 shadow-lg ring-2 ring-white">
            <User size={24} />
          </div>
        </AdvancedMarker>
      )}

      {poiMarkers}

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
  selectedPoiId,
  onSelectPoiId,
  pois,
  categories,
  isListVisible
}: {
  selectedPoiId: string | null;
  onSelectPoiId: (poiId: string | null) => void;
  pois: POIAny[];
  categories: EventPoiCategory[];
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
        onClick={() => onSelectPoiId(null)}
      >
        <MapController
          pois={pois}
          categories={categories}
          onSelectPoiId={onSelectPoiId}
          selectedPoiId={selectedPoiId}
          isListVisible={isListVisible}
        />
      </Map>
    </div>
  );
}
