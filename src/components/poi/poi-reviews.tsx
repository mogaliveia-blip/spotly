'use client';

import { useState } from 'react';
import type { Review } from '@/lib/types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ReviewForm } from './review-form';
import { ReviewList } from './review-list';

interface POIReviewsProps {
  poiId: string;
  initialReviews: Review[];
  onReviewAdded: (review: Review) => void;
}

export function POIReviews({ poiId, initialReviews, onReviewAdded }: POIReviewsProps) {

  return (
    <Card>
      <CardHeader>
        <CardTitle>Avis</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <ReviewForm poiId={poiId} onReviewAdded={onReviewAdded} />
        <ReviewList reviews={initialReviews} />
      </CardContent>
    </Card>
  );
}
