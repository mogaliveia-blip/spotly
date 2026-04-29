'use client'

import type { POI, POILite, Review, AppConfig } from '@/lib/types';
import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { fetchReviewsByPoiId, fetchAppConfig } from '@/lib/data';
import { useAuth } from '@/hooks/use-auth-user';
import Image from 'next/image';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { AuthDialog } from '@/components/auth/auth-dialog';
import { ReviewForm } from './review-form';
import { ReviewList } from './review-list';
import { POIGallery } from './poi-gallery';
import { getDistance } from '@/lib/utils';
import { useGeolocation } from '@/providers/geolocation-provider';
import { Navigation, X, ChevronLeft, ChevronRight } from 'lucide-react';
import { SponsorBadge } from '../sponsor/sponsor-badge';
import { isSponsorActive } from '@/lib/sponsor-utils';
import { useEvent } from '@/providers/event-provider';

type POIAny = POILite | POI;

interface POIDetailsProps {
  poi: POIAny;
}

function isFullPoi(poi: POIAny): poi is POI {
  return (
    typeof (poi as any)?.description === 'string' &&
    Array.isArray((poi as any)?.galleryUrls)
  );
}

export function POIDetails({ poi: initialPoi }: POIDetailsProps) {
  const [poi, setPoi] = useState<POIAny>(initialPoi);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [reviewsLoading, setReviewsLoading] = useState(false);
  const [reviewsEnabled, setReviewsEnabled] = useState<boolean | null>(null);
  
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const touchStartX = useRef<number | null>(null);

  const { user } = useAuth();
  const { userLocation } = useGeolocation();
  const { eventId } = useEvent();
  const lastPoiIdRef = useRef<string | null>(null);

  const full = isFullPoi(poi);

  const allImages = useMemo(() => {
    const imgs: string[] = [];
    if (poi.headerPhotoUrl) imgs.push(poi.headerPhotoUrl);
    if (full && (poi as POI).galleryUrls) {
      (poi as POI).galleryUrls.forEach(g => imgs.push(g.url));
    }
    return imgs;
  }, [poi.headerPhotoUrl, full, (poi as any).galleryUrls]);

  useEffect(() => {
    fetchAppConfig(eventId)
      .then((config: AppConfig) => {
        setReviewsEnabled(config.reviewsEnabled ?? true);
      })
      .catch(() => {
        setReviewsEnabled(true);
      });
  }, [eventId]);

  useEffect(() => {
    setPoi(prev => {
      if (!prev) return initialPoi;
      if (isFullPoi(prev) && prev.id === initialPoi.id) return prev;
      return initialPoi;
    });
  
    if (reviewsEnabled !== true) return;
  
    const poiId = initialPoi.id;
    const isSamePoi = lastPoiIdRef.current === poiId;
  
    if (isSamePoi && reviews.length > 0) return;
  
    lastPoiIdRef.current = poiId;
    setReviewsLoading(true);
  
    fetchReviewsByPoiId(poiId, eventId)
      .then(setReviews)
      .catch(err =>
        console.error("Impossible de charger les avis pour le POI", err)
      )
      .finally(() => setReviewsLoading(false));
  }, [initialPoi, reviewsEnabled, reviews.length, eventId]);

  const handleReviewAdded = useCallback((newReview: Review) => {
    setReviews(prev => [newReview, ...prev]);
  }, []);

  const handlePrev = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (selectedIndex === null) return;
    setSelectedIndex((selectedIndex - 1 + allImages.length) % allImages.length);
  };

  const handleNext = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (selectedIndex === null) return;
    setSelectedIndex((selectedIndex + 1) % allImages.length);
  };

  const onTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
  };

  const onTouchEnd = (e: React.TouchEvent) => {
    if (touchStartX.current === null) return;
    const touchEndX = e.changedTouches[0].clientX;
    const diff = touchStartX.current - touchEndX;

    if (Math.abs(diff) > 50) {
      if (diff > 0) handleNext();
      else handlePrev();
    }
    touchStartX.current = null;
  };

  const mapsUrl = `https://www.google.com/maps/dir/?api=1&destination=${poi.location.lat},${poi.location.lng}&travelmode=walking`;

  if (reviewsEnabled === null) {
    return (
      <div className="space-y-6">
        <div className="relative aspect-video w-full shrink-0">
          <Skeleton className="w-full h-full rounded-3xl" />
        </div>
        <Skeleton className="h-6 w-1/3" />
        <Skeleton className="h-20 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6 min-h-[40vh] flex flex-col">
      <div className="relative aspect-video w-full bg-muted/30 rounded-3xl overflow-hidden shadow-sm shrink-0">
        {poi.headerPhotoUrl ? (
          <Image
            src={poi.headerPhotoUrl}
            alt={poi.title}
            fill
            className="object-cover cursor-zoom-in transition-transform hover:scale-105 duration-500"
            onClick={() => setSelectedIndex(0)}
            priority
          />
        ) : (
          <Skeleton className="w-full h-full" />
        )}
      </div>

      <div className="space-y-4 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          {poi?.sponsor && isSponsorActive(poi) && (
            <SponsorBadge sponsor={poi.sponsor} className="px-3 py-1 text-xs" />
          )}
          <h3 className="font-bold text-2xl tracking-tight leading-tight w-full">{poi.title}</h3>
        </div>

        <div className="flex flex-wrap items-center gap-4">
          {userLocation && (
            <div className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground bg-muted/50 px-3 py-1.5 rounded-full">
              <Navigation className="h-3.5 w-3.5" />
              <span>
                {getDistance(
                  userLocation.lat,
                  userLocation.lng,
                  poi.location.lat,
                  poi.location.lng
                ).toFixed(1)} km
              </span>
            </div>
          )}

          <Button asChild size="sm" variant="default" className="shadow-lg rounded-full px-5 h-10 font-bold">
            <a href={mapsUrl} target="_blank" rel="noopener noreferrer">
              <Navigation className="mr-2 h-4 w-4" />
              Itinéraire
            </a>
          </Button>
        </div>

        <div className="pt-2 min-h-[80px]">
          {full ? (
            <p className="text-base text-muted-foreground leading-relaxed whitespace-pre-line">{poi.description}</p>
          ) : (
            <div className="space-y-3">
              <Skeleton className="h-4 w-[95%]" />
              <Skeleton className="h-4 w-[88%]" />
              <Skeleton className="h-4 w-[75%]" />
            </div>
          )}
        </div>
      </div>

      {full && (
        <div className="pt-2">
          <POIGallery
            poi={poi}
            onImageClick={(index) => setSelectedIndex(poi.headerPhotoUrl ? index + 1 : index)}
          />
        </div>
      )}

      <div className="h-px bg-border w-full my-6" />

      {reviewsEnabled === true && (
        <div className="space-y-6 pb-6">
          <h4 className="font-bold text-lg tracking-tight">Avis de la communauté</h4>
          
          {user ? (
            <div className="bg-muted/30 p-4 rounded-3xl border border-white/5">
              <ReviewForm poiId={poi.id} onReviewAdded={handleReviewAdded} />
            </div>
          ) : (
            <div className="text-center text-sm text-muted-foreground border rounded-3xl p-6 bg-muted/10">
              <p className="mb-2">Vous souhaitez partager votre expérience ?</p>
              <AuthDialog
                trigger={
                  <Button variant="outline" className="rounded-full font-bold">
                    Connectez-vous pour laisser un avis
                  </Button>
                }
              />
            </div>
          )}

          <div className="pt-2">
            {reviewsLoading ? (
              <div className="space-y-4">
                <Skeleton className="h-24 w-full rounded-2xl" />
                <Skeleton className="h-24 w-full rounded-2xl" />
              </div>
            ) : (
              <ReviewList reviews={reviews} />
            )}
          </div>
        </div>
      )}

      {selectedIndex !== null && (
        <div
          className="fixed inset-0 z-[999] bg-black/95 flex items-center justify-center backdrop-blur-md animate-in fade-in duration-300"
          onClick={() => setSelectedIndex(null)}
          onTouchStart={onTouchStart}
          onTouchEnd={onTouchEnd}
        >
          <button
            className="absolute z-[1001] bg-black/60 hover:bg-black/80 text-white rounded-full p-3 transition-all active:scale-95 shadow-2xl backdrop-blur-sm border border-white/20"
            onClick={() => setSelectedIndex(null)}
            aria-label="Fermer l'aperçu"
            style={{ 
                top: 'calc(1.5rem + env(safe-area-inset-top, 0px))', 
                right: 'calc(1.5rem + env(safe-area-inset-right, 0px))' 
            }}
          >
            <X className="h-6 w-6" />
          </button>

          {allImages.length > 1 && (
            <>
              <button
                className="absolute z-[1001] flex bg-black/50 hover:bg-black/70 text-white rounded-full p-3 md:p-4 transition-all active:scale-90 shadow-2xl backdrop-blur-sm border border-white/10 top-1/2 -translate-y-1/2"
                onClick={handlePrev}
                aria-label="Précédent"
                style={{ 
                    left: 'calc(1rem + env(safe-area-inset-left, 0px))' 
                }}
              >
                <ChevronLeft className="h-6 w-6 md:h-8 md:w-8" />
              </button>
              <button
                className="absolute z-[1001] flex bg-black/50 hover:bg-black/70 text-white rounded-full p-3 md:p-4 transition-all active:scale-90 shadow-2xl backdrop-blur-sm border border-white/10 top-1/2 -translate-y-1/2"
                onClick={handleNext}
                aria-label="Suivant"
                style={{ 
                    right: 'calc(1rem + env(safe-area-inset-right, 0px))' 
                }}
              >
                <ChevronRight className="h-6 w-6 md:h-8 md:w-8" />
              </button>
            </>
          )}

          <div className="relative w-full h-full flex items-center justify-center p-4">
            <img
              src={allImages[selectedIndex]}
              alt={`Aperçu ${selectedIndex + 1}`}
              className="max-w-full max-h-[85vh] object-contain rounded-2xl shadow-2xl animate-in zoom-in-95 duration-300 select-none"
              onClick={(e) => e.stopPropagation()}
            />
            <div className="absolute bottom-10 left-1/2 -translate-x-1/2 bg-black/50 text-white px-4 py-1.5 rounded-full text-sm font-medium backdrop-blur-sm">
              {selectedIndex + 1} / {allImages.length}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
