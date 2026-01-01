import { POIMap } from '@/components/poi/poi-map';
import { fetchPois } from '@/lib/data';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Suspense } from 'react';
import { Skeleton } from '@/components/ui/skeleton';

export default async function DashboardPage() {
  const pois = await fetchPois();

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Event Map</CardTitle>
          <CardDescription>Explore all points of interest for the event.</CardDescription>
        </CardHeader>
        <CardContent>
          <Suspense fallback={<Skeleton className="h-[500px] w-full rounded-lg" />}>
            <div className="h-[500px] w-full overflow-hidden rounded-lg border">
                <POIMap pois={pois} />
            </div>
          </Suspense>
        </CardContent>
      </Card>
    </div>
  );
}
