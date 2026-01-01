'use client';

import { useForm } from 'react-hook-form';
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
import { createPoi } from '@/lib/data';
import { useRouter } from 'next/navigation';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Map, AdvancedMarker } from '@vis.gl/react-google-maps';
import { useState } from 'react';
import { Loader2, MapPin } from 'lucide-react';
import type { POI } from '@/lib/types';

const formSchema = z.object({
  title: z.string().min(3, { message: 'Title must be at least 3 characters.' }),
  description: z.string().min(10, { message: 'Description must be at least 10 characters.' }),
  location: z.object({
    lat: z.number(),
    lng: z.number(),
  }),
  headerPhotoUrl: z.string().url({ message: 'Please enter a valid image URL.' }),
  headerPhotoHint: z.string().min(2, { message: 'Hint must be at least 2 characters.'}),
});

type POIFormValues = z.infer<typeof formSchema>;

interface POIFormProps {
  poi?: POI;
}

const mapStyles = [
  { featureType: 'poi.business', stylers: [{ visibility: 'off' }] },
  { featureType: 'poi.park', elementType: 'labels.text', stylers: [{ visibility: 'off' }] },
  { featureType: 'road.local', elementType: 'labels', stylers: [{ visibility: 'off' }] },
];

export function POIForm({ poi }: POIFormProps) {
  const router = useRouter();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const defaultCenter = { lat: 48.8566, lng: 2.3522 }; // Paris

  const form = useForm<POIFormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      title: poi?.title || '',
      description: poi?.description || '',
      location: poi?.location || defaultCenter,
      headerPhotoUrl: poi?.headerPhotoUrl || '',
      headerPhotoHint: poi?.headerPhotoHint || '',
    },
  });

  const selectedLocation = form.watch('location');

  async function onSubmit(values: POIFormValues) {
    setLoading(true);
    try {
      // For now, gallery is empty. This can be extended later.
      const poiData = { ...values, galleryUrls: [] };
      createPoi(poiData);
      
      toast({
        title: 'POI Created!',
        description: `${values.title} has been added to the map.`,
      });
      router.push('/dashboard');
      router.refresh(); // To show the new POI on the map
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Could not create the POI. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          <div className="space-y-6">
            <Card>
              <CardHeader><CardTitle>POI Details</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <FormField
                  control={form.control}
                  name="title"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Title</FormLabel>
                      <FormControl><Input placeholder="E.g., Main Stage" {...field} /></FormControl>
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
                      <FormControl><Textarea placeholder="A brief description of the point of interest." {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="headerPhotoUrl"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Header Image URL</FormLabel>
                      <FormControl><Input placeholder="https://example.com/image.jpg" {...field} /></FormControl>
                       <FormDescription>Use a service like Unsplash or Picsum Photos.</FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                 <FormField
                  control={form.control}
                  name="headerPhotoHint"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Header Image Hint</FormLabel>
                      <FormControl><Input placeholder="e.g., concert stage" {...field} /></FormControl>
                      <FormDescription>Two keywords for AI image search.</FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </CardContent>
            </Card>
          </div>
          <div className="space-y-6">
            <Card>
                <CardHeader><CardTitle>Location</CardTitle></CardHeader>
                <CardContent>
                    <FormLabel>Click on the map to set the location</FormLabel>
                    <div className="h-[400px] w-full overflow-hidden rounded-lg border mt-2">
                        <Map
                            defaultCenter={poi?.location || defaultCenter}
                            defaultZoom={13}
                            gestureHandling={'greedy'}
                            disableDefaultUI={true}
                            mapId={process.env.NEXT_PUBLIC_GOOGLE_MAP_ID}
                            styles={mapStyles}
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
                        </Map>
                    </div>
                     <FormMessage>{form.formState.errors.location?.message}</FormMessage>
                </CardContent>
            </Card>
          </div>
        </div>

        <Button type="submit" disabled={loading}>
          {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Create POI
        </Button>
      </form>
    </Form>
  );
}
