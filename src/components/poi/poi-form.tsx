'use client';

import { type FieldErrors, useForm } from 'react-hook-form';
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
import { Map, AdvancedMarker, useMap } from '@vis.gl/react-google-maps';
import { useState, useEffect, useRef } from 'react';
import { Loader2, MapPin, Crosshair, ImagePlus, X } from 'lucide-react';
import type { POI, MainCategory, SubCategory, POISponsor } from '@/lib/types';
import { categoriesMap } from '@/lib/types';
import { useGeolocation } from '@/providers/geolocation-provider';
import { Skeleton } from '../ui/skeleton';
import { mapsConfig } from '@/lib/firebase-config';
import Image from 'next/image';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { useAuth } from '@/hooks/use-auth-user';
import { useEvent } from '@/providers/event-provider';
import { Switch } from '@/components/ui/switch';

const MAX_GALLERY_PHOTOS = 3;
const GALLERY_LIMIT_MESSAGE = "Vous pouvez ajouter jusqu'à 3 photos dans la galerie.";

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
    const MAX_LONG_EDGE = 3200;
    let { width, height } = img;
    const longEdge = Math.max(width, height);
    if (longEdge > MAX_LONG_EDGE) {
      const ratio = MAX_LONG_EDGE / longEdge;
      width = Math.round(width * ratio);
      height = Math.round(height * ratio);
    }
    canvas.width = width;
    canvas.height = height;
    ctx?.drawImage(img, 0, 0, width, height);
    const blob = await new Promise<Blob>((resolve) =>
      canvas.toBlob((b) => resolve(b as Blob), 'image/jpeg', 0.86)
    );
    return new File([blob], file.name.replace(/\.[^/.]+$/, "") + ".jpg", {
      type: 'image/jpeg',
      lastModified: Date.now(),
    });
  } finally {
    URL.revokeObjectURL(url);
  }
}

const mainCategories = Object.keys(categoriesMap) as [MainCategory, ...MainCategory[]];
const allSubCategories = Object.values(categoriesMap).flatMap((main) =>
  Object.keys(main.subCategories)
) as [SubCategory, ...SubCategory[]];

const formSchema = z.object({
    title: z.string().min(3, 'Titre trop court'),
    description: z.string().min(10, 'Description trop courte'),
    mainCategory: z.enum(mainCategories),
    subCategory: z.enum(allSubCategories),
    location: z.object({ lat: z.number(), lng: z.number() }),
    headerPhotoUrl: z.string().optional(),
    galleryUrls: z.array(z.object({ url: z.string(), path: z.string() })).max(MAX_GALLERY_PHOTOS, GALLERY_LIMIT_MESSAGE).optional(),
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
}, { message: 'Sous-catégorie invalide', path: ['subCategory'] }).refine(data => {
    const startDate = data.sponsor?.startDate;
    const endDate = data.sponsor?.endDate;
    return !startDate || !endDate || startDate <= endDate;
}, { message: 'La date de fin doit être postérieure à la date de début', path: ['sponsor.endDate'] });

type POIFormValues = z.infer<typeof formSchema>;
type GalleryImage = { url: string; path: string };
type NewGalleryImage = { id: string; file: File; previewUrl: string };

function buildGalleryValidationValue(existingImages: GalleryImage[], newImages: NewGalleryImage[]): GalleryImage[] {
  return [
    ...existingImages,
    ...newImages.map((image) => ({ url: image.previewUrl, path: image.id })),
  ];
}

function getFirstFormErrorMessage(error: unknown): string | undefined {
  if (!error || typeof error !== 'object') return undefined;
  const maybeMessage = (error as { message?: unknown }).message;
  if (typeof maybeMessage === 'string') return maybeMessage;

  for (const value of Object.values(error)) {
    const message = getFirstFormErrorMessage(value);
    if (message) return message;
  }

  return undefined;
}

function getErrorDetails(error: unknown): { code?: string; message: string } {
  if (error instanceof Error) {
    const maybeCode = (error as Error & { code?: string }).code;
    return { code: maybeCode, message: error.message };
  }

  return { message: String(error) };
}

function toDateInputValue(value?: Date): string {
  if (!value) return '';

  return value.toISOString().slice(0, 10);
}

function parseDateInputValue(value: string): Date | undefined {
  if (!value) return undefined;

  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

function buildSponsorPayload(sponsor?: POIFormValues['sponsor']): POISponsor | undefined {
  if (!sponsor?.enabled) return undefined;

  const sponsorPayload: POISponsor = {
    enabled: true,
    level: sponsor.level ?? 'standard',
    priority: sponsor.priority ?? 0
  };

  if (sponsor.startDate) {
    sponsorPayload.startDate = sponsor.startDate;
  }

  if (sponsor.endDate) {
    sponsorPayload.endDate = sponsor.endDate;
  }

  return sponsorPayload;
}

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
  const { role: globalRole } = useAuth();
  const { userRole } = useEvent();

  const isEditMode = !!poiId;
  const canManageSponsor = globalRole === 'owner' || userRole === 'admin' || userRole === 'editor';
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

  const selectedMainCategory = form.watch('mainCategory');
  const selectedLocation = form.watch('location');
  const headerPhotoUrl = form.watch('headerPhotoUrl');
  const sponsorEnabled = form.watch('sponsor.enabled');

  const [headerImageFile, setHeaderImageFile] = useState<File | null>(null);
  const [headerPreviewUrl, setHeaderPreviewUrl] = useState<string | null>(null);
  const [existingGalleryUrls, setExistingGalleryUrls] = useState<GalleryImage[]>([]);
  const [newGalleryImages, setNewGalleryImages] = useState<NewGalleryImage[]>([]);
  const loadedPoiKeyRef = useRef<string | null>(null);
  const initialLocationAppliedRef = useRef(false);
  const newGalleryImagesRef = useRef<NewGalleryImage[]>([]);

  useEffect(() => {
    if (!isEditMode) {
      const valid = categoriesMap[selectedMainCategory]?.subCategories;
      if (valid) form.setValue('subCategory', Object.keys(valid)[0] as SubCategory);
    }
  }, [selectedMainCategory, isEditMode, form]);

  useEffect(() => {
    if (!poiId) return;
    if (!eventId || geoLoading) return;

    const poiKey = `${eventId}:${poiId}`;
    if (loadedPoiKeyRef.current === poiKey) return;
    loadedPoiKeyRef.current = poiKey;
    const resolvedEventId = eventId;
    const resolvedPoiId = poiId;

    async function getPoi() {
      try {
        const data = await fetchPoiById(resolvedPoiId, resolvedEventId);
        if (data) {
          const sponsorSafe = {
            enabled: data.sponsor?.enabled ?? false,
            level: data.sponsor?.level ?? 'standard',
            priority: data.sponsor?.priority ?? 0,
            startDate: data.sponsor?.startDate ? (data.sponsor.startDate as any).toDate?.() || new Date(data.sponsor.startDate) : undefined,
            endDate: data.sponsor?.endDate ? (data.sponsor.endDate as any).toDate?.() || new Date(data.sponsor.endDate) : undefined,
          };
          form.reset({ ...data, sponsor: sponsorSafe } as POIFormValues);
          setExistingGalleryUrls(data.galleryUrls ?? []);
        } else {
          router.push(`${prefix}/pois`);
        }
      } catch (error) {
        toast({ title: 'Erreur', variant: 'destructive' });
      } finally {
        setPageIsLoading(false);
      }
    }

    void getPoi();
  }, [poiId, eventId, geoLoading, router, prefix, toast, form]);

  useEffect(() => {
    if (poiId || geoLoading) return;
    if (userLocation && !initialLocationAppliedRef.current) {
      form.setValue('location', userLocation);
      initialLocationAppliedRef.current = true;
    }
    setPageIsLoading(false);
  }, [poiId, geoLoading, userLocation, form]);

  useEffect(() => {
    if (!headerImageFile) return setHeaderPreviewUrl(null);
    const url = URL.createObjectURL(headerImageFile);
    setHeaderPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [headerImageFile]);

  useEffect(() => {
    newGalleryImagesRef.current = newGalleryImages;
  }, [newGalleryImages]);

  useEffect(() => {
    form.setValue('galleryUrls', buildGalleryValidationValue(existingGalleryUrls, newGalleryImages), {
      shouldValidate: form.formState.isSubmitted,
    });
  }, [existingGalleryUrls, newGalleryImages, form]);

  useEffect(() => {
    return () => {
      newGalleryImagesRef.current.forEach((image) => URL.revokeObjectURL(image.previewUrl));
    };
  }, []);

  function handleAddGalleryImages(files: FileList | null) {
    if (!files?.length) return;
    const remainingSlots = MAX_GALLERY_PHOTOS - existingGalleryUrls.length - newGalleryImages.length;

    if (remainingSlots <= 0 || files.length > remainingSlots) {
      toast({
        title: 'Limite atteinte',
        description: GALLERY_LIMIT_MESSAGE,
        variant: 'destructive',
      });
      return;
    }

    const images = Array.from(files).map((file) => ({
      id: crypto.randomUUID(),
      file,
      previewUrl: URL.createObjectURL(file),
    }));

    setNewGalleryImages((previous) => [...previous, ...images]);
  }

  function handleRemoveNewGalleryImage(id: string) {
    setNewGalleryImages((previous) => {
      const image = previous.find((item) => item.id === id);
      if (image) URL.revokeObjectURL(image.previewUrl);
      return previous.filter((item) => item.id !== id);
    });
  }

  async function onSubmit(values: POIFormValues) {
    if (!eventId || (eventSlug && eventId === 'default-event')) {
        toast({
            title: "Erreur de contexte",
            description: "L'événement n'est pas encore identifié. Veuillez patienter.",
            variant: "destructive"
        });
        return;
    }

    if (existingGalleryUrls.length + newGalleryImages.length > MAX_GALLERY_PHOTOS) {
      toast({
        title: 'Limite atteinte',
        description: GALLERY_LIMIT_MESSAGE,
        variant: 'destructive',
      });
      return;
    }

    setFormIsLoading(true);
    let targetId = poiId;
    const storagePrefix = eventId && eventId !== 'default-event' ? `events/${eventId}/` : '';

    try {
      const { sponsor, ...rest } = values;
      const sponsorPayload = buildSponsorPayload(sponsor);

      if (!isEditMode) {
        const createPayload: Omit<POI, 'id' | 'averageRating' | 'reviewCount'> = {
          title: rest.title,
          description: rest.description,
          mainCategory: rest.mainCategory,
          subCategory: rest.subCategory,
          location: rest.location,
          headerPhotoUrl: '',
          galleryUrls: [],
        };
      
        if (sponsorPayload) {
          createPayload.sponsor = sponsorPayload;
        }
      
        targetId = await createPoi(createPayload, eventId);
      }

      let finalHeader = values.headerPhotoUrl || '';
      if (headerImageFile) {
        const comp = await compressImage(headerImageFile);
        const { url } = await uploadFile(comp, `${storagePrefix}poi-images/${targetId}/header.jpg`);
        finalHeader = url;
      }

      let newUploads: { url: string; path: string }[] = [];
      if (newGalleryImages.length > 0) {
        newUploads = await Promise.all(newGalleryImages.map(async image => {
          const comp = await compressImage(image.file);
          return uploadFile(comp, `${storagePrefix}poi-images/${targetId}/gallery/${crypto.randomUUID()}.jpg`);
        }));
      }

      const updatePayload = {
        ...rest,
        headerPhotoUrl: finalHeader,
        galleryUrls: [...existingGalleryUrls, ...newUploads],
        sponsor: sponsorPayload ?? deleteField() as any
      };

      await updatePoi(targetId!, updatePayload, eventId);

      toast({ title: 'Succès !', description: 'Le lieu a été sauvegardé.' });
      router.push(`${prefix}/pois`);
    } catch (error) {
      const details = getErrorDetails(error);
      console.error('[POIForm] Erreur lors de la sauvegarde du POI', {
        code: details.code,
        message: details.message,
        poiId: targetId,
        eventId,
        isEditMode,
        values,
      });
      toast({
        title: 'Erreur lors de la sauvegarde',
        description: details.code
          ? `${details.code}: ${details.message}`
          : details.message,
        variant: 'destructive'
      });
    } finally { setFormIsLoading(false); }
  }

  function onInvalid(errors: FieldErrors<POIFormValues>) {
    const message = getFirstFormErrorMessage(errors);

    if (errors.galleryUrls?.message) {
      toast({
        title: 'Galerie invalide',
        description: message ?? GALLERY_LIMIT_MESSAGE,
        variant: 'destructive',
      });
      return;
    }

    toast({
      title: 'Formulaire incomplet',
      description: message ?? 'Vérifiez les champs signalés avant de mettre à jour le lieu.',
      variant: 'destructive',
    });
  }

  if (pageIsLoading) return <div className="p-12 text-center animate-pulse">Chargement de l'éditeur...</div>;

  const galleryPhotoCount = existingGalleryUrls.length + newGalleryImages.length;
  const canAddGalleryPhotos = galleryPhotoCount < MAX_GALLERY_PHOTOS;

  return (
    <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit, onInvalid)} className="space-y-8">
          
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
                        <FormField control={form.control} name="sponsor.startDate" render={({ field }) => (
                          <FormItem>
                            <FormLabel>Date de début</FormLabel>
                            <FormControl>
                              <Input
                                type="date"
                                value={toDateInputValue(field.value)}
                                onChange={(event) => field.onChange(parseDateInputValue(event.target.value))}
                                className="rounded-xl"
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )} />
                        <FormField control={form.control} name="sponsor.endDate" render={({ field }) => (
                          <FormItem>
                            <FormLabel>Date de fin</FormLabel>
                            <FormControl>
                              <Input
                                type="date"
                                value={toDateInputValue(field.value)}
                                onChange={(event) => field.onChange(parseDateInputValue(event.target.value))}
                                className="rounded-xl"
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
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
                      {existingGalleryUrls.map((image) => (
                        <div className="relative aspect-square rounded-2xl overflow-hidden border group" key={image.path || image.url}>
                          <Image src={image.url} alt="Gallery" fill sizes="(max-width: 640px) 33vw, 25vw" className="object-cover" />
                          <Button type="button" variant="destructive" size="icon" aria-label="Supprimer cette image existante" className="absolute top-1 right-1 h-8 w-8 opacity-100 sm:h-6 sm:w-6 sm:opacity-0 sm:group-hover:opacity-100" onClick={() => handleRemoveExistingGalleryImage(image.path)}><X className="h-3 w-3" /></Button>
                        </div>
                      ))}
                      {newGalleryImages.map((image) => (
                        <div className="relative aspect-square rounded-2xl overflow-hidden border bg-primary/5" key={image.id}>
                          <Image src={image.previewUrl} alt="New" fill sizes="(max-width: 640px) 33vw, 25vw" className="object-cover" unoptimized />
                          <Button type="button" variant="ghost" size="icon" aria-label="Retirer cette nouvelle image" className="absolute top-1 right-1 h-8 w-8 sm:h-6 sm:w-6" onClick={() => handleRemoveNewGalleryImage(image.id)}><X className="h-3 w-3" /></Button>
                        </div>
                      ))}
                      {canAddGalleryPhotos && (
                        <label htmlFor="g-up" className="aspect-square border-2 border-dashed rounded-2xl flex flex-col items-center justify-center cursor-pointer hover:bg-muted/30 transition-colors"><ImagePlus className="h-6 w-6 mb-1" /><span className="text-[10px] font-bold">AJOUTER</span></label>
                      )}
                      <Input
                        type="file"
                        multiple
                        accept="image/*"
                        className="hidden"
                        id="g-up"
                        disabled={!canAddGalleryPhotos}
                        onChange={(event) => {
                          handleAddGalleryImages(event.target.files);
                          event.currentTarget.value = '';
                        }}
                      />
                    </div>
                    {form.formState.errors.galleryUrls?.message && (
                      <p className="text-sm font-medium text-destructive">
                        {String(form.formState.errors.galleryUrls.message)}
                      </p>
                    )}
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
  );

  async function handleRemoveExistingGalleryImage(path: string) {
    if (!confirm("Supprimer cette image ?")) return;
    try {
      await deleteFileByPath(path);
      setExistingGalleryUrls((previous) => previous.filter((image) => image.path !== path));
    } catch (error: any) {
      toast({
        title: 'Erreur',
        description: 'Impossible de supprimer l\'image du stockage.',
        variant: 'destructive',
      });
    }
  }
}
