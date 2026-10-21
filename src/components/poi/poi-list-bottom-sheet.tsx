'use client';

import { useMemo, useState } from 'react';
import type { EventPoiCategory, POILite } from '@/lib/types';
import { findEventPoiCategory, getEventPoiCategoryColor, getEventPoiCategoryLabel, resolveCategoryIcon } from '@/lib/event-poi-categories';
import { isSponsorActive } from '@/lib/sponsor-utils';
import { getDistance, cn } from '@/lib/utils';
import { CalendarDays, ChevronDown, ChevronUp, Navigation, RefreshCw, Star } from 'lucide-react';
import { SponsorBadge } from '../sponsor/sponsor-badge';
import { Button } from '../ui/button';
import { ScrollArea } from '../ui/scroll-area';
import type { PublicProgramAvailability } from '@/lib/public-event-program';

interface PoiListBottomSheetProps {
  pois: POILite[];
  onSelectPoi: (poi: POILite) => void;
  selectedPoiId: string | null;
  userLocation: { lat: number; lng: number } | null;
  categories: EventPoiCategory[];
  isVisible?: boolean;
  programAvailability?: PublicProgramAvailability;
  onOpenProgram?: () => void;
  onRetryProgram?: () => void;
}

export function PoiListBottomSheet({
  pois,
  onSelectPoi,
  selectedPoiId,
  userLocation,
  categories,
  isVisible = true,
  programAvailability = 'empty',
  onOpenProgram,
  onRetryProgram,
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

  const resultsLabel = `${sortedPois.length} ${sortedPois.length === 1 ? 'résultat' : 'résultats'}`;
  const listContentId = 'poi-list-bottom-sheet-content';

  return (
    <div
      className={cn(
        "fixed bottom-0 left-1/2 -translate-x-1/2 z-40 w-[94%] overflow-hidden bg-transparent pb-[env(safe-area-inset-bottom)] pointer-events-none transition-all duration-500 ease-in-out md:h-[50vh] md:w-[60%] md:pb-0",
        isExpanded ? "h-[50vh]" : "h-[calc(5.75rem+env(safe-area-inset-bottom))]",
        !isVisible && "translate-y-full opacity-0"
      )}
    >
      <div className="flex h-full w-full flex-col px-3 pointer-events-none md:px-4">

        <div className="mb-2 flex shrink-0 items-center gap-2 rounded-3xl border border-violet-200 bg-[#fffaf5] px-2.5 py-1.5 text-slate-900 shadow-lg pointer-events-auto md:hidden">
          <button
            type="button"
            onClick={() => setIsExpanded((expanded) => !expanded)}
            aria-expanded={isExpanded}
            aria-controls={listContentId}
            aria-label={`${isExpanded ? 'Fermer' : 'Ouvrir'} la liste des lieux à découvrir — ${resultsLabel}`}
            className="flex min-h-[4.25rem] min-w-0 flex-1 flex-col items-start justify-center rounded-2xl px-1 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-700 focus-visible:ring-offset-2"
          >
            <span className="mb-1 h-1.5 w-12 self-center rounded-full bg-violet-500" aria-hidden="true" />
            <span className="text-sm font-bold leading-tight">Les lieux à découvrir</span>
            <span className="flex items-center gap-1 text-xs font-bold text-violet-800">
              {resultsLabel}
              {isExpanded ? <ChevronDown aria-hidden="true" className="h-4 w-4" /> : <ChevronUp aria-hidden="true" className="h-4 w-4" />}
            </span>
          </button>
          {programAvailability === 'available' && onOpenProgram && (
            <Button
              type="button"
              size="sm"
              onClick={onOpenProgram}
              aria-haspopup="dialog"
              className="h-11 shrink-0 gap-1.5 rounded-2xl bg-orange-300 px-2.5 text-xs font-bold text-orange-950 shadow-sm hover:bg-orange-400 active:bg-orange-500 focus-visible:ring-orange-700"
            >
              <CalendarDays aria-hidden="true" /> Programme
            </Button>
          )}
          {programAvailability === 'error' && onRetryProgram && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={onRetryProgram}
              aria-label="Programme indisponible, réessayer le chargement"
              className="h-11 shrink-0 gap-1 rounded-2xl border-orange-300 bg-orange-50 px-2.5 text-xs font-bold text-orange-950 hover:bg-orange-100"
            >
              <RefreshCw aria-hidden="true" /> Réessayer
            </Button>
          )}
        </div>

        {/* Le panneau reste ouvert sur tablette/desktop, comme avant. */}
        <div className="mb-2 hidden shrink-0 flex-col items-center rounded-3xl border border-violet-200 bg-[#fffaf5] py-2 text-slate-900 shadow-sm pointer-events-auto md:flex">
          <div className="mb-1 h-1.5 w-12 rounded-full bg-violet-500" aria-hidden="true" />
          <div className="text-sm font-bold">Les lieux à découvrir</div>
          <div className="text-xs font-bold text-violet-800">{resultsLabel}</div>
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
