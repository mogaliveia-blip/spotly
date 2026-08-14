'use client'

import type { POI, POILite, Review, AppConfig } from '@/lib/types';
import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { fetchReviewsByPoiId, fetchAppConfig } from '@/lib/data';
import { useAuth } from '@/hooks/use-auth-user';
import Image from 'next/image';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { AuthDialog } from '@/components/auth/auth-dialog';
import { ReviewForm } from './review-form';
import { ReviewList } from './review-list';
import { POIGallery } from './poi-gallery';
import { ImageViewer } from './image-viewer';
import { getDistance } from '@/lib/utils';
import { useGeolocation } from '@/providers/geolocation-provider';
import { Navigation, Share2 } from 'lucide-react';
import { SponsorBadge } from '../sponsor/sponsor-badge';
import { isSponsorActive } from '@/lib/sponsor-utils';
import { useEvent } from '@/providers/event-provider';
import { useToast } from '@/hooks/use-toast';
import { buildPoiShareUrl, canSharePoi } from '@/lib/poi-sharing';

type POIAny = POILite | POI;
const REVIEWS_CONFIG_TIMEOUT_MS = 3000;

interface POIDetailsProps {
  poi: POIAny;
}

function isFullPoi(poi: POIAny): poi is POI {
  return (
    typeof (poi as any)?.description === 'string' &&
    Array.isArray((poi as any)?.galleryUrls)
  );
}

async function copyTextWithFallback(text: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }

  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.setAttribute('readonly', '');
  textarea.style.position = 'fixed';
  textarea.style.top = '-9999px';
  textarea.style.left = '-9999px';
  document.body.appendChild(textarea);
  textarea.select();

  try {
    const copied = document.execCommand('copy');
    if (!copied) throw new Error('COPY_COMMAND_FAILED');
  } finally {
    document.body.removeChild(textarea);
  }
}

export function POIDetails({ poi: initialPoi }: POIDetailsProps) {
  const [poi, setPoi] = useState<POIAny>(initialPoi);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [reviewsLoading, setReviewsLoading] = useState(false);
  const [reviewsEnabled, setReviewsEnabled] = useState(true);
  const [shareLoading, setShareLoading] = useState(false);
  
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);

  const { user } = useAuth();
  const { userLocation } = useGeolocation();
  const { eventId, event, userRole } = useEvent();
  const { toast } = useToast();
  const lastPoiIdRef = useRef<string | null>(null);
  const viewerPoiIdRef = useRef<string | null>(initialPoi.id);

  const full = isFullPoi(poi);
  const shareAllowed = canSharePoi(event);
  const showUnavailableShare = !!event && !shareAllowed && !!userRole;

  const allImages = useMemo(() => {
    const imgs: string[] = [];
    if (poi.headerPhotoUrl) imgs.push(poi.headerPhotoUrl);
    if (full && (poi as POI).galleryUrls) {
      (poi as POI).galleryUrls.forEach(g => imgs.push(g.url));
    }
    return imgs;
  }, [poi.headerPhotoUrl, full, (poi as any).galleryUrls]);

  useEffect(() => {
    let isMounted = true;
    let settled = false;
    const timeoutId = window.setTimeout(() => {
      if (!isMounted || settled) return;
      setReviewsEnabled(true);
      console.warn('[Reviews Config] Timeout, fallback applied');
    }, REVIEWS_CONFIG_TIMEOUT_MS);

    fetchAppConfig(eventId)
      .then((config: AppConfig) => {
        if (!isMounted) return;
        settled = true;
        window.clearTimeout(timeoutId);
        setReviewsEnabled(config.reviewsEnabled ?? true);
      })
      .catch((error: any) => {
        if (!isMounted) return;
        settled = true;
        window.clearTimeout(timeoutId);
        console.warn('[Reviews Config] Read failed, fallback applied', {
          eventId,
          errorCode: error?.code ?? null,
          errorMessage: error?.message ?? null,
        });
        setReviewsEnabled(true);
      });

    return () => {
      isMounted = false;
      window.clearTimeout(timeoutId);
    };
  }, [eventId]);

  useEffect(() => {
    if (viewerPoiIdRef.current !== initialPoi.id) {
      viewerPoiIdRef.current = initialPoi.id;
      setSelectedIndex(null);
    }

    setPoi(prev => {
      if (!prev) return initialPoi;
      if (isFullPoi(prev) && prev.id === initialPoi.id) return prev;
      return initialPoi;
    });
  
    if (reviewsEnabled !== true) return;
  
    const poiId = initialPoi.id;
    const isSamePoi = lastPoiIdRef.current === poiId;
  
    if (isSamePoi && reviews.length > 0) return;
  
    lastPoiIdRef.current = poiId;
    setReviewsLoading(true);
  
    fetchReviewsByPoiId(poiId, eventId)
      .then(setReviews)
      .catch(err =>
        console.error("Impossible de charger les avis pour le POI", err)
      )
      .finally(() => setReviewsLoading(false));
  }, [initialPoi, reviewsEnabled, reviews.length, eventId]);

  const handleReviewAdded = useCallback((newReview: Review) => {
    setReviews(prev => [newReview, ...prev]);
  }, []);

  const handleShare = useCallback(async () => {
    if (!event || !shareAllowed || typeof window === 'undefined') return;

    const shareUrl = buildPoiShareUrl(event, poi, window.location.origin);
    const shareText = event.name ? `${poi.title} - ${event.name}` : poi.title;

    setShareLoading(true);
    try {
      if (navigator.share) {
        await navigator.share({
          title: poi.title,
          text: shareText,
          url: shareUrl,
        });
        return;
      }

      await copyTextWithFallback(shareUrl);
      toast({ title: 'Lien copié' });
    } catch (error: any) {
      if (error?.name === 'AbortError') return;

      toast({
        title: 'Partage indisponible',
        description: 'Impossible de copier le lien pour le moment.',
        variant: 'destructive',
      });
    } finally {
      setShareLoading(false);
    }
  }, [event, poi, shareAllowed, toast]);

  const mapsUrl = `https://www.google.com/maps/dir/?api=1&destination=${poi.location.lat},${poi.location.lng}&travelmode=walking`;

  return (
    <div className="space-y-6 min-h-[40vh] flex flex-col">
      <div className="relative aspect-video w-full bg-muted/30 rounded-3xl overflow-hidden shadow-sm shrink-0">
        {poi.headerPhotoUrl ? (
          <Image
            src={poi.headerPhotoUrl}
            alt={poi.title}
            fill
            className="object-cover cursor-zoom-in transition-transform hover:scale-105 duration-500"
            onClick={() => setSelectedIndex(0)}
            priority
          />
        ) : (
          <Skeleton className="w-full h-full" />
        )}
      </div>

      <div className="space-y-4 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          {poi?.sponsor && isSponsorActive(poi) && (
            <SponsorBadge sponsor={poi.sponsor} className="px-3 py-1 text-xs" />
          )}
          <h3 className="font-bold text-2xl tracking-tight leading-tight w-full">{poi.title}</h3>
        </div>

        <div className="flex flex-wrap items-center gap-4">
          {userLocation && (
            <div className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground bg-muted/50 px-3 py-1.5 rounded-full">
              <Navigation className="h-3.5 w-3.5" />
              <span>
                {getDistance(
                  userLocation.lat,
                  userLocation.lng,
                  poi.location.lat,
                  poi.location.lng
                ).toFixed(1)} km
              </span>
            </div>
          )}

          <Button asChild size="sm" variant="default" className="shadow-lg rounded-full px-5 h-10 font-bold">
            <a href={mapsUrl} target="_blank" rel="noopener noreferrer">
              <Navigation className="mr-2 h-4 w-4" />
              Itinéraire
            </a>
          </Button>

          {shareAllowed && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="min-h-11 rounded-full px-5 font-bold"
              onClick={() => void handleShare()}
              disabled={shareLoading}
            >
              <Share2 className="mr-2 h-4 w-4" />
              Partager
            </Button>
          )}

          {showUnavailableShare && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="min-h-11 rounded-full px-5 font-bold"
              disabled
              title="Partage indisponible - événement non public"
            >
              <Share2 className="mr-2 h-4 w-4" />
              Partage indisponible - événement non public
            </Button>
          )}
        </div>

        <div className="pt-2 min-h-[80px]">
          {full ? (
            <p className="text-base text-muted-foreground leading-relaxed whitespace-pre-line">{poi.description}</p>
          ) : (
            <div className="space-y-3">
              <Skeleton className="h-4 w-[95%]" />
              <Skeleton className="h-4 w-[88%]" />
              <Skeleton className="h-4 w-[75%]" />
            </div>
          )}
        </div>
      </div>

      {full && (
        <div className="pt-2">
          <POIGallery
            poi={poi}
            onImageClick={(index) => setSelectedIndex(poi.headerPhotoUrl ? index + 1 : index)}
          />
        </div>
      )}

      <div className="h-px bg-border w-full my-6" />

      {reviewsEnabled === true && (
        <div className="space-y-6 pb-6">
          <h4 className="font-bold text-lg tracking-tight">Avis de la communauté</h4>
          
          {user ? (
            <div className="bg-muted/30 p-4 rounded-3xl border border-white/5">
              <ReviewForm poiId={poi.id} reviewsEnabled={reviewsEnabled} onReviewAdded={handleReviewAdded} />
            </div>
          ) : (
            <div className="text-center text-sm text-muted-foreground border rounded-3xl p-6 bg-muted/10">
              <p className="mb-2">Vous souhaitez partager votre expérience ?</p>
              <AuthDialog
                trigger={
                  <Button variant="outline" className="rounded-full font-bold">
                    Connectez-vous pour laisser un avis
                  </Button>
                }
              />
            </div>
          )}

          <div className="pt-2">
            {reviewsLoading ? (
              <div className="space-y-4">
                <Skeleton className="h-24 w-full rounded-2xl" />
                <Skeleton className="h-24 w-full rounded-2xl" />
              </div>
            ) : (
              <ReviewList reviews={reviews} />
            )}
          </div>
        </div>
      )}

      {selectedIndex !== null && (
        <ImageViewer
          images={allImages}
          selectedIndex={selectedIndex}
          onSelect={setSelectedIndex}
          onClose={() => setSelectedIndex(null)}
        />
      )}
    </div>
  );
}
