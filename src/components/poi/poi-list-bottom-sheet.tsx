'use client';

import { useMemo, useState } from 'react';
import type { EventPoiCategory, POILite } from '@/lib/types';
import { findEventPoiCategory, getEventPoiCategoryColor, getEventPoiCategoryLabel, resolveCategoryIcon } from '@/lib/event-poi-categories';
import { isSponsorActive } from '@/lib/sponsor-utils';
import { getDistance, cn } from '@/lib/utils';
import { ChevronDown, ChevronUp, Navigation, Star } from 'lucide-react';
import { SponsorBadge } from '../sponsor/sponsor-badge';
import { ScrollArea } from '../ui/scroll-area';

interface PoiListBottomSheetProps {
  pois: POILite[];
  onSelectPoi: (poi: POILite) => void;
  selectedPoiId: string | null;
  userLocation: { lat: number; lng: number } | null;
  categories: EventPoiCategory[];
  isVisible?: boolean;
}

export function PoiListBottomSheet({
  pois,
  onSelectPoi,
  selectedPoiId,
  userLocation,
  categories,
  isVisible = true,
}: PoiListBottomSheetProps) {
  const [isExpanded, setIsExpanded] = useState(false);

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

  const resultsLabel = `${sortedPois.length} ${sortedPois.length === 1 ? 'Résultat' : 'Résultats'}`;
  const listContentId = 'poi-list-bottom-sheet-content';

  return (
    <div
      className={cn(
        "fixed bottom-0 left-1/2 -translate-x-1/2 z-40 bg-transparent transition-all duration-500 ease-in-out overflow-hidden pointer-events-none w-[90%] pb-[env(safe-area-inset-bottom)] md:h-[50vh] md:w-[60%] md:pb-0",
        isExpanded ? "h-[50vh]" : "h-[calc(4rem+env(safe-area-inset-bottom))]",
        !isVisible && "translate-y-full opacity-0"
      )}
    >
      <div className="flex flex-col h-full w-full pointer-events-none px-4">

        <button
          type="button"
          onClick={() => setIsExpanded((expanded) => !expanded)}
          aria-expanded={isExpanded}
          aria-controls={listContentId}
          aria-label={isExpanded ? 'Fermer la liste des lieux' : 'Ouvrir la liste des lieux'}
          className="relative mb-2 flex w-full shrink-0 flex-col items-center rounded-3xl border bg-background/80 py-3 backdrop-blur-md pointer-events-auto md:hidden"
        >
          <div className="w-12 h-1.5 bg-muted-foreground/20 rounded-full mb-2" />
          <div className="flex items-center justify-center text-[10px] font-bold text-muted-foreground/60 uppercase tracking-widest">
            {resultsLabel}
          </div>
          {isExpanded ? (
            <ChevronDown aria-hidden="true" className="absolute bottom-2.5 right-4 h-4 w-4 text-muted-foreground/60" />
          ) : (
            <ChevronUp aria-hidden="true" className="absolute bottom-2.5 right-4 h-4 w-4 text-muted-foreground/60" />
          )}
        </button>

        {/* Le panneau reste ouvert sur tablette/desktop, comme avant. */}
        <div className="mb-2 hidden shrink-0 flex-col items-center rounded-3xl border bg-background/80 py-3 backdrop-blur-md pointer-events-auto md:flex">
          <div className="mb-2 h-1.5 w-12 rounded-full bg-muted-foreground/20" />
          <div className="flex items-center justify-center text-[10px] font-bold uppercase tracking-widest text-muted-foreground/60">
            {resultsLabel}
          </div>
        </div>

        <ScrollArea
          id={listContentId}
          className={cn(
            "min-h-0 flex-1 pointer-events-auto bg-transparent md:block",
            !isExpanded && "hidden"
          )}
        >
          <div className="space-y-4 pb-32 pt-2">
            {sortedPois.length === 0 ? (
              <div className="py-10 text-center text-muted-foreground bg-background/60 backdrop-blur-md rounded-3xl border border-white/20">
                Aucun résultat pour cette catégorie.
              </div>
            ) : (
              sortedPois.map((poi) => {
                const categoryData = findEventPoiCategory(categories, poi.categoryId);
                const CategoryIcon = resolveCategoryIcon(categoryData?.icon);
                const isSelected = selectedPoiId === poi.id;
                const sponsorIsActive = isSponsorActive(poi as any);
                const categoryLabel = getEventPoiCategoryLabel(categories, poi.categoryId);

                return (
                  <button
                    key={poi.id}
                    onClick={() => onSelectPoi(poi)}
                    className={cn(
                      'w-full text-left p-4 rounded-[2rem] transition-all flex items-start gap-4 border backdrop-blur-md',
                      isSelected
                        ? 'bg-primary/90 text-primary-foreground border-primary ring-1 ring-primary/20'
                        : sponsorIsActive
                          ? 'bg-amber-50/80 border-amber-200 hover:bg-amber-100/90'
                          : 'bg-background/80 hover:bg-background/95 border-transparent'
                    )}
                  >
                    <div className={cn(
                      "p-3 rounded-2xl shadow-sm shrink-0 transition-colors",
                      isSelected ? "bg-background text-primary" : getEventPoiCategoryColor(categories, poi.categoryId)
                    )}>
                      <CategoryIcon size={20} />
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2 mb-1">
                        {sponsorIsActive && <SponsorBadge sponsor={poi.sponsor} />}
                        <span className={cn(
                          "font-bold text-base leading-tight break-words",
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
                            {categoryLabel}
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
