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
import { Eye, PlusCircle, Edit, Trash2, MapPin, Loader2 } from 'lucide-react';
import { Suspense, useEffect, useState, useMemo } from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import { AppLayout } from '@/components/layout/app-layout';
import { useAuth } from '@/hooks/use-auth-user';
import { fetchPois, deletePoi } from '@/lib/data';
import type { POI, MainCategory } from '@/lib/types';
import { categoriesMap } from '@/lib/types';
import { isSponsorActive } from '@/lib/sponsor-utils';
import { useRouter, useParams } from 'next/navigation';
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useEvent } from '@/providers/event-provider';


function POIsTable() {
  const [pois, setPois] = useState<POI[]>([]);
  const [loading, setLoading] = useState(true);
  const router = useRouter();
  const { eventId, loading: eventLoading, userRole } = useEvent();
  const { toast } = useToast();
  const { role: globalRole } = useAuth();
  const params = useParams();
  const eventSlug = params.eventSlug as string;
  const prefix = eventSlug ? `/${eventSlug}` : '';

  const canManagePois = globalRole === 'owner' || userRole === 'admin' || userRole === 'editor';
  const [categoryFilter, setCategoryFilter] = useState<MainCategory | 'all'>('all');

  useEffect(() => {
    if (eventLoading) return;

    async function getPois() {
      try {
        const poiData = await fetchPois(eventId);
        setPois(poiData);
      } catch (error) {
        console.error("Impossible de récupérer les POIs", error);
      } finally {
        setLoading(false);
      }
    }
    getPois();
  }, [eventId, eventLoading]);

  const filteredPois = useMemo(() => {
    return pois.filter(p => categoryFilter === 'all' || p.mainCategory === categoryFilter);
  }, [pois, categoryFilter]);


  const handleViewClick = (poiId: string) => {
    router.push(`${prefix}/dashboard?poi=${poiId}`);
  };
  
  const handleEditClick = (poiId: string) => {
    router.push(`${prefix}/pois/edit/${poiId}`);
  };

  const handleDelete = (poiId: string) => {
    try {
      deletePoi(poiId, eventId);
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


  if (loading || eventLoading) {
    return (
        <div className="space-y-4">
            <div className="flex justify-end">
                <Skeleton className="h-10 w-48" />
            </div>
            <Skeleton className="h-[400px] w-full" />
        </div>
    );
  }

  return (
    <>
      <div className="flex justify-end mb-4">
          <Select value={categoryFilter} onValueChange={(value) => setCategoryFilter(value as any)}>
              <SelectTrigger className="w-full sm:w-[240px]">
                  <SelectValue placeholder="Filtrer par catégorie" />
              </SelectTrigger>
              <SelectContent>
                  <SelectItem value="all">Toutes les catégories</SelectItem>
                  {Object.entries(categoriesMap).map(([key, { label }]) => (
                      <SelectItem key={key} value={key}>{label}</SelectItem>
                  ))}
              </SelectContent>
          </Select>
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-[80px]">Image</TableHead>
            <TableHead>Titre</TableHead>
            <TableHead>Catégorie</TableHead>
            <TableHead>Partenariat</TableHead>
            <TableHead className="hidden md:table-cell">Description</TableHead>
            <TableHead className="hidden sm:table-cell">Avis</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {filteredPois.map((poi) => (
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
              <TableCell>
                <Badge variant="secondary">{poi.mainCategory && categoriesMap[poi.mainCategory] ? categoriesMap[poi.mainCategory].label : 'N/A'}</Badge>
              </TableCell>
              <TableCell>
                {isSponsorActive(poi) ? (
                  <Badge className="bg-amber-500 hover:bg-amber-500">
                    Actif
                  </Badge>
                ) : (
                  <span className="text-muted-foreground">—</span>
                )}
              </TableCell>
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
          {filteredPois.length === 0 && (
            <TableRow>
              <TableCell colSpan={7} className="h-24 text-center text-muted-foreground">
                Aucun point d'intérêt trouvé.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </>
  );
}


export default function POIsPage() {
    const { role: globalRole } = useAuth();
    const { userRole } = useEvent();
    const params = useParams();
    const eventSlug = params.eventSlug as string;
    const prefix = eventSlug ? `/${eventSlug}` : '';
    const canManagePois = globalRole === 'owner' || userRole === 'admin' || userRole === 'editor';

    return (
        <AppLayout>
            <div className="h-full overflow-y-auto p-6">
                <div className="space-y-6">
                    <Card className="rounded-[2rem] border-muted/60 shadow-sm">
                        <CardHeader className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                        <div>
                            <CardTitle className="text-2xl font-bold">Points d'intérêt</CardTitle>
                            <CardDescription>Gérez les lieux et animations de cet événement.</CardDescription>
                        </div>
                        {canManagePois && (
                            <Button asChild className="rounded-xl font-bold">
                                <Link href={`${prefix}/pois/new`}>
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
            </div>
        </AppLayout>
    );
}
