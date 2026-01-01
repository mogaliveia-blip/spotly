'use client';

import { useEffect, useState } from 'react';
import type { POI, Review } from '@/lib/types';
import { fetchPoiById, fetchReviewsByPoiId } from '@/lib/data';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { POIGallery } from './poi-gallery';
import { POIReviews } from './poi-reviews';
import { Star } from 'lucide-react';
import { useGeolocation } from '@/providers/geolocation-provider';
import { getDistance } from '@/lib/utils';
import { Badge } from '../ui/badge';

interface POIDetailModalProps {
  poiId: string;
  onClose: () => void;
}

const renderStars = (rating: number) => {
    const stars = [];
    for (let i = 1; i <= 5; i++) {
      stars.push(
        <Star
          key={i}
          className={`h-5 w-5 ${i <= rating ? 'text-accent fill-accent' : 'text-muted-foreground'}`}
        />
      );
    }
    return stars;
  };

export function POIDetailModal({ poiId, onClose }: POIDetailModalProps) {
  const [poi, setPoi] = useState<POI | null>(null);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [loading, setLoading] = useState(true);
  const { userLocation, loading: geoLoading } = useGeolocation();

  useEffect(() => {
    if (!poiId) return;

    async function loadData() {
      setLoading(true);
      try {
        const [poiData, reviewsData] = await Promise.all([
          fetchPoiById(poiId),
          fetchReviewsByPoiId(poiId),
        ]);
        if (poiData) {
            setPoi(poiData);
            setReviews(reviewsData);
        } else {
            onClose(); // Close if POI not found
        }
      } catch (error) {
        console.error("Erreur lors du chargement des détails du POI:", error);
        onClose();
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, [poiId, onClose]);
  
  const handleReviewAdded = (newReview: Review) => {
    setReviews(prevReviews => [newReview, ...prevReviews]);
    // Also update POI average rating and count for immediate UI feedback
    if (poi) {
        const oldRatingTotal = poi.averageRating * poi.reviewCount;
        const newReviewCount = poi.reviewCount + 1;
        const newAverageRating = (oldRatingTotal + newReview.rating) / newReviewCount;
        setPoi({
            ...poi,
            reviewCount: newReviewCount,
            averageRating: newAverageRating
        });
    }
  };

  return (
    <Dialog open={!!poiId} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent className="max-w-3xl h-[90vh] flex flex-col p-0 gap-0">
        {loading || !poi ? (
           <div className="p-6">
                <Skeleton className="h-8 w-1/2 mb-4" />
                <Skeleton className="h-5 w-1/3 mb-6" />
                <Skeleton className="h-40 w-full" />
           </div>
        ) : (
          <>
            <DialogHeader className="p-6 pb-4">
              <DialogTitle className="text-3xl font-bold tracking-tight">{poi.title}</DialogTitle>
              <div className="flex items-center gap-4 pt-2">
                    <div className="flex items-center">
                        {renderStars(poi.averageRating)}
                    </div>
                    <span className="text-muted-foreground text-sm">
                        ({poi.reviewCount} {poi.reviewCount <= 1 ? 'avis' : 'avis'})
                    </span>
                    {!geoLoading && userLocation && (
                        <Badge variant="secondary">
                            {getDistance(userLocation.lat, userLocation.lng, poi.location.lat, poi.location.lng).toFixed(2)} km
                        </Badge>
                    )}
                </div>
            </DialogHeader>
            <ScrollArea className="flex-1">
                <div className="px-6 pb-6 space-y-6">
                    <p className="text-muted-foreground">{poi.description}</p>
                    <POIGallery poi={poi} />
                    <POIReviews poiId={poi.id} initialReviews={reviews} onReviewAdded={handleReviewAdded} />
                </div>
            </ScrollArea>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
