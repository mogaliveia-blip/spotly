'use client';

import { POIMap } from '@/components/poi/poi-map';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Suspense, useEffect, useState } from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { PlusCircle } from 'lucide-react';
import { useAuth } from '@/hooks/use-auth-user';
import { fetchPois } from '@/lib/data';
import type { POI } from '@/lib/types';

export default function DashboardPage() {
  const { role } = useAuth();
  const [pois, setPois] = useState<POI[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function getPois() {
      try {
        const poiData = await fetchPois();
        setPois(poiData);
      } catch (error) {
        console.error("Failed to fetch POIs", error);
      } finally {
        setLoading(false);
      }
    }
    getPois();
  }, []);

  const canAddPoi = role === 'admin' || role === 'editor';

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Event Map</CardTitle>
            <CardDescription>Explore all points of interest for the event.</CardDescription>
          </div>
          {canAddPoi && (
            <Button asChild>
              <Link href="/pois/new">
                <PlusCircle className="mr-2 h-4 w-4" />
                Add POI
              </Link>
            </Button>
          )}
        </CardHeader>
        <CardContent>
          <Suspense fallback={<Skeleton className="h-[500px] w-full rounded-lg" />}>
            <div className="h-[500px] w-full overflow-hidden rounded-lg border">
                {loading ? <Skeleton className="h-full w-full" /> : <POIMap pois={pois} />}
            </div>
          </Suspense>
        </CardContent>
      </Card>
    </div>
  );
}
