'use client';

import type { POI, Review } from '@/lib/types';
import { Map, AdvancedMarker, InfoWindow, useMap } from '@vis.gl/react-google-maps';
import { useState, useEffect, useCallback } from 'react';
import { MapPin, User, Crosshair, Star } from 'lucide-react';
import { getDistance, cn } from '@/lib/utils';
import { useGeolocation } from '@/providers/geolocation-provider';
import { fetchPois, fetchReviewsByPoiId } from '@/lib/data';
import { Skeleton } from '../ui/skeleton';
import { Card, CardContent } from '../ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '../ui/avatar';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import { ScrollArea } from '../ui/scroll-area';
import { ReviewForm } from './review-form';
import { ReviewList } from './review-list';

function renderStars(rating: number) {
    const stars = [];
    for (let i = 1; i <= 5; i++) {
      stars.push(
        <Star
          key={i}
          className={cn('h-4 w-4', i <= rating ? 'text-accent fill-accent' : 'text-muted-foreground')}
        />
      );
    }
    return stars;
  };

function MapController({ pois, onSelectPoi, selectedPoiId, onPoiUpdate }: { pois: POI[], onSelectPoi: (poi: POI | null) => void, selectedPoiId: string | null, onPoiUpdate: (poi: POI) => void }) {
  const { userLocation } = useGeolocation();
  const map = useMap();
  const selectedPoi = selectedPoiId ? pois.find(p => p.id === selectedPoiId) || null : null;
  const [reviews, setReviews] = useState<Review[]>([]);
  const [reviewsLoading, setReviewsLoading] = useState(false);

  useEffect(() => {
    if (selectedPoi && map) {
      map.panTo(selectedPoi.location);
    }
  }, [selectedPoi, map]);

  useEffect(() => {
    if (selectedPoiId) {
      setReviewsLoading(true);
      fetchReviewsByPoiId(selectedPoiId)
        .then(setReviews)
        .catch(err => console.error("Impossible de charger les avis pour le POI", err))
        .finally(() => setReviewsLoading(false));
    } else {
      setReviews([]);
    }
  }, [selectedPoiId]);

  const handleReviewAdded = useCallback((newReview: Review) => {
    setReviews(prevReviews => [newReview, ...prevReviews]);
    if (selectedPoi) {
      const oldRatingTotal = selectedPoi.averageRating * selectedPoi.reviewCount;
      const newReviewCount = selectedPoi.reviewCount + 1;
      const newAverageRating = (oldRatingTotal + newReview.rating) / newReviewCount;
      const updatedPoi = {
        ...selectedPoi,
        reviewCount: newReviewCount,
        averageRating: newAverageRating,
      };
      onPoiUpdate(updatedPoi);
    }
  }, [selectedPoi, onPoiUpdate]);

  const handleRecenter = () => {
    if (map && userLocation) {
      map.panTo(userLocation);
      map.setZoom(14);
    }
  };

  return (
    <>
      {userLocation && (
        <AdvancedMarker position={userLocation}>
            <div className="text-blue-500 rounded-full bg-white p-1 shadow-lg">
                <User size={24} />
            </div>
        </AdvancedMarker>
      )}

      {pois.map((poi) => (
        <AdvancedMarker
          key={poi.id}
          position={poi.location}
          onClick={() => onSelectPoi(poi)}
        >
          <div className={`transition-transform ${selectedPoi?.id === poi.id ? 'text-accent scale-125' : 'text-primary hover:scale-110'}`}>
            <MapPin size={32} />
          </div>
        </AdvancedMarker>
      ))}

      {selectedPoi && (
        <InfoWindow
          position={selectedPoi.location}
          onCloseClick={() => onSelectPoi(null)}
          pixelOffset={[0, -40]}
          maxWidth={400}
        >
          <ScrollArea className="h-[400px] w-full max-w-sm">
            <div className="p-2 pr-4 space-y-4">
                <div className="space-y-1">
                    <h3 className="font-bold text-lg">{selectedPoi.title}</h3>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <div className="flex items-center gap-1">{renderStars(selectedPoi.averageRating)}</div>
                        <span>({selectedPoi.reviewCount} {selectedPoi.reviewCount !== 1 ? 'avis' : 'avis'})</span>
                    </div>
                    {userLocation && (
                        <p className="text-xs text-muted-foreground font-semibold">
                            À {getDistance(userLocation.lat, userLocation.lng, selectedPoi.location.lat, selectedPoi.location.lng).toFixed(2)} km
                        </p>
                    )}
                    <p className="text-sm text-muted-foreground pt-2">
                        {selectedPoi.description}
                    </p>
                </div>
                
                <ReviewForm poiId={selectedPoi.id} onReviewAdded={handleReviewAdded} />

                <div>
                    <h4 className="font-semibold text-md mb-2">Avis récents</h4>
                    {reviewsLoading ? <Skeleton className="h-20 w-full" /> : (
                        <ReviewList reviews={reviews} />
                    )}
                </div>
            </div>
          </ScrollArea>
        </InfoWindow>
      )}
      {userLocation && (
        <div className="absolute bottom-4 right-4 z-10">
          <Button size="icon" onClick={handleRecenter} type="button" title="Recentrer sur ma position">
            <Crosshair className="h-5 w-5" />
          </Button>
        </div>
      )}
    </>
  );
}

export function POIMap({ selectedPoiId, onSelectPoi, pois, setPois }: { selectedPoiId: string | null; onSelectPoi: (poi: POI | null) => void; pois: POI[]; setPois: React.Dispatch<React.SetStateAction<POI[]>> }) {
    const { userLocation, loading: geoLoading } = useGeolocation();
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        async function getPois() {
            setLoading(true);
            try {
                const poiData = await fetchPois();
                setPois(poiData);
            } catch (error) {
                console.error("Impossible de récupérer les POIs", error);
            } finally {
                setLoading(false);
            }
        }
        if (pois.length === 0) {
            getPois();
        } else {
            setLoading(false);
        }
    }, [pois.length, setPois]);

    const handlePoiUpdate = (updatedPoi: POI) => {
        setPois(currentPois => 
            currentPois.map(p => p.id === updatedPoi.id ? updatedPoi : p)
        );
    }

    const defaultCenter = userLocation || (pois.length > 0 ? pois[0].location : { lat: 48.8566, lng: 2.3522 });

    if (loading || geoLoading) {
        return <Skeleton className="w-full h-full" />;
    }

    return (
        <div className="w-full h-full rounded-lg overflow-hidden border">
            <Map
                defaultCenter={defaultCenter}
                defaultZoom={13}
                gestureHandling={'greedy'}
                disableDefaultUI={false}
                mapId={process.env.NEXT_PUBLIC_GOOGLE_MAP_ID}
                className="w-full h-full"
            >
                <MapController 
                    pois={pois} 
                    onSelectPoi={onSelectPoi} 
                    selectedPoiId={selectedPoiId}
                    onPoiUpdate={handlePoiUpdate} 
                />
            </Map>
        </div>
    )
}
    
