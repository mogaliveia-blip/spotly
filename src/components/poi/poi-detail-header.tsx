'use client';
import type { POI } from '@/lib/types';
import { Card, CardContent } from '@/components/ui/card';
import { Star } from 'lucide-react';
import { POIMap } from './poi-map';
import { useGeolocation } from '@/hooks/use-geolocation';
import { getDistance } from '@/lib/utils';
import { Skeleton } from '../ui/skeleton';

interface POIDetailHeaderProps {
  poi: POI;
}

export function POIDetailHeader({ poi }: POIDetailHeaderProps) {
    const { coordinates: userLocation, loading } = useGeolocation();

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

  return (
    <Card>
      <CardContent className="p-0">
        <div className="grid md:grid-cols-2">
          <div className="p-6 space-y-4">
            <p className="text-muted-foreground">{poi.description}</p>
            <div className="flex items-center gap-4">
                <div className="flex items-center">
                    {renderStars(poi.averageRating)}
                </div>
                <span className="text-muted-foreground text-sm">
                    ({poi.reviewCount} {poi.reviewCount === 1 ? 'avis' : 'avis'})
                </span>
            </div>
            {loading && <Skeleton className="h-5 w-24" />}
            {userLocation && (
                <div className="font-semibold text-sm">
                    À {getDistance(userLocation.lat, userLocation.lng, poi.location.lat, poi.location.lng).toFixed(2)} km de vous
                </div>
            )}
          </div>
          <div className="h-[300px] md:h-full w-full min-h-[200px]">
            <POIMap pois={[poi]} userLocation={userLocation} />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
