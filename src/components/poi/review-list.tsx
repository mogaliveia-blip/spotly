// src/components/poi/review-list.tsx
import type { Review } from '@/lib/types';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Card, CardContent } from '@/components/ui/card';
import { Star } from 'lucide-react';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';

interface ReviewListProps {
  reviews: Review[];
}

export function ReviewList({ reviews }: ReviewListProps) {
  if (reviews.length === 0) {
    return <p className="text-center text-muted-foreground">Aucun avis pour le moment. Soyez le premier à partager votre expérience !</p>;
  }

  const renderStars = (rating: number) => {
    const stars = [];
    for (let i = 1; i <= 5; i++) {
      stars.push(
        <Star
          key={i}
          className={`h-4 w-4 ${i <= rating ? 'text-accent fill-accent' : 'text-muted-foreground'}`}
        />
      );
    }
    return stars;
  };

  return (
    <div className="space-y-4">
      {reviews.map((review) => (
        <Card key={review.id}>
          <CardContent className="p-4 flex gap-4">
            <Avatar>
              <AvatarImage src={review.userPhotoURL || undefined} alt={review.userDisplayName} />
              <AvatarFallback>{review.userDisplayName.charAt(0)}</AvatarFallback>
            </Avatar>
            <div className="flex-1">
              <div className="flex items-center justify-between">
                <span className="font-semibold">{review.userDisplayName}</span>
                <span className="text-xs text-muted-foreground">
                  {format(new Date(review.createdAt), 'PP', { locale: fr })}
                </span>
              </div>
              <div className="flex items-center my-1">{renderStars(review.rating)}</div>
              <p className="text-sm text-muted-foreground">{review.comment}</p>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
