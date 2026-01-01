// src/components/poi/poi-detail-header.tsx
'use client';
import type { POI } from '@/lib/types';
import Image from 'next/image';
import { Card, CardContent } from '@/components/ui/card';
import { Star } from 'lucide-react';
import { POIMap } from './poi-map';

interface POIDetailHeaderProps {
  poi: POI;
}

export function POIDetailHeader({ poi }: POIDetailHeaderProps) {
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
            <div className="flex items-center gap-2">
                <div className="flex items-center">
                    {renderStars(poi.averageRating)}
                </div>
                <span className="text-muted-foreground text-sm">
                    ({poi.reviewCount} {poi.reviewCount === 1 ? 'avis' : 'avis'})
                </span>
            </div>
            
          </div>
          <div className="h-[300px] md:h-full w-full min-h-[200px]">
            <POIMap pois={[poi]} />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
