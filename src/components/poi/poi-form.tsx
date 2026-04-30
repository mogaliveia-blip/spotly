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

import { Label } from "@/components/ui/label";
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { createPoi, updatePoi, fetchPoiById, uploadFile, deleteFileByPath } from '@/lib/data';
import { deleteField } from "firebase/firestore";
import { useRouter } from 'next/navigation';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../ui/card';
import { APIProvider, Map, AdvancedMarker, useMap } from '@vis.gl/react-google-maps';
import { useState, useEffect } from 'react';
import { Loader2, MapPin, Crosshair, ImagePlus, X, Calendar as CalendarIcon, AlertTriangle } from 'lucide-react';
import type { POI, MainCategory, SubCategory } from '@/lib/types';
import { categoriesMap } from '@/lib/types';
import { useGeolocation } from '@/providers/geolocation-provider';
import { Skeleton } from '../ui/skeleton';
import { mapsConfig } from '@/lib/firebase-config';
import Image from 'next/image';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { useAuth } from '@/hooks/use-auth-user';
import { Switch } from '@/components/ui/switch';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

async function compressImage(file: File): Promise<File> {
  const img = new window.Image();
  const url = URL.createObjectURL(file);
  try {
    await new Promise((resolve, reject) => {
      img.onload = resolve;
      img.onerror = reject;
      img.src = url;
    });
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    const MAX_WIDTH = 1600;
    let { width, height } = img;
    if (width > MAX_WIDTH) {
      height = height * (MAX_WIDTH / width);
      width = MAX_WIDTH;
    }
    canvas.width = width;
    canvas.height = height;
    ctx?.drawImage(img, 0, 0, width, height);
    const blob = await new Promise<Blob>((resolve) =>
      canvas.toBlob((b) => resolve(b as Blob), 'image/jpeg', 0.75)
    );
    return new File([blob], file.name.replace(/\.[^/.]+$/, "") + ".jpg", {
      type: 'image/jpeg',
      lastModified: Date.now(),
    });
  } finally {
    URL.revokeObjectURL(url);
  }
}

const mainCategories = Object.keys(categoriesMap) as MainCategory[];
const allSubCategories = Object.values(categoriesMap).flatMap((main) => Object.keys(main.subCategories)) as SubCategory[];

const formSchema = z.object({
    title: z.string().min(3, 'Titre trop court'),
    description: z.string().min(10, 'Description trop courte'),
    mainCategory: z.enum(mainCategories),
    subCategory: z.enum(allSubCategories),
    location: z.object({ lat: z.number(), lng: z.number() }),
    headerPhotoUrl: z.string().optional(),
    galleryUrls: z.array(z.object({ url: z.string(), path: z.string() })).optional(),
    sponsor: z.object({
        enabled: z.boolean().default(false),
        level: z.enum(['standard', 'premium', 'official']).default('standard'),
        priority: z.coerce.number().min(0).default(0),
        startDate: z.date().optional(),
        endDate: z.date().optional(),
    }).optional().default({ enabled: false, level: 'standard', priority: 0 }),
}).refine(data => {
    if (data.mainCategory && data.subCategory) {
        const valid = categoriesMap[data.mainCategory]?.subCategories;
        return valid && Object.keys(valid).includes(data.subCategory);
    }
    return true;
}, { message: 'Sous-catégorie invalide', path: ['subCategory'] });

type POIFormValues = z.infer<typeof formSchema>;

interface POIFormProps {
  poiId?: string;
  eventId?: string;
  eventSlug?: string;
}

function MapController() {
  const { userLocation } = useGeolocation();
  const mapRef = useMap();
  const handleRecenter = () => { if (mapRef && userLocation) mapRef.panTo(userLocation); };
  return userLocation ? (
    <div className="absolute bottom-4 left-4 z-10">
      <Button size="icon" onClick={handleRecenter} type="button"><Crosshair className="h-5 w-5" /></Button>
    </div>
  ) : null;
}

export function POIForm({ poiId, eventId, eventSlug }: POIFormProps) {
  const router = useRouter();
  const { toast } = useToast();
  const [formIsLoading, setFormIsLoading] = useState(false);
  const [pageIsLoading, setPageIsLoading] = useState(true);
  const { userLocation, loading: geoLoading } = useGeolocation();
  const { role } = useAuth();

  const isEditMode = !!poiId;
  const canManageSponsor = role === 'admin' || role === 'editor';
  const prefix = eventSlug ? `/${eventSlug}` : '';

  const form = useForm<POIFormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      title: '',
      description: '',
      mainCategory: 'programmation',
      subCategory: 'concert_headliner',
      location: userLocation || { lat: -21.3393, lng: 55.4781 },
      headerPhotoUrl: '',
      galleryUrls: [],
      sponsor: { enabled: false, level: 'standard', priority: 0 }
    },
  });

  const { fields: galleryFields, append, remove } = useFieldArray({ control: form.control, name: 'galleryUrls' });
  const selectedMainCategory = form.watch('mainCategory');
  const selectedLocation = form.watch('location');
  const headerPhotoUrl = form.watch('headerPhotoUrl');
  const sponsorEnabled = form.watch('sponsor.enabled');

  const [headerImageFile, setHeaderImageFile] = useState<File | null>(null);
  const [headerPreviewUrl, setHeaderPreviewUrl] = useState<string | null>(null);
  const [galleryImageFiles, setGalleryImageFiles] = useState<File[]>([]);
  const [galleryPreviewUrls, setGalleryPreviewUrls] = useState<string[]>([]);

  useEffect(() => {
    if (!isEditMode) {
      const valid = categoriesMap[selectedMainCategory]?.subCategories;
      if (valid) form.setValue('subCategory', Object.keys(valid)[0] as SubCategory);
    }
  }, [selectedMainCategory, isEditMode, form]);

  useEffect(() => {
    async function getPoi() {
      if (!eventId) return;
      
      if (poiId) {
        try {
          const data = await fetchPoiById(poiId, eventId);
          if (data) {
             const sponsorSafe = {
              enabled: data.sponsor?.enabled ?? false,
              level: data.sponsor?.level ?? 'standard',
              priority: data.sponsor?.priority ?? 0,
              startDate: data.sponsor?.startDate ? (data.sponsor.startDate as any).toDate?.() || new Date(data.sponsor.startDate) : undefined,
              endDate: data.sponsor?.endDate ? (data.sponsor.endDate as any).toDate?.() || new Date(data.sponsor.endDate) : undefined,
            };
            form.reset({ ...data, sponsor: sponsorSafe } as POIFormValues);
          } else {
            router.push(`${prefix}/pois`);
          }
        } catch (error) {
          toast({ title: 'Erreur', variant: 'destructive' });
        } finally { setPageIsLoading(false); }
      } else {
        if (userLocation) form.setValue('location', userLocation);
        setPageIsLoading(false);
      }
    }
    if (!geoLoading) getPoi();
  }, [poiId, eventId, geoLoading, userLocation, router, prefix, toast, form]);

  useEffect(() => {
    if (!headerImageFile) return setHeaderPreviewUrl(null);
    const url = URL.createObjectURL(headerImageFile);
    setHeaderPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [headerImageFile]);

  useEffect(() => {
    const urls = galleryImageFiles.map(f => URL.createObjectURL(f));
    setGalleryPreviewUrls(urls);
    return () => urls.forEach(u => URL.revokeObjectURL(u));
  }, [galleryImageFiles]);

  async function onSubmit(values: POIFormValues) {
    if (!eventId || (eventSlug && eventId === 'default-event')) {
        toast({
            title: "Erreur de contexte",
            description: "L'événement n'est pas encore identifié. Veuillez patienter.",
            variant: "destructive"
        });
        return;
    }

    setFormIsLoading(true);
    let targetId = poiId;
    const storagePrefix = eventId && eventId !== 'default-event' ? `events/${eventId}/` : '';

    try {
      const { sponsor, ...rest } = values;

      if (!isEditMode) {
        const createPayload: any = {
          title: rest.title,
          description: rest.description,
          mainCategory: rest.mainCategory,
          subCategory: rest.subCategory,
          location: rest.location,
          headerPhotoUrl: '',
          galleryUrls: [],
        };
      
        if (sponsor?.enabled) {
          createPayload.sponsor = sponsor;
        }
      
        targetId = await createPoi(createPayload, eventId);
      }

      let finalHeader = values.headerPhotoUrl || '';
      if (headerImageFile) {
        const comp = await compressImage(headerImageFile);
        const { url } = await uploadFile(comp, `${storagePrefix}poi-images/${targetId}/header.jpg`);
        finalHeader = url;
      }

      const existingGallery = values.galleryUrls || [];
      let newUploads: { url: string; path: string }[] = [];
      if (galleryImageFiles.length > 0) {
        newUploads = await Promise.all(galleryImageFiles.map(async f => {
          const comp = await compressImage(f);
          return uploadFile(comp, `${storagePrefix}poi-images/${targetId}/gallery/${crypto.randomUUID()}.jpg`);
        }));
      }

      await updatePoi(targetId!, {
        ...rest,
        headerPhotoUrl: finalHeader,
        galleryUrls: [...existingGallery, ...newUploads],
        sponsor: sponsor?.enabled ? sponsor : deleteField() as any
      }, eventId);

      toast({ title: 'Succès !', description: 'Le lieu a été sauvegardé.' });
      router.push(`${prefix}/pois`);
    } catch (error) {
      toast({ title: 'Erreur lors de la sauvegarde', variant: 'destructive' });
    } finally { setFormIsLoading(false); }
  }

  if (pageIsLoading) return <div className="p-12 text-center animate-pulse">Chargement de l'éditeur...</div>;

  return (
    <APIProvider apiKey={mapsConfig.apiKey}>
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
          
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            <div className="lg:col-span-2 space-y-6">
              <Card className="rounded-[2rem] border-muted/60">
                <CardHeader><CardTitle>Détails</CardTitle></CardHeader>
                <CardContent className="space-y-4">
                  <FormField control={form.control} name="title" render={({ field }) => (
                    <FormItem><FormLabel>Titre</FormLabel><FormControl><Input placeholder="Nom du lieu" {...field} className="rounded-xl" /></FormControl><FormMessage /></FormItem>
                  )} />
                  <FormField control={form.control} name="description" render={({ field }) => (
                    <FormItem><FormLabel>Description</FormLabel><FormControl><Textarea placeholder="Description détaillée" {...field} rows={5} className="rounded-2xl" /></FormControl><FormMessage /></FormItem>
                  )} />
                  <div className="grid grid-cols-2 gap-4">
                    <FormField control={form.control} name="mainCategory" render={({ field }) => (
                      <FormItem><FormLabel>Catégorie</FormLabel><Select onValueChange={field.onChange} value={field.value}><FormControl><SelectTrigger className="rounded-xl"><SelectValue /></SelectTrigger></FormControl><SelectContent>{mainCategories.map(c => <SelectItem key={c} value={c}>{categoriesMap[c].label}</SelectItem>)}</SelectContent></Select></FormItem>
                    )} />
                    <FormField control={form.control} name="subCategory" render={({ field }) => (
                      <FormItem><FormLabel>Type</FormLabel><Select onValueChange={field.onChange} value={field.value}><FormControl><SelectTrigger className="rounded-xl"><SelectValue /></SelectTrigger></FormControl><SelectContent>{categoriesMap[selectedMainCategory]?.subCategories && Object.entries(categoriesMap[selectedMainCategory].subCategories).map(([v, l]) => <SelectItem key={v} value={v}>{l as string}</SelectItem>)}</SelectContent></Select></FormItem>
                    )} />
                  </div>
                </CardContent>
              </Card>

              {canManageSponsor && (
                <Card className="rounded-[2rem] border-muted/60">
                  <CardHeader><CardTitle>Partenariat</CardTitle></CardHeader>
                  <CardContent className="space-y-6">
                    <FormField control={form.control} name="sponsor.enabled" render={({ field }) => (
                      <FormItem className="flex items-center justify-between rounded-2xl border p-4 bg-muted/10"><div className="space-y-0.5"><FormLabel>Mettre en avant</FormLabel><FormDescription>Le POI apparaîtra en priorité avec un badge.</FormDescription></div><FormControl><Switch checked={field.value} onCheckedChange={field.onChange} /></FormControl></FormItem>
                    )} />
                    {sponsorEnabled && (
                      <div className="space-y-4 pt-4 border-t grid grid-cols-2 gap-4">
                        <FormField control={form.control} name="sponsor.level" render={({ field }) => (
                          <FormItem><FormLabel>Niveau</FormLabel><Select onValueChange={field.onChange} value={field.value}><FormControl><SelectTrigger className="rounded-xl"><SelectValue /></SelectTrigger></FormControl><SelectContent><SelectItem value="standard">Standard</SelectItem><SelectItem value="premium">Premium</SelectItem><SelectItem value="official">Officiel</SelectItem></SelectContent></Select></FormItem>
                        )} />
                        <FormField control={form.control} name="sponsor.priority" render={({ field }) => (
                          <FormItem><FormLabel>Priorité (0-100)</FormLabel><FormControl><Input type="number" {...field} className="rounded-xl" /></FormControl></FormItem>
                        )} />
                      </div>
                    )}
                  </CardContent>
                </Card>
              )}

              <Card className="rounded-[2rem] border-muted/60">
                <CardHeader><CardTitle>Images</CardTitle></CardHeader>
                <CardContent className="space-y-6">
                  <div className="space-y-2">
                    <Label>Image principale</Label>
                    <Input type="file" accept="image/*" className="hidden" id="h-up" onChange={e => setHeaderImageFile(e.target.files?.[0] || null)} />
                    <label htmlFor="h-up" className="relative aspect-video w-full border-2 border-dashed rounded-3xl flex items-center justify-center cursor-pointer overflow-hidden bg-muted/20">
                      {headerPreviewUrl || headerPhotoUrl ? <Image src={headerPreviewUrl || headerPhotoUrl!} alt="Preview" fill className="object-cover" /> : <ImagePlus className="h-10 w-10 text-muted-foreground" />}
                    </label>
                  </div>
                  <div className="space-y-2">
                    <Label>Galerie</Label>
                    <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
                      {galleryFields.map((f, i) => (
                        <div className="relative aspect-square rounded-2xl overflow-hidden border group" key={f.id}>
                          <Image src={f.url} alt="Gallery" fill className="object-cover" />
                          <Button type="button" variant="destructive" size="icon" className="absolute top-1 right-1 h-6 w-6 opacity-0 group-hover:opacity-100" onClick={() => handleRemoveExistingGalleryImage(i, f.path)}><X className="h-3 w-3" /></Button>
                        </div>
                      ))}
                      {galleryPreviewUrls.map((u, i) => (
                        <div className="relative aspect-square rounded-2xl overflow-hidden border bg-primary/5" key={u}>
                          <Image src={u} alt="New" fill className="object-cover" />
                          <Button type="button" variant="ghost" size="icon" className="absolute top-1 right-1 h-6 w-6" onClick={() => setGalleryImageFiles(prev => prev.filter((_, idx) => idx !== i))}><X className="h-3 w-3" /></Button>
                        </div>
                      ))}
                      <label htmlFor="g-up" className="aspect-square border-2 border-dashed rounded-2xl flex flex-col items-center justify-center cursor-pointer hover:bg-muted/30 transition-colors"><ImagePlus className="h-6 w-6 mb-1" /><span className="text-[10px] font-bold">AJOUTER</span></label>
                      <Input type="file" multiple accept="image/*" className="hidden" id="g-up" onChange={e => setGalleryImageFiles(p => [...p, ...Array.from(e.target.files || [])])} />
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            <div className="space-y-6">
              <Card className="rounded-[2rem] border-muted/60 overflow-hidden">
                <CardHeader><CardTitle>Emplacement</CardTitle><CardDescription>Cliquez sur la carte pour placer le marqueur.</CardDescription></CardHeader>
                <CardContent className="p-0">
                  <div className="h-[400px] w-full relative">
                    <Map defaultCenter={selectedLocation} defaultZoom={15} mapId={mapsConfig.mapId} onClick={e => e.detail.latLng && form.setValue('location', e.detail.latLng)}>
                      <AdvancedMarker position={selectedLocation}><MapPin className="text-primary h-8 w-8" /></AdvancedMarker>
                      <MapController />
                    </Map>
                  </div>
                </CardContent>
              </Card>
              <Button type="submit" disabled={formIsLoading} className="w-full h-14 rounded-2xl font-bold text-lg shadow-xl">
                {formIsLoading && <Loader2 className="mr-2 h-5 w-5 animate-spin" />}
                {isEditMode ? 'Mettre à jour' : 'Créer le lieu'}
              </Button>
            </div>
          </div>
        </form>
      </Form>
    </APIProvider>
  );

  async function handleRemoveExistingGalleryImage(index: number, path: string) {
    if (!confirm("Supprimer cette image ?")) return;
    try { await deleteFileByPath(path); remove(index); } catch (error: any) {
      toast({
        title: 'Erreur',
        description: 'Impossible de supprimer l\'image du stockage.',
        variant: 'destructive',
      });
    }
  }
}
