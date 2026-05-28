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
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useEvent } from '@/providers/event-provider';

const reviewSchema = z.object({
  rating: z.number().min(1, { message: 'Veuillez sélectionner une note.' }).max(5),
  comment: z.string().min(10, { message: 'Le commentaire doit comporter au moins 10 caractères.' }),
});

type ReviewFormValues = z.infer<typeof reviewSchema>;

interface ReviewFormProps {
  poiId: string;
  reviewsEnabled: boolean;
  onReviewAdded: (newReview: Review) => void;
}

export function ReviewForm({ poiId, reviewsEnabled, onReviewAdded }: ReviewFormProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const { eventId } = useEvent();
  const router = useRouter();
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
        title: 'Authentification requise',
        description: 'Vous devez être connecté pour laisser un avis.',
        variant: 'destructive',
      });
      return;
    }

    if (!reviewsEnabled) {
      toast({
        title: 'Avis désactivés',
        description: 'Les avis ne sont pas ouverts pour cet événement.',
        variant: 'destructive',
      });
      return;
    }

    setLoading(true);

    const reviewData = {
      userId: user.uid,
      userName: user.displayName || 'Anonyme',
      ...values
    };

    try {
      const newReview = await addReview(poiId, reviewData, eventId);

      onReviewAdded(newReview);
      form.reset();

      toast({
        title: 'Avis soumis !',
        description: 'Merci pour votre retour.',
      });

      router.refresh();

    } catch (error: any) {
      console.error("🔥 ERREUR FIRESTORE :", error);
      toast({
        title: 'Erreur lors de la soumission de l\'avis',
        description: 'Veuillez réessayer plus tard.',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }

  if (!user) {
    return (
      <div className="text-center text-sm text-muted-foreground border rounded-md p-4">
        <p>Vous souhaitez partager votre expérience ?</p>
        <Button variant="link" asChild className="p-0 h-auto">
          <Link href="/login">Connectez-vous pour laisser un avis.</Link>
        </Button>
      </div>
    );
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        <FormField
          control={form.control}
          name="rating"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Votre note</FormLabel>
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
              <FormLabel>Votre commentaire</FormLabel>
              <FormControl>
                <Textarea
                  placeholder="Partagez votre expérience..."
                  {...field}
                  disabled={loading}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <Button type="submit" disabled={loading || !reviewsEnabled}>
          {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Soumettre l'avis
        </Button>
      </form>
    </Form>
  );
}
