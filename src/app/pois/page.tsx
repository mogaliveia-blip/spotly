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
import { Eye, PlusCircle, Edit, Trash2 } from 'lucide-react';
import { Suspense, useEffect, useState } from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import { AppLayout } from '@/components/layout/app-layout';
import { useAuth } from '@/hooks/use-auth-user';
import { fetchPois } from '@/lib/data';
import type { POI } from '@/lib/types';
import { useRouter } from 'next/navigation';
import { Badge } from '@/components/ui/badge';


function POIsTable() {
  const [pois, setPois] = useState<POI[]>([]);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

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

  const handleViewClick = (poiId: string) => {
    router.push(`/dashboard?poi=${poiId}`);
  };
  
  const handleEditClick = (poiId: string) => {
    // Rediriger vers une page d'édition (à créer)
    // router.push(`/pois/edit/${poiId}`);
    console.log(`Edit POI ${poiId}`);
  };

  const handleDeleteClick = (poiId: string) => {
    // Implémenter la logique de suppression avec confirmation
    console.log(`Delete POI ${poiId}`);
  };


  if (loading) {
    return <Skeleton className="h-[300px] w-full" />;
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Titre</TableHead>
          <TableHead className="hidden md:table-cell">Description</TableHead>
          <TableHead className="hidden sm:table-cell">Avis</TableHead>
          <TableHead>Actions</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {pois.map((poi) => (
          <TableRow key={poi.id}>
            <TableCell className="font-medium">{poi.title}</TableCell>
            <TableCell className="hidden md:table-cell truncate max-w-sm">{poi.description}</TableCell>
            <TableCell className="hidden sm:table-cell">
                <Badge variant={poi.reviewCount > 0 ? "default" : "secondary"}>
                    {poi.reviewCount} avis
                </Badge>
            </TableCell>
            <TableCell className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => handleViewClick(poi.id)}>
                <Eye className="h-4 w-4" />
              </Button>
               <Button variant="outline" size="sm" onClick={() => handleEditClick(poi.id)}>
                <Edit className="h-4 w-4" />
              </Button>
               <Button variant="destructive" size="sm" onClick={() => handleDeleteClick(poi.id)}>
                <Trash2 className="h-4 w-4" />
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
    const canManagePois = role === 'admin' || role === 'editor';

    return (
        <AppLayout>
            <div className="space-y-6">
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between">
                    <div>
                        <CardTitle>Gérer les Points d'intérêt</CardTitle>
                        <CardDescription>Ajoutez, modifiez ou supprimez des POIs.</CardDescription>
                    </div>
                    {canManagePois && (
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
