'use client';

import { useState, useMemo } from 'react';
import type { POILite, MainCategory } from '@/lib/types';
import { categoriesMap } from '@/lib/types';
import { isSponsorActive } from '@/lib/sponsor-utils';
import { getDistance, cn } from '@/lib/utils';
import { MapPin, Navigation, ChevronUp, ChevronDown } from 'lucide-react';
import { SponsorBadge } from '../sponsor/sponsor-badge';
import { ScrollArea } from '../ui/scroll-area';

interface PoiListBottomSheetProps {
  pois: POILite[];
  onSelectPoi: (poi: POILite) => void;
  selectedPoiId: string | null;
  userLocation: { lat: number; lng: number } | null;
  categoryFilter: MainCategory | 'all';
}

type SnapPoint = 'low' | 'mid' | 'high';

const snapHeights: Record<SnapPoint, string> = {
  low: '25vh',
  mid: '60vh',
  high: '92vh',
};

export function PoiListBottomSheet({
  pois,
  onSelectPoi,
  selectedPoiId,
  userLocation,
  categoryFilter,
}: PoiListBottomSheetProps) {
  const [snapPoint, setSnapPoint] = useState<SnapPoint>('low');

  const sortedPois = useMemo(() => {
    const activeSponsors: POILite[] = [];
    const others: POILite[] = [];

    for (const poi of pois) {
      if (isSponsorActive(poi as any)) {
        activeSponsors.push(poi);
      } else {
        others.push(poi);
      }
    }

    activeSponsors.sort((a, b) => ((b.sponsor as any)?.priority ?? 0) - ((a.sponsor as any)?.priority ?? 0));

    if (userLocation) {
      others.sort((a, b) => {
        const distA = getDistance(userLocation.lat, userLocation.lng, a.location.lat, a.location.lng);
        const distB = getDistance(userLocation.lat, userLocation.lng, b.location.lat, b.location.lng);
        return distA - distB;
      });
    }

    return [...activeSponsors, ...others];
  }, [pois, userLocation]);

  const cycleSnapPoint = () => {
    if (snapPoint === 'low') setSnapPoint('mid');
    else if (snapPoint === 'mid') setSnapPoint('high');
    else setSnapPoint('low');
  };

  return (
    <div
      className={cn(
        "fixed inset-x-0 bottom-0 z-40 bg-background border-t shadow-[0_-8px_30px_rgb(0,0,0,0.12)] transition-all duration-300 ease-in-out rounded-t-3xl",
        snapPoint === 'high' ? "rounded-t-none" : ""
      )}
      style={{ height: snapHeights[snapPoint] }}
    >
      {/* Draggable Handle Area */}
      <div 
        className="flex flex-col items-center py-3 cursor-pointer group"
        onClick={cycleSnapPoint}
      >
        <div className="w-12 h-1.5 bg-muted-foreground/20 rounded-full group-hover:bg-muted-foreground/40 transition-colors mb-2" />
        <div className="flex items-center gap-1 text-[10px] font-bold text-muted-foreground/60 uppercase tracking-widest">
          {snapPoint === 'low' ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
          {sortedPois.length} Résultats
        </div>
      </div>

      <ScrollArea className="h-full pb-20">
        <div className="px-4 space-y-2">
          {sortedPois.length === 0 ? (
            <div className="py-10 text-center text-muted-foreground">
              Aucun résultat pour cette catégorie.
            </div>
          ) : (
            sortedPois.map((poi) => {
              const categoryData = categoriesMap[poi.mainCategory];
              const CategoryIcon = categoryData?.icon || MapPin;
              const isSelected = selectedPoiId === poi.id;
              const sponsorIsActive = isSponsorActive(poi as any);

              return (
                <button
                  key={poi.id}
                  onClick={() => {
                    onSelectPoi(poi);
                    if (snapPoint === 'high') setSnapPoint('mid');
                  }}
                  className={cn(
                    'w-full text-left p-3 rounded-2xl transition-all flex items-start gap-4 border',
                    isSelected
                      ? 'bg-primary/5 border-primary shadow-sm ring-1 ring-primary/20'
                      : sponsorIsActive
                        ? 'bg-sidebar-accent/30 border-primary/20 hover:bg-sidebar-accent/50'
                        : 'bg-card hover:bg-accent/50 border-transparent'
                  )}
                >
                  <div className={cn(
                    "p-2.5 rounded-xl shadow-sm shrink-0",
                    isSelected ? "bg-primary text-primary-foreground" : (categoryData?.color || "bg-muted text-muted-foreground")
                  )}>
                    <CategoryIcon size={18} />
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2 mb-1">
                      {sponsorIsActive && <SponsorBadge sponsor={poi.sponsor} />}
                      <span className="font-bold text-sm leading-tight line-clamp-2">
                        {poi.title}
                      </span>
                    </div>

                    <div className="flex items-center gap-3 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <MapPin className="h-3 w-3" />
                        {categoryData?.label}
                      </span>
                      {userLocation && (
                        <span className="flex items-center gap-1">
                          <Navigation className="h-3 w-3" />
                          {getDistance(userLocation.lat, userLocation.lng, poi.location.lat, poi.location.lng).toFixed(2)} km
                        </span>
                      )}
                    </div>
                  </div>
                </button>
              );
            })
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
