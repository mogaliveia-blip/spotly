'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { Eye, PlusCircle, Navigation } from 'lucide-react';
import { Suspense, useEffect, useState } from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import { AppLayout } from '@/components/layout/app-layout';
import { useAuth } from '@/hooks/use-auth-user';
import { fetchPois } from '@/lib/data';
import type { POI } from '@/lib/types';
import { useGeolocation } from '@/providers/geolocation-provider';
import { getDistance } from '@/lib/utils';


function POIsTable() {
  const [pois, setPois] = useState<POI[]>([]);
  const [loading, setLoading] = useState(true);
  const { userLocation, loading: geoLoading } = useGeolocation();

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

  if (loading) {
    return <Skeleton className="h-[300px] w-full" />;
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Titre</TableHead>
          <TableHead className="hidden md:table-cell">Description</TableHead>
          <TableHead className="hidden sm:table-cell">Distance</TableHead>
          <TableHead>Actions</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {pois.map((poi) => (
          <TableRow key={poi.id}>
            <TableCell className="font-medium">{poi.title}</TableCell>
            <TableCell className="hidden md:table-cell truncate max-w-sm">{poi.description}</TableCell>
            <TableCell className="hidden sm:table-cell">
              {userLocation ? (
                <div className="flex items-center gap-2">
                    <Navigation className="h-4 w-4 text-muted-foreground" />
                    <span>
                        {`${getDistance(userLocation.lat, userLocation.lng, poi.location.lat, poi.location.lng).toFixed(2)} km`}
                    </span>
                </div>
              ) : geoLoading ? (
                <Skeleton className="h-4 w-20" />
              ) : (
                'N/A'
              )}
            </TableCell>
            <TableCell>
              <Button asChild variant="outline" size="sm">
                <Link href={`/pois/${poi.id}`}>
                  <Eye className="mr-2 h-4 w-4" />
                  Voir
                </Link>
              </Button>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}


export default function POIsPage() {
    const { role } = useAuth();
    const canAddPoi = role === 'admin' || role === 'editor';

    return (
        <AppLayout>
            <div className="space-y-6">
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between">
                    <div>
                        <CardTitle>Points d'intérêt</CardTitle>
                        <CardDescription>Parcourez et gérez tous les POIs disponibles.</CardDescription>
                    </div>
                    {canAddPoi && (
                        <Button asChild>
                            <Link href="/pois/new">
                            <PlusCircle className="mr-2 h-4 w-4" />
                            Ajouter un POI
                            </Link>
                        </Button>
                    )}
                    </CardHeader>
                    <CardContent>
                        <Suspense fallback={<Skeleton className="h-[300px] w-full" />}>
                            <POIsTable />
                        </Suspense>
                    </CardContent>
                </Card>
            </div>
        </AppLayout>
    );
}
