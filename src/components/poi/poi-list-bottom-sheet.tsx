
'use client';

import { useState, useMemo, useEffect } from 'react';
import type { POILite, MainCategory } from '@/lib/types';
import { categoriesMap } from '@/lib/types';
import { isSponsorActive } from '@/lib/sponsor-utils';
import { getDistance, cn } from '@/lib/utils';
import { MapPin, Navigation, Star } from 'lucide-react';
import { SponsorBadge } from '../sponsor/sponsor-badge';
import { ScrollArea } from '../ui/scroll-area';

interface PoiListBottomSheetProps {
  pois: POILite[];
  onSelectPoi: (poi: POILite) => void;
  selectedPoiId: string | null;
  userLocation: { lat: number; lng: number } | null;
  categoryFilter: MainCategory | 'all';
}

export function PoiListBottomSheet({
  pois,
  onSelectPoi,
  selectedPoiId,
  userLocation,
  categoryFilter,
}: PoiListBottomSheetProps) {
  // On simplifie la gestion des hauteurs. 
  // Par défaut, on affiche la liste à hauteur intermédiaire (60vh).
  // Si un POI est sélectionné, on réduit à 25vh pour laisser la place aux détails.
  const [isMinimized, setIsMinimized] = useState(false);

  useEffect(() => {
    if (selectedPoiId) {
      setIsMinimized(true);
    } else {
      setIsMinimized(false);
    }
  }, [selectedPoiId]);

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

  return (
    <div
      className={cn(
        "fixed inset-x-0 bottom-0 z-40 bg-transparent transition-all duration-500 ease-in-out overflow-hidden pointer-events-none",
        isMinimized ? "h-[25vh]" : "h-[60vh]"
      )}
    >
      <div className="flex flex-col h-full w-full pointer-events-none px-4">
        
        {/* Poignée flottante visuelle (sans action de clic, le scroll est naturel) */}
        <div className="flex flex-col items-center py-3 shrink-0 bg-background/80 backdrop-blur-md rounded-3xl border pointer-events-auto mb-2">
          <div className="w-12 h-1.5 bg-muted-foreground/20 rounded-full mb-2" />
          <div className="flex items-center gap-1 text-[10px] font-bold text-muted-foreground/60 uppercase tracking-widest">
            {sortedPois.length} Résultats
          </div>
        </div>

        <ScrollArea className="flex-1 pointer-events-auto bg-transparent">
          <div className="space-y-3 pb-32">
            {sortedPois.length === 0 ? (
              <div className="py-10 text-center text-muted-foreground bg-background/60 backdrop-blur-md rounded-3xl border border-white/20">
                Aucun résultat pour cette catégorie.
              </div>
            ) : (
              sortedPois.map((poi) => {
                const categoryData = categoriesMap[poi.mainCategory];
                const CategoryIcon = categoryData?.icon || MapPin;
                const isSelected = selectedPoiId === poi.id;
                const sponsorIsActive = isSponsorActive(poi as any);
                const subCatLabel = categoryData?.subCategories[poi.subCategory] || poi.subCategory;

                return (
                  <button
                    key={poi.id}
                    onClick={() => onSelectPoi(poi)}
                    className={cn(
                      'w-full text-left p-4 rounded-3xl transition-all flex items-start gap-4 border shadow-sm backdrop-blur-md',
                      isSelected
                        ? 'bg-primary/90 text-primary-foreground border-primary ring-1 ring-primary/20'
                        : sponsorIsActive
                          ? 'bg-amber-50/80 border-amber-200 hover:bg-amber-100/90'
                          : 'bg-background/80 hover:bg-background/95 border-transparent'
                    )}
                  >
                    <div className={cn(
                      "p-3 rounded-2xl shadow-sm shrink-0 transition-colors",
                      isSelected ? "bg-background text-primary" : (categoryData?.color || "bg-muted text-muted-foreground")
                    )}>
                      <CategoryIcon size={20} />
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2 mb-1">
                        {sponsorIsActive && <SponsorBadge sponsor={poi.sponsor} />}
                        <span className={cn(
                          "font-bold text-base leading-tight line-clamp-1",
                          isSelected ? "text-primary-foreground" : "text-foreground"
                        )}>
                          {poi.title}
                        </span>
                      </div>

                      <div className="flex flex-col gap-1.5">
                        <div className={cn(
                          "flex items-center gap-3 text-xs font-medium",
                          isSelected ? "text-primary-foreground/80" : "text-muted-foreground"
                        )}>
                          <span className="flex items-center gap-1">
                            {subCatLabel}
                          </span>
                          {poi.averageRating > 0 && (
                            <span className="flex items-center gap-1 text-accent">
                              <Star className="h-3 w-3 fill-accent" />
                              {poi.averageRating.toFixed(1)}
                            </span>
                          )}
                          {userLocation && (
                            <span className="flex items-center gap-1">
                              <Navigation className="h-3 w-3" />
                              {getDistance(userLocation.lat, userLocation.lng, poi.location.lat, poi.location.lng).toFixed(2)} km
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </ScrollArea>
      </div>
    </div>
  );
}
