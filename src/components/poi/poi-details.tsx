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

  const { user } = useAuth();
  const { userLocation } = useGeolocation();
  const lastPoiIdRef = useRef<string | null>(null);

  /* =========================
     CHARGEMENT CONFIG
  ========================= */

  useEffect(() => {
    fetchAppConfig()
      .then((config: AppConfig) => {
        setReviewsEnabled(config.reviewsEnabled ?? true);
      })
      .catch(() => {
        // Si erreur → permissif
        setReviewsEnabled(true);
      });
  }, []);

  /* =========================
     CHARGEMENT REVIEWS
  ========================= */

  useEffect(() => {
    setPoi(initialPoi);

    if (reviewsEnabled !== true) return;

    const poiId = initialPoi.id;
    const isSamePoi = lastPoiIdRef.current === poiId;

    if (isSamePoi) return;

    lastPoiIdRef.current = poiId;
    setReviewsLoading(true);

    fetchReviewsByPoiId(poiId)
      .then(setReviews)
      .catch(err =>
        console.error("Impossible de charger les avis pour le POI", err)
      )
      .finally(() => setReviewsLoading(false));
  }, [initialPoi, reviewsEnabled]);

  const handleReviewAdded = useCallback((newReview: Review) => {
    setReviews(prev => [newReview, ...prev]);
  }, []);

  const mapsUrl = `https://www.google.com/maps/dir/?api=1&destination=${poi.location.lat},${poi.location.lng}&travelmode=walking`;

  const full = isFullPoi(poi);

  /* =========================
     ATTENTE CONFIG
  ========================= */

  if (reviewsEnabled === null) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-6 w-1/3" />
        <Skeleton className="h-20 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-4">

      {/* Header - object-contain pour éviter de tronquer l'image originale */}
      {poi.headerPhotoUrl ? (
        <div className="relative aspect-video w-full bg-muted/30 rounded-md overflow-hidden">
          <Image
            src={poi.headerPhotoUrl}
            alt={poi.title}
            fill
            className="object-contain"
          />
        </div>
      ) : (
        <div className="relative aspect-video w-full">
          <Skeleton className="w-full h-full rounded-md" />
        </div>
      )}

      <div className="space-y-2 p-1">
        <div className="flex items-center gap-2">
          <h3 className="font-bold text-lg">{poi.title}</h3>
          {isSponsorActive(poi) && (
            <SponsorBadge sponsor={(poi as any).sponsor} />
          )}
        </div>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 pt-1">
          {userLocation && (
            <p className="text-sm text-muted-foreground">
              À env.{' '}
              {getDistance(
                userLocation.lat,
                userLocation.lng,
                poi.location.lat,
                poi.location.lng
              ).toFixed(1)} km
            </p>
          )}

          <Button asChild size="sm" variant="default" className="shadow-md">
            <a href={mapsUrl} target="_blank" rel="noopener noreferrer">
              <Navigation className="mr-2 h-4 w-4" />
              Itinéraire à pied
            </a>
          </Button>
        </div>

        <div className="pt-2">
          {full ? (
            <p className="text-sm text-muted-foreground">{poi.description}</p>
          ) : (
            <div className="space-y-2">
              <Skeleton className="h-4 w-[92%]" />
              <Skeleton className="h-4 w-[85%]" />
              <Skeleton className="h-4 w-[70%]" />
            </div>
          )}
        </div>
      </div>

      {full && <POIGallery poi={poi} />}

      {/* =========================
         SECTION AVIS (UNIQUEMENT SI ACTIVÉ)
      ========================= */}

      {reviewsEnabled === true && (
        <>
          {user ? (
            <ReviewForm poiId={poi.id} onReviewAdded={handleReviewAdded} />
          ) : (
            <div className="text-center text-sm text-muted-foreground border rounded-md p-4">
              <p>Vous souhaitez partager votre expérience ?</p>
              <AuthDialog
                trigger={
                  <Button variant="link" className="p-0 h-auto">
                    Connectez-vous pour laisser un avis.
                  </Button>
                }
              />
            </div>
          )}

          <div>
            <h4 className="font-semibold text-md mb-2">Avis récents</h4>
            {reviewsLoading ? (
              <Skeleton className="h-20 w-full" />
            ) : (
              <ReviewList reviews={reviews} />
            )}
          </div>
        </>
      )}
    </div>
  );
}