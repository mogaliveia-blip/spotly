// src/components/poi/review-form.tsx
'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Button } from '@/components/ui/button';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Textarea } from '@/components/ui/textarea';
import { Star, Loader2 } from 'lucide-react';
import { useAuth } from '@/hooks/use-auth-user';
import { useToast } from '@/hooks/use-toast';
import { addReview } from '@/lib/data';
import type { Review } from '@/lib/types';

const reviewSchema = z.object({
  rating: z.number().min(1, { message: 'Please select a rating.' }).max(5),
  comment: z.string().min(10, { message: 'Comment must be at least 10 characters.' }),
});

type ReviewFormValues = z.infer<typeof reviewSchema>;

interface ReviewFormProps {
  poiId: string;
  onReviewAdded: (newReview: Review) => void;
}

export function ReviewForm({ poiId, onReviewAdded }: ReviewFormProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [hoverRating, setHoverRating] = useState(0);

  const form = useForm<ReviewFormValues>({
    resolver: zodResolver(reviewSchema),
    defaultValues: { rating: 0, comment: '' },
  });

  const rating = form.watch('rating');

  async function onSubmit(values: ReviewFormValues) {
    if (!user) {
      toast({
        title: 'Authentication required',
        description: 'You must be logged in to leave a review.',
        variant: 'destructive',
      });
      return;
    }
    setLoading(true);
    
    const reviewData = {
        userId: user.uid,
        userDisplayName: user.displayName || 'Anonymous',
        userPhotoURL: user.photoURL || null,
        ...values
    };

    try {
        addReview(poiId, reviewData);
        // Optimistically create the review object for UI update
        const newReview: Review = {
            id: new Date().toISOString(), // Temporary ID
            poiId,
            createdAt: new Date(),
            ...reviewData
        };

        onReviewAdded(newReview);
        form.reset();
        toast({
            title: 'Review submitted!',
            description: 'Thank you for your feedback.',
        });
    } catch (error) {
        toast({
            title: 'Error submitting review',
            description: 'Please try again later.',
            variant: 'destructive',
        });
    } finally {
        setLoading(false);
    }
  }

  if (!user) {
    return <p className="text-center text-muted-foreground">You must be logged in to leave a review.</p>;
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        <FormField
          control={form.control}
          name="rating"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Your Rating</FormLabel>
              <FormControl>
                <div className="flex items-center gap-1">
                  {[1, 2, 3, 4, 5].map((star) => (
                    <Star
                      key={star}
                      className={`h-6 w-6 cursor-pointer ${
                        (hoverRating || rating) >= star
                          ? 'text-accent fill-accent'
                          : 'text-muted-foreground'
                      }`}
                      onMouseEnter={() => setHoverRating(star)}
                      onMouseLeave={() => setHoverRating(0)}
                      onClick={() => field.onChange(star)}
                    />
                  ))}
                </div>
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="comment"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Your Comment</FormLabel>
              <FormControl>
                <Textarea
                  placeholder="Share your experience..."
                  {...field}
                  disabled={loading}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <Button type="submit" disabled={loading}>
          {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Submit Review
        </Button>
      </form>
    </Form>
  );
}
