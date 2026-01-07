// src/components/poi/poi-details.tsx
'use client'

import type { POI, Review } from '@/lib/types';
import { useState, useEffect, useCallback } from 'react';
import { fetchReviewsByPoiId, addReview, updatePoi } from '@/lib/data';
import { useAuth } from '@/hooks/use-auth-user';
import Image from 'next/image';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { AuthDialog } from '@/components/auth/auth-dialog';
import { ReviewForm } from './review-form';
import { ReviewList } from './review-list';
import { POIGallery } from './poi-gallery';
import { cn } from '@/lib/utils';
import { Star } from 'lucide-react';
import { getDistance } from '@/lib/utils';
import { useGeolocation } from '@/providers/geolocation-provider';

interface POIDetailsProps {
  poi: POI;
}

function renderStars(rating: number) {
    const roundedRating = Math.round(rating);
    const stars = [];
    for (let i = 1; i <= 5; i++) {
      stars.push(
        <Star
          key={i}
          className={cn('h-4 w-4', i <= roundedRating ? 'text-accent fill-accent' : 'text-muted-foreground')}
        />
      );
    }
    return stars;
  };

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

    // Optimistically update the POI's rating and review count
    const oldRatingTotal = poi.averageRating * poi.reviewCount;
    const newReviewCount = poi.reviewCount + 1;
    const newAverageRating = (oldRatingTotal + newReview.rating) / newReviewCount;
    
    const updatedPoi = {
      ...poi,
      reviewCount: newReviewCount,
      averageRating: newAverageRating,
    };
    setPoi(updatedPoi);

    // Persist the new average rating and count to Firestore
    updatePoi(poi.id, {
      averageRating: newAverageRating,
      reviewCount: newReviewCount,
    });

  }, [poi]);

  return (
    <ScrollArea className="h-[50vh] w-full max-w-sm">
      <div className="space-y-4 pr-4">
        {poi.headerPhotoUrl && (
          <div className="relative aspect-video w-full">
            <Image src={poi.headerPhotoUrl} alt={poi.title} fill className="object-cover rounded-md" />
          </div>
        )}
        <div className="space-y-2 p-1">
          <h3 className="font-bold text-lg">{poi.title}</h3>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <div className="flex items-center gap-1">{renderStars(poi.averageRating)}</div>
              <span>({poi.reviewCount} {poi.reviewCount !== 1 ? 'avis' : 'avis'})</span>
          </div>
          {userLocation && (
              <p className="text-xs text-muted-foreground font-semibold">
                  À {getDistance(userLocation.lat, userLocation.lng, poi.location.lat, poi.location.lng).toFixed(2)} km
              </p>
          )}
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
    </ScrollArea>
  );
}
