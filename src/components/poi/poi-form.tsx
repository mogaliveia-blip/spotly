'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { createPoi, updatePoi, fetchPoiById } from '@/lib/data';
import { useRouter } from 'next/navigation';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { APIProvider, Map, AdvancedMarker, useMap } from '@vis.gl/react-google-maps';
import { useState, useEffect } from 'react';
import { Loader2, MapPin, Crosshair } from 'lucide-react';
import type { POI } from '@/lib/types';
import { useGeolocation } from '@/providers/geolocation-provider';
import { Skeleton } from '../ui/skeleton';
import { mapsConfig } from '@/lib/firebase-config';

const formSchema = z.object({
  title: z.string().min(3, { message: 'Le titre doit comporter au moins 3 caractères.' }),
  description: z.string().min(10, { message: 'La description doit comporter au moins 10 caractères.' }),
  location: z.object({
    lat: z.number(),
    lng: z.number(),
  }),
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
    },
  });
  
  const selectedLocation = form.watch('location');

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
        // Mode création, utiliser la géolocalisation si disponible
        if (userLocation) {
            form.setValue('location', userLocation);
        }
        setPageIsLoading(false);
      }
    }
    
    // Attendre la fin du chargement de la géoloc pour charger les données
    if(!geoLoading) {
      getPoi();
    }
  }, [poiId, form, router, toast, geoLoading, userLocation]);


  async function onSubmit(values: POIFormValues) {
    setFormIsLoading(true);
    try {
      if (isEditMode) {
        updatePoi(poiId, values);
        toast({
          title: 'POI mis à jour !',
          description: `${values.title} a été mis à jour.`,
        });
      } else {
         const poiData = { 
            ...values, 
            headerPhotoUrl: '',
            headerPhotoHint: '',
            galleryUrls: [],
            averageRating: 0,
            reviewCount: 0,
        };
        createPoi(poiData);
        toast({
          title: 'POI créé !',
          description: `${values.title} a été ajouté à la carte.`,
        });
      }
     
      router.push('/dashboard');
      router.refresh(); 
    } catch (error) {
      toast({
        title: 'Erreur',
        description: `Impossible de ${isEditMode ? 'mettre à jour' : 'créer'} le POI. Veuillez réessayer.`,
        variant: 'destructive',
      });
    } finally {
      setFormIsLoading(false);
    }
  }

  const mapCenter = form.getValues('location');
  
  if (pageIsLoading || geoLoading) {
    return (
      <div className="space-y-8">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          <div className="space-y-6">
            <Card>
              <CardHeader><CardTitle>Détails du POI</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-20 w-full" />
              </CardContent>
            </Card>
          </div>
          <div className="space-y-6">
            <Card>
                <CardHeader><CardTitle>Emplacement</CardTitle></CardHeader>
                <CardContent className="relative">
                    <Skeleton className="h-[400px] w-full" />
                </CardContent>
            </Card>
          </div>
        </div>
        <Skeleton className="h-10 w-32" />
      </div>
    );
  }

  return (
    <APIProvider apiKey={mapsConfig.apiKey}>
        <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div className="space-y-6">
                <Card>
                <CardHeader><CardTitle>Détails du POI</CardTitle></CardHeader>
                <CardContent className="space-y-4">
                    <FormField
                    control={form.control}
                    name="title"
                    render={({ field }) => (
                        <FormItem>
                        <FormLabel>Titre</FormLabel>
                        <FormControl><Input placeholder="Ex : Scène principale" {...field} /></FormControl>
                        <FormMessage />
                        </FormItem>
                    )}
                    />
                    <FormField
                    control={form.control}
                    name="description"
                    render={({ field }) => (
                        <FormItem>
                        <FormLabel>Description</FormLabel>
                        <FormControl><Textarea placeholder="Une brève description du point d'intérêt." {...field} /></FormControl>
                        <FormMessage />
                        </FormItem>
                    )}
                    />
                </CardContent>
                </Card>
            </div>
            <div className="space-y-6">
                <Card>
                    <CardHeader><CardTitle>Emplacement</CardTitle></CardHeader>
                    <CardContent className="relative">
                        <FormLabel>Cliquez sur la carte pour définir l'emplacement</FormLabel>
                        <div className="h-[400px] w-full overflow-hidden rounded-lg border mt-2">
                                <Map
                                    defaultCenter={mapCenter}
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

            <Button type="submit" disabled={formIsLoading}>
            {formIsLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {isEditMode ? 'Mettre à jour le POI' : 'Créer un POI'}
            </Button>
        </form>
        </Form>
    </APIProvider>
  );
}
