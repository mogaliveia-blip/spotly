// src/components/poi/poi-reviews.tsx
'use client';

import { useState } from 'react';
import type { Review } from '@/lib/types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ReviewForm } from './review-form';
import { ReviewList } from './review-list';

interface POIReviewsProps {
  poiId: string;
  initialReviews: Review[];
}

export function POIReviews({ poiId, initialReviews }: POIReviewsProps) {
  const [reviews, setReviews] = useState<Review[]>(initialReviews);

  const handleReviewAdded = (newReview: Review) => {
    // Optimistically add the new review to the top of the list
    setReviews(prevReviews => [newReview, ...prevReviews]);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Avis</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <ReviewForm poiId={poiId} onReviewAdded={handleReviewAdded} />
        <ReviewList reviews={reviews} />
      </CardContent>
    </Card>
  );
}
