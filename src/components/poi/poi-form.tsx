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
import { createPoi } from '@/lib/data';
import { useRouter } from 'next/navigation';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Map, AdvancedMarker, useMap } from '@vis.gl/react-google-maps';
import { useState, useEffect } from 'react';
import { Loader2, MapPin, Crosshair } from 'lucide-react';
import type { POI } from '@/lib/types';
import { useGeolocation } from '@/providers/geolocation-provider';
import { Skeleton } from '../ui/skeleton';

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
  poi?: POI;
}

function MapController({ onRecenter }: { onRecenter: () => void }) {
    const { userLocation } = useGeolocation();
    return (
      <>
        {userLocation && (
          <div className="absolute bottom-4 left-4 z-10">
            <Button size="icon" onClick={onRecenter} type="button" title="Recentrer sur ma position">
              <Crosshair className="h-5 w-5" />
            </Button>
          </div>
        )}
      </>
    );
  }

export function POIForm({ poi }: POIFormProps) {
  const router = useRouter();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const { userLocation, loading: geoLoading } = useGeolocation();
  const fallbackCenter = { lat: 48.8566, lng: 2.3522 }; // Paris
  const map = useMap();

  const form = useForm<POIFormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      title: poi?.title || '',
      description: poi?.description || '',
      location: poi?.location || userLocation || fallbackCenter,
    },
  });

  const selectedLocation = form.watch('location');

  useEffect(() => {
    // Si nous avons la localisation de l'utilisateur et que le formulaire est toujours sur la valeur par défaut de Paris, mettez à jour.
    if (userLocation && form.getValues('location').lat === fallbackCenter.lat && form.getValues('location').lng === fallbackCenter.lng) {
      form.setValue('location', userLocation);
    }
  }, [userLocation, form, fallbackCenter]);


  async function onSubmit(values: POIFormValues) {
    setLoading(true);
    try {
      const poiData = { 
        ...values, 
        headerPhotoUrl: '',
        headerPhotoHint: '',
        galleryUrls: [] 
      };
      createPoi(poiData);
      
      toast({
        title: 'POI créé !',
        description: `${values.title} a été ajouté à la carte.`,
      });
      router.push('/dashboard');
      router.refresh(); 
    } catch (error) {
      toast({
        title: 'Erreur',
        description: 'Impossible de créer le POI. Veuillez réessayer.',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }
  
  const mapCenter = userLocation || poi?.location || fallbackCenter;

  const handleRecenter = () => {
    if (map && userLocation) {
      map.panTo(userLocation);
      map.setZoom(14);
    }
  };

  return (
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
                        {geoLoading ? (
                            <Skeleton className="h-full w-full" />
                        ) : (
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
                                <MapController onRecenter={handleRecenter} />
                            </Map>
                        )}
                    </div>
                     <FormMessage>{form.formState.errors.location?.message}</FormMessage>
                </CardContent>
            </Card>
          </div>
        </div>

        <Button type="submit" disabled={loading}>
          {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Créer un POI
        </Button>
      </form>
    </Form>
  );
}
