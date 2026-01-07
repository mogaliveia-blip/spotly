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
import { Eye, PlusCircle, Edit, Trash2, MapPin } from 'lucide-react';
import { Suspense, useEffect, useState } from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import { AppLayout } from '@/components/layout/app-layout';
import { useAuth } from '@/hooks/use-auth-user';
import { fetchPois, deletePoi } from '@/lib/data';
import type { POI } from '@/lib/types';
import { useRouter } from 'next/navigation';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import Image from 'next/image';


function POIsTable() {
  const [pois, setPois] = useState<POI[]>([]);
  const [loading, setLoading] = useState(true);
  const router = useRouter();
  const { toast } = useToast();
  const { role } = useAuth();
  const canManagePois = role === 'admin' || role === 'editor';

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
    router.push(`/pois/edit/${poiId}`);
  };

  const handleDelete = (poiId: string) => {
    try {
      deletePoi(poiId);
      setPois(pois.filter(p => p.id !== poiId));
      toast({
        title: "POI supprimé",
        description: "Le point d'intérêt a été supprimé avec succès."
      })
    } catch (error) {
       toast({
        title: "Erreur",
        description: "Impossible de supprimer le POI.",
        variant: "destructive"
      })
    }
  };


  if (loading) {
    return <Skeleton className="h-[300px] w-full" />;
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-[80px]">Image</TableHead>
          <TableHead>Titre</TableHead>
          <TableHead className="hidden md:table-cell">Description</TableHead>
          <TableHead className="hidden sm:table-cell">Avis</TableHead>
          <TableHead className="text-right">Actions</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {pois.map((poi) => (
          <TableRow key={poi.id}>
            <TableCell>
              <div className="relative h-12 w-12 rounded-md overflow-hidden border">
                {poi.headerPhotoUrl ? (
                  <Image src={poi.headerPhotoUrl} alt={poi.title} fill className="object-cover" />
                ) : (
                  <div className="h-full w-full bg-muted flex items-center justify-center text-muted-foreground">
                    <MapPin className="h-6 w-6"/>
                  </div>
                )}
              </div>
            </TableCell>
            <TableCell className="font-medium">{poi.title}</TableCell>
            <TableCell className="hidden md:table-cell truncate max-w-sm">{poi.description}</TableCell>
            <TableCell className="hidden sm:table-cell">
                <Badge variant={poi.reviewCount > 0 ? "default" : "secondary"}>
                    {poi.reviewCount} avis
                </Badge>
            </TableCell>
            <TableCell className="flex gap-2 justify-end">
              <Button variant="outline" size="icon" onClick={() => handleViewClick(poi.id)}>
                <Eye className="h-4 w-4" />
                <span className="sr-only">Voir</span>
              </Button>
              {canManagePois && (
                <>
                  <Button variant="outline" size="icon" onClick={() => handleEditClick(poi.id)}>
                    <Edit className="h-4 w-4" />
                    <span className="sr-only">Modifier</span>
                  </Button>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button variant="destructive" size="icon">
                        <Trash2 className="h-4 w-4" />
                        <span className="sr-only">Supprimer</span>
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Êtes-vous sûr ?</AlertDialogTitle>
                        <AlertDialogDescription>
                          Cette action est irréversible. Le POI "{poi.title}" sera définitivement supprimé.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Annuler</AlertDialogCancel>
                        <AlertDialogAction onClick={() => handleDelete(poi.id)}>Supprimer</AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </>
              )}
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
