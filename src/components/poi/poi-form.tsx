// src/components/poi/poi-form.tsx
'use client';

import { useForm, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { createPoi, updatePoi, fetchPoiById, uploadFile, deleteFileByPath } from '@/lib/data';
import { useRouter } from 'next/navigation';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../ui/card';
import { APIProvider, Map, AdvancedMarker, useMap } from '@vis.gl/react-google-maps';
import { useState, useEffect } from 'react';
import { Loader2, MapPin, Crosshair, ImagePlus, X } from 'lucide-react';
import type { POI } from '@/lib/types';
import { useGeolocation } from '@/providers/geolocation-provider';
import { Skeleton } from '../ui/skeleton';
import { mapsConfig } from '@/lib/firebase-config';
import Image from 'next/image';

const formSchema = z.object({
  title: z.string().min(3, { message: 'Le titre doit comporter au moins 3 caractères.' }),
  description: z.string().min(10, { message: 'La description doit comporter au moins 10 caractères.' }),
  location: z.object({
    lat: z.number(),
    lng: z.number(),
  }),
  headerPhotoUrl: z.string().optional(),
  galleryUrls: z.array(z.object({
    url: z.string(),
    path: z.string(),
  })).optional(),
});

type POIFormValues = z.infer<typeof formSchema>;

interface POIFormProps {
  poiId?: string;
}

function MapController() {
  const { userLocation } = useGeolocation();
  const mapRef = useMap();

  const handleRecenter = () => {
    if (mapRef && userLocation) {
        mapRef.panTo(userLocation);
        mapRef.setZoom(14);
    }
  };

  return (
    <>
      {userLocation && (
        <div className="absolute bottom-4 left-4 z-10">
          <Button size="icon" onClick={handleRecenter} type="button" title="Recentrer sur ma position">
            <Crosshair className="h-5 w-5" />
          </Button>
        </div>
      )}
    </>
  );
}

export function POIForm({ poiId }: POIFormProps) {
  const router = useRouter();
  const { toast } = useToast();
  const [formIsLoading, setFormIsLoading] = useState(false);
  const [pageIsLoading, setPageIsLoading] = useState(true);
  const { userLocation, loading: geoLoading } = useGeolocation();
  
  const isEditMode = !!poiId;
  const fallbackCenter = { lat: 48.8566, lng: 2.3522 }; // Paris

  const form = useForm<POIFormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      title: '',
      description: '',
      location: userLocation || fallbackCenter,
      headerPhotoUrl: '',
      galleryUrls: [],
    },
  });

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: 'galleryUrls'
  });

  const selectedLocation = form.watch('location');
  const headerPhotoUrl = form.watch('headerPhotoUrl');

  // Local state for file previews
  const [headerImageFile, setHeaderImageFile] = useState<File | null>(null);
  const [headerPreviewUrl, setHeaderPreviewUrl] = useState<string | null>(null);
  const [galleryImageFiles, setGalleryImageFiles] = useState<File[]>([]);


  useEffect(() => {
    async function getPoi() {
      if (poiId) {
        setPageIsLoading(true);
        try {
          const poiData = await fetchPoiById(poiId);
          if (poiData) {
            form.reset(poiData);
          } else {
             toast({ title: "Erreur", description: "POI non trouvé.", variant: "destructive" });
             router.push('/pois');
          }
        } catch (error) {
          console.error("Impossible de récupérer le POI", error);
          toast({ title: "Erreur", description: "Impossible de charger les données du POI.", variant: "destructive" });
        } finally {
          setPageIsLoading(false);
        }
      } else {
        if (userLocation) form.setValue('location', userLocation);
        setPageIsLoading(false);
      }
    }
    
    if(!geoLoading) getPoi();
  }, [poiId, form, router, toast, geoLoading, userLocation]);

  useEffect(() => {
    if (!headerImageFile) {
      setHeaderPreviewUrl(null);
      return;
    }
    const previewUrl = URL.createObjectURL(headerImageFile);
    setHeaderPreviewUrl(previewUrl);
    
    // Cleanup function to revoke the object URL
    return () => URL.revokeObjectURL(previewUrl);
  }, [headerImageFile]);


  async function onSubmit(values: POIFormValues) {
    setFormIsLoading(true);
    try {
      let poiIdToUpdate = poiId;
  
      // 1. Create POI document if in creation mode
      if (!isEditMode) {
        const newPoiData: Omit<POI, 'id'> = {
          title: values.title,
          description: values.description,
          location: values.location,
          headerPhotoUrl: '',
          galleryUrls: [],
          averageRating: 0,
          reviewCount: 0,
        };
        poiIdToUpdate = await createPoi(newPoiData);
      }
  
      if (!poiIdToUpdate) {
        throw new Error('ID du POI manquant.');
      }
  
      // 2. Upload header image if a new one is selected
      let finalHeaderUrl = values.headerPhotoUrl || '';
      if (headerImageFile) {
        const headerPath = `poi-images/${poiIdToUpdate}/header.jpg`;
        const { url } = await uploadFile(headerImageFile, headerPath);
        finalHeaderUrl = url;
      }
  
      // 3. Upload new gallery images
      const existingGallery = values.galleryUrls ?? [];
      const newGalleryUploads = await Promise.all(
        galleryImageFiles.map(file => {
          const uniquePath = `poi-images/${poiIdToUpdate}/gallery/${crypto.randomUUID()}`;
          return uploadFile(file, uniquePath);
        })
      );
      const finalGalleryUrls = [...existingGallery, ...newGalleryUploads];
  
      // 4. Update Firestore with all data
      await updatePoi(poiIdToUpdate, {
        title: values.title,
        description: values.description,
        location: values.location,
        headerPhotoUrl: finalHeaderUrl,
        galleryUrls: finalGalleryUrls,
      });
  
      toast({
        title: isEditMode ? 'POI mis à jour !' : 'POI créé !',
        description: `${values.title} a été sauvegardé.`,
      });
      router.refresh();
      router.push('/pois');
  
    } catch (error) {
      console.error('Erreur lors de la sauvegarde du POI', error);
      toast({
        title: 'Erreur',
        description: `Impossible de ${isEditMode ? 'mettre à jour' : 'créer'} le POI.`,
        variant: 'destructive',
      });
      setFormIsLoading(false); // Make sure to unlock form on error
    }
  }


  const handleGalleryFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files) {
      setGalleryImageFiles(Array.from(event.target.files));
    }
  };

  const handleRemoveGalleryImage = async (index: number, path: string) => {
    try {
      await deleteFileByPath(path);
      remove(index);
      toast({ title: 'Image supprimée', description: 'Image retirée de la galerie.' });
    } catch (error) {
      toast({ title: 'Erreur', description: 'Impossible de supprimer l\'image.', variant: 'destructive'});
    }
  }

  if (pageIsLoading || geoLoading) {
    return (
      <div className="space-y-8">
          <Skeleton className="h-10 w-32 ml-auto" />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <Skeleton className="h-96 w-full" />
            <Skeleton className="h-96 w-full" />
        </div>
      </div>
    );
  }

  return (
    <APIProvider apiKey={mapsConfig.apiKey}>
        <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            
            {/* Colonne 1: Détails & Galerie */}
            <div className="lg:col-span-2 space-y-6">
                <Card>
                  <CardHeader><CardTitle>Détails du POI</CardTitle></CardHeader>
                  <CardContent className="space-y-4">
                      <FormField control={form.control} name="title" render={({ field }) => (
                          <FormItem>
                          <FormLabel>Titre</FormLabel>
                          <FormControl><Input placeholder="Ex : Scène principale" {...field} /></FormControl>
                          <FormMessage />
                          </FormItem>
                      )} />
                      <FormField control={form.control} name="description" render={({ field }) => (
                          <FormItem>
                          <FormLabel>Description</FormLabel>
                          <FormControl><Textarea placeholder="Une brève description du point d'intérêt." {...field} rows={5} /></FormControl>
                          <FormMessage />
                          </FormItem>
                      )} />
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>Image d'en-tête</CardTitle>
                    <CardDescription>Cette image sera affichée en grand sur la page du POI.</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <FormField control={form.control} name="headerPhotoUrl" render={() => (
                      <FormItem>
                        <FormControl>
                          <Input type="file" accept="image/*" onChange={(e) => setHeaderImageFile(e.target.files?.[0] || null)} className="hidden" id="header-upload" />
                        </FormControl>
                        <div className="relative aspect-video w-full border-2 border-dashed rounded-lg flex items-center justify-center">
                          {(headerPreviewUrl || headerPhotoUrl) ? (
                            <Image src={headerPreviewUrl || headerPhotoUrl!} alt="Aperçu de l'en-tête" fill className="object-cover rounded-lg" />
                          ) : (
                            <label htmlFor="header-upload" className="cursor-pointer text-center text-muted-foreground p-4">
                              <ImagePlus className="mx-auto h-12 w-12" />
                              <p>Cliquez pour ajouter une image</p>
                            </label>
                          )}
                        </div>
                      </FormItem>
                    )} />
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>Galerie d'images</CardTitle>
                    <CardDescription>Ajoutez des images supplémentaires pour illustrer le POI.</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
                      {fields.map((field, index) => (
                        <div key={field.id} className="relative aspect-square group">
                           <Image src={field.url} alt={`Galerie ${index+1}`} fill className="object-cover rounded-md border" />
                           <Button type="button" variant="destructive" size="icon" className="absolute top-1 right-1 h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity" onClick={() => handleRemoveGalleryImage(index, field.path)}>
                              <X className="h-4 w-4" />
                           </Button>
                        </div>
                      ))}
                       <label htmlFor="gallery-upload" className="cursor-pointer aspect-square border-2 border-dashed rounded-lg flex flex-col items-center justify-center text-muted-foreground hover:bg-accent/50">
                          <ImagePlus className="h-8 w-8" />
                          <span className="text-xs text-center mt-1">Ajouter</span>
                       </label>
                       <Input id="gallery-upload" type="file" multiple accept="image/*" className="hidden" onChange={handleGalleryFileChange} />
                    </div>
                    {galleryImageFiles.length > 0 && (
                      <p className="text-sm text-muted-foreground mt-2">{galleryImageFiles.length} nouvelle(s) image(s) prête(s) à être uploadée(s).</p>
                    )}
                  </CardContent>
                </Card>

            </div>

            {/* Colonne 2: Emplacement */}
            <div className="lg:col-span-1 space-y-6">
                <Card>
                    <CardHeader><CardTitle>Emplacement</CardTitle></CardHeader>
                    <CardContent className="relative">
                        <FormLabel>Cliquez sur la carte pour définir l'emplacement</FormLabel>
                        <div className="h-[400px] w-full overflow-hidden rounded-lg border mt-2">
                                <Map
                                    defaultCenter={form.getValues('location')}
                                    defaultZoom={13}
                                    gestureHandling={'greedy'}
                                    disableDefaultUI={false}
                                    mapId={process.env.NEXT_PUBLIC_GOOGLE_MAP_ID}
                                    onClick={(e) => {
                                        if (e.detail.latLng) {
                                            form.setValue('location', e.detail.latLng, { shouldValidate: true });
                                        }
                                    }}
                                >
                                    <AdvancedMarker position={selectedLocation}>
                                        <div className="text-primary">
                                            <MapPin size={36} />
                                        </div>
                                    </AdvancedMarker>
                                    <MapController />
                                </Map>
                        </div>
                        <FormMessage>{form.formState.errors.location?.message}</FormMessage>
                    </CardContent>
                </Card>
            </div>
            </div>

            <Button type="submit" disabled={formIsLoading} size="lg">
              {formIsLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {isEditMode ? 'Mettre à jour le POI' : 'Créer le POI'}
            </Button>
        </form>
        </Form>
    </APIProvider>
  );
}
