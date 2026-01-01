'use client';

import { useEffect, useState } from 'react';
import type { POI } from '@/lib/types';
import { fetchPois } from '@/lib/data';
import { useGeolocation } from '@/providers/geolocation-provider';
import { getDistance } from '@/lib/utils';
import { cn } from '@/lib/utils';
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { Navigation, PlusCircle } from 'lucide-react';
import Link from 'next/link';
import { useAuth } from '@/hooks/use-auth-user';

interface POIListProps {
  selectedPoiId: string | null;
  onSelectPoi: (poi: POI) => void;
}

export function POIList({ selectedPoiId, onSelectPoi }: POIListProps) {
  const [pois, setPois] = useState<POI[]>([]);
  const [loading, setLoading] = useState(true);
  const { userLocation, loading: geoLoading } = useGeolocation();
  const { role } = useAuth();
  const canAddPoi = role === 'admin' || role === 'editor';

  useEffect(() => {
    async function getPois() {
      try {
        const poiData = await fetchPois();
        setPois(poiData);
      } catch (error) {
        console.error("Impossible de récupérer les POIs", error);
      } finally {
        setLoading(false);
      }
    }
    getPois();
  }, []);

  return (
    <Card className="w-full md:w-80 lg:w-96 h-full flex flex-col rounded-none border-0 border-r">
        <CardHeader className="flex flex-row items-center justify-between">
            <div>
                <CardTitle>Explorer</CardTitle>
                <CardDescription>Sélectionnez un lieu à voir.</CardDescription>
            </div>
            {canAddPoi && (
            <Button asChild size="sm">
                <Link href="/pois/new">
                <PlusCircle className="mr-2 h-4 w-4" />
                Ajouter
                </Link>
            </Button>
            )}
      </CardHeader>
      <CardContent className="p-0 flex-1">
        <ScrollArea className="h-full">
            <div className="p-2 space-y-2">
            {loading
                ? Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-20 w-full" />)
                : pois.map((poi) => (
                    <button
                        key={poi.id}
                        onClick={() => onSelectPoi(poi)}
                        className={cn(
                        'w-full text-left p-3 rounded-lg border transition-colors',
                        selectedPoiId === poi.id
                            ? 'bg-primary/10 border-primary'
                            : 'hover:bg-muted/50'
                        )}
                    >
                        <h3 className="font-semibold">{poi.title}</h3>
                        <p className="text-sm text-muted-foreground line-clamp-2">{poi.description}</p>
                        {userLocation ? (
                            <div className="flex items-center gap-2 mt-2 text-xs text-muted-foreground">
                                <Navigation className="h-3 w-3" />
                                <span>
                                    {`${getDistance(userLocation.lat, userLocation.lng, poi.location.lat, poi.location.lng).toFixed(2)} km`}
                                </span>
                            </div>
                        ) : geoLoading ? (
                            <Skeleton className="h-4 w-20 mt-2" />
                        ) : null}
                    </button>
                ))}
            </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
