
'use client'

import type { POI, POILite, Review, AppConfig } from '@/lib/types';
import { useState, useEffect, useCallback, useRef } from 'react';
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
import { Navigation } from 'lucide-react';
import { SponsorBadge } from '../sponsor/sponsor-badge';
import { isSponsorActive } from '@/lib/sponsor-utils';

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
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const { user } = useAuth();
  const { userLocation } = useGeolocation();
  const lastPoiIdRef = useRef<string | null>(null);

  useEffect(() => {
    fetchAppConfig()
      .then((config: AppConfig) => {
        setReviewsEnabled(config.reviewsEnabled ?? true);
      })
      .catch(() => {
        setReviewsEnabled(true);
      });
  }, []);

  useEffect(() => {
    // Si initialPoi change (nouvelle référence), on met à jour le state local
    setPoi(prev => {
      if (!prev) return initialPoi;
      if (isFullPoi(prev) && prev.id === initialPoi.id) return prev;
      return initialPoi;
    });
  
    if (reviewsEnabled !== true) return;
  
    const poiId = initialPoi.id;
    const isSamePoi = lastPoiIdRef.current === poiId;
  
    // On ne recharge les avis que si l'ID a changé pour éviter les appels inutiles
    // lors du forçage de référence (spread) pour le scroll.
    if (isSamePoi && reviews.length > 0) return;
  
    lastPoiIdRef.current = poiId;
    setReviewsLoading(true);
  
    fetchReviewsByPoiId(poiId)
      .then(setReviews)
      .catch(err =>
        console.error("Impossible de charger les avis pour le POI", err)
      )
      .finally(() => setReviewsLoading(false));
  }, [initialPoi, reviewsEnabled, reviews.length]);

  const handleReviewAdded = useCallback((newReview: Review) => {
    setReviews(prev => [newReview, ...prev]);
  }, []);

  const mapsUrl = `https://www.google.com/maps/dir/?api=1&destination=${poi.location.lat},${poi.location.lng}&travelmode=walking`;

  const full = isFullPoi(poi);

  if (reviewsEnabled === null) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-6 w-1/3" />
        <Skeleton className="h-20 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Photo d'en-tête */}
      {poi.headerPhotoUrl ? (
        <div className="relative aspect-video w-full bg-muted/30 rounded-3xl overflow-hidden shadow-sm">
          <Image
            src={poi.headerPhotoUrl}
            alt={poi.title}
            fill
            className="object-contain cursor-zoom-in transition-transform hover:scale-105 duration-500"
            onClick={() => setSelectedImage(poi.headerPhotoUrl!)}
          />
        </div>
      ) : (
        <div className="relative aspect-video w-full">
          <Skeleton className="w-full h-full rounded-3xl" />
        </div>
      )}

      <div className="space-y-4">
        {/* Titre et Badge Sponsor */}
        <div className="space-y-2">
          {poi?.sponsor && isSponsorActive(poi) && (
            <div className="flex">
              <SponsorBadge sponsor={poi.sponsor} className="px-3 py-1 text-xs" />
            </div>
          )}
          <h3 className="font-bold text-2xl tracking-tight leading-tight">{poi.title}</h3>
        </div>

        {/* Actions et Distance */}
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

        {/* Description */}
        <div className="pt-2">
          {full ? (
            <p className="text-base text-muted-foreground leading-relaxed">{poi.description}</p>
          ) : (
            <div className="space-y-3">
              <Skeleton className="h-4 w-[95%]" />
              <Skeleton className="h-4 w-[88%]" />
              <Skeleton className="h-4 w-[75%]" />
            </div>
          )}
        </div>
      </div>

      {/* Galerie */}
      {full && (
        <div className="pt-2">
          <POIGallery
            poi={poi}
            onImageClick={(url) => setSelectedImage(url)}
          />
        </div>
      )}

      <div className="h-px bg-border w-full my-6" />

      {/* Section Avis */}
      {reviewsEnabled === true && (
        <div className="space-y-6">
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

      {/* Lightbox */}
      {selectedImage && (
        <div
          className="fixed inset-0 z-[999] bg-black/95 flex items-center justify-center p-4 backdrop-blur-md animate-in fade-in duration-300"
          onClick={() => setSelectedImage(null)}
        >
          <img
            src={selectedImage}
            alt="preview"
            className="max-w-full max-h-[90vh] object-contain rounded-2xl shadow-2xl animate-in zoom-in-95 duration-300"
            onClick={(e) => e.stopPropagation()}
          />
          <button
            className="absolute top-8 right-8 text-white bg-white/10 hover:bg-white/20 p-3 rounded-full transition-colors"
            onClick={() => setSelectedImage(null)}
          >
            ✕
          </button>
        </div>
      )}
    </div>
  );
}
