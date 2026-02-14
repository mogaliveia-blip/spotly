// src/components/poi/poi-details.tsx
'use client'

import type { POI, Review } from '@/lib/types';
import { useState, useEffect, useCallback } from 'react';
import { fetchReviewsByPoiId } from '@/lib/data';
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

interface POIDetailsProps {
  poi: POI;
}

export function POIDetails({ poi: initialPoi }: POIDetailsProps) {
  const [poi, setPoi] = useState<POI>(initialPoi);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [reviewsLoading, setReviewsLoading] = useState(true);
  const { user } = useAuth();
  const { userLocation } = useGeolocation();

  useEffect(() => {
    setPoi(initialPoi); // Update POI when the prop changes
    setReviewsLoading(true);
    fetchReviewsByPoiId(initialPoi.id)
      .then(setReviews)
      .catch(err => console.error("Impossible de charger les avis pour le POI", err))
      .finally(() => setReviewsLoading(false));
  }, [initialPoi]);

  const handleReviewAdded = useCallback((newReview: Review) => {
    setReviews(prevReviews => [newReview, ...prevReviews]);
  }, []);

  const mapsUrl = `https://www.google.com/maps/dir/?api=1&destination=${poi.location.lat},${poi.location.lng}&travelmode=walking`;

  return (
    <div className="space-y-4">
      {poi.headerPhotoUrl && (
        <div className="relative aspect-video w-full">
          <Image src={poi.headerPhotoUrl} alt={poi.title} fill className="object-cover rounded-md" />
        </div>
      )}
      <div className="space-y-2 p-1">
        <div className="flex items-center gap-2">
            <h3 className="font-bold text-lg">{poi.title}</h3>
            {isSponsorActive(poi) && <SponsorBadge sponsor={poi.sponsor} />}
        </div>
        
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 pt-1">
          {userLocation && (
              <p className="text-sm text-muted-foreground">
                  À env. {getDistance(userLocation.lat, userLocation.lng, poi.location.lat, poi.location.lng).toFixed(1)} km
              </p>
          )}
           <Button asChild size="sm" variant="outline">
              <a href={mapsUrl} target="_blank" rel="noopener noreferrer">
                  <Navigation className="mr-2 h-4 w-4" />
                  Itinéraire à pied
              </a>
          </Button>
        </div>
        
        <p className="text-sm text-muted-foreground pt-2">
            {poi.description}
        </p>
      </div>

      <POIGallery poi={poi} />
      
      {user ? (
          <ReviewForm poiId={poi.id} onReviewAdded={handleReviewAdded} />
      ) : (
          <div className="text-center text-sm text-muted-foreground border rounded-md p-4">
              <p>Vous souhaitez partager votre expérience ?</p>
               <AuthDialog trigger={
                  <Button variant="link" className="p-0 h-auto">
                      Connectez-vous pour laisser un avis.
                  </Button>
               } />
          </div>
      )}

      <div>
          <h4 className="font-semibold text-md mb-2">Avis récents</h4>
          {reviewsLoading ? <Skeleton className="h-20 w-full" /> : (
              <ReviewList reviews={reviews} />
          )}
      </div>
    </div>
  );
}
