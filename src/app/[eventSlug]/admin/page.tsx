'use client';

import React, { useEffect, useState, useMemo } from 'react';
import { useAuth } from '@/hooks/use-auth-user';
import { useRouter } from 'next/navigation';
import {
  fetchAppConfig,
  updateAppConfig,
  fetchMarketingConfig,
  updateMarketingConfig,
  updateEventDetails,
  updateEventPrivatePreviewEnabled,
  fetchPoiCategoryUsageCount,
  uploadFile,
  deleteFileByPath
} from '@/lib/data';
import type { AppConfig, EventPoiCategory, EventPrivateLink, EventVisibility, MarketingConfig } from '@/lib/types';
import {
  EVENT_POI_CATEGORY_LABEL_MAX_LENGTH,
  MAX_EVENT_POI_CATEGORIES,
  getComparableCategoryLabel,
  normalizeCategoryLabel,
  resolveCategoryIcon,
  spotlyPoiCategorySuggestions,
  supportedCategoryIcons
} from '@/lib/event-poi-categories';
import { compressImageForUpload } from '@/lib/image-compression';
import {
  buildPrivateEventUrl,
  fetchPrivateEventLinks,
  revokePrivateEventLink,
  rotatePrivateEventToken
} from '@/lib/private-event-access';
import { AppLayout } from '@/components/layout/app-layout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { Check, ChevronDown, ChevronUp, Copy, HelpCircle, KeyRound, Loader2, ImagePlus, Plus, Share2, Trash2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Switch } from '@/components/ui/switch';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import Image from 'next/image';
import { useEvent } from '@/providers/event-provider';

const EVENT_DESCRIPTION_MAX_LENGTH = 400;
const EVENT_COVER_STORAGE_PATH = (eventId: string) => `events/${eventId}/event-cover/cover.jpg`;

function toDateInputValue(value?: Date): string {
  if (!value) return '';
  return value.toISOString().slice(0, 10);
}

function parseDateInputValue(value: string): Date | undefined {
  if (!value) return undefined;
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

function optionalText(value: string): string | undefined {
  const trimmed = value.trim();
  return trimmed || undefined;
}

function EventDetailsCard() {
  const { event, eventId } = useEvent();
  const { toast } = useToast();
  const [name, setName] = useState(event?.name ?? '');
  const [description, setDescription] = useState(event?.description ?? '');
  const [eventCoverUrl, setEventCoverUrl] = useState(event?.eventCoverUrl ?? '');
  const [coverImageFile, setCoverImageFile] = useState<File | null>(null);
  const [coverPreviewUrl, setCoverPreviewUrl] = useState<string | null>(null);
  const [coverMarkedForDeletion, setCoverMarkedForDeletion] = useState(false);
  const [startDate, setStartDate] = useState(toDateInputValue(event?.startDate));
  const [endDate, setEndDate] = useState(toDateInputValue(event?.endDate));
  const [timezone, setTimezone] = useState(event?.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone ?? 'Europe/Paris');
  const [city, setCity] = useState(event?.city ?? '');
  const [departmentName, setDepartmentName] = useState(event?.departmentName ?? '');
  const [region, setRegion] = useState(event?.region ?? '');
  const [country, setCountry] = useState(event?.country ?? 'France');
  const [visibility, setVisibility] = useState<EventVisibility>(event?.visibility ?? 'public');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setName(event?.name ?? '');
    setDescription(event?.description ?? '');
    setEventCoverUrl(event?.eventCoverUrl ?? '');
    setCoverImageFile(null);
    setCoverMarkedForDeletion(false);
    setStartDate(toDateInputValue(event?.startDate));
    setEndDate(toDateInputValue(event?.endDate));
    setTimezone(event?.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone ?? 'Europe/Paris');
    setCity(event?.city ?? '');
    setDepartmentName(event?.departmentName ?? '');
    setRegion(event?.region ?? '');
    setCountry(event?.country ?? 'France');
    setVisibility(event?.visibility ?? 'public');
  }, [event]);

  useEffect(() => {
    if (!coverImageFile) {
      setCoverPreviewUrl(null);
      return;
    }

    const url = URL.createObjectURL(coverImageFile);
    setCoverPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [coverImageFile]);

  const handleSave = async () => {
    if (!event) return;

    if (startDate && endDate && startDate > endDate) {
      toast({
        title: 'Dates invalides',
        description: 'La date de fin doit être postérieure à la date de début.',
        variant: 'destructive'
      });
      return;
    }

    const locationValues = [city, departmentName, region, country];
    if (locationValues.some((value) => value.trim().length > 80)) {
      toast({
        title: 'Localisation invalide',
        description: 'Les champs de localisation ne doivent pas dépasser 80 caractères.',
        variant: 'destructive'
      });
      return;
    }

    const trimmedDescription = description.trim();
    if (trimmedDescription.length > EVENT_DESCRIPTION_MAX_LENGTH) {
      toast({
        title: 'Description trop longue',
        description: `La description ne doit pas dépasser ${EVENT_DESCRIPTION_MAX_LENGTH} caractères.`,
        variant: 'destructive'
      });
      return;
    }

    setSaving(true);
    try {
      let nextEventCoverUrl: string | undefined = eventCoverUrl || undefined;

      if (coverMarkedForDeletion && !coverImageFile) {
        await deleteFileByPath(EVENT_COVER_STORAGE_PATH(eventId));
        nextEventCoverUrl = undefined;
      }

      if (coverImageFile) {
        const compressedCover = await compressImageForUpload(coverImageFile);
        const { url } = await uploadFile(compressedCover, EVENT_COVER_STORAGE_PATH(eventId));
        nextEventCoverUrl = url;
      }

      await updateEventDetails(eventId, {
        name: name.trim(),
        description: trimmedDescription || undefined,
        eventCoverUrl: nextEventCoverUrl,
        startDate: parseDateInputValue(startDate),
        endDate: parseDateInputValue(endDate),
        timezone: timezone.trim() || 'Europe/Paris',
        city: optionalText(city),
        departmentName: optionalText(departmentName),
        region: optionalText(region),
        country: optionalText(country),
        visibility
      });
      setEventCoverUrl(nextEventCoverUrl ?? '');
      setCoverImageFile(null);
      setCoverMarkedForDeletion(false);
      toast({ title: 'Événement mis à jour' });
    } catch (error) {
      console.error('[EventDetailsCard] updateEventDetails failed', error);
      toast({
        title: 'Erreur',
        description: "Impossible de sauvegarder les informations de l'événement.",
        variant: 'destructive'
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="event-name">Nom</Label>
        <Input id="event-name" value={name} onChange={(event) => setName(event.target.value)} className="rounded-xl" />
      </div>
      <div className="space-y-2">
        <Label htmlFor="event-description">Description de l'événement</Label>
        <Textarea
          id="event-description"
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          maxLength={EVENT_DESCRIPTION_MAX_LENGTH}
          rows={4}
          placeholder="Présentez brièvement l'événement."
          className="rounded-xl"
        />
        <p className="text-sm text-muted-foreground">
          {description.length}/{EVENT_DESCRIPTION_MAX_LENGTH} caractères
        </p>
      </div>
      <div className="space-y-3">
        <Label>Photo de couverture</Label>
        <Input
          id="event-cover-upload"
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0] ?? null;
            setCoverImageFile(file);
            if (file) setCoverMarkedForDeletion(false);
            event.currentTarget.value = '';
          }}
        />
        <label
          htmlFor="event-cover-upload"
          className="relative flex aspect-video w-full cursor-pointer items-center justify-center overflow-hidden rounded-2xl border-2 border-dashed bg-muted/10 transition-colors hover:bg-muted/20"
        >
          {coverPreviewUrl || (!coverMarkedForDeletion && eventCoverUrl) ? (
            <Image
              src={coverPreviewUrl || eventCoverUrl}
              alt="Photo de couverture"
              fill
              sizes="(max-width: 640px) 100vw, 640px"
              className="object-cover"
              unoptimized={!!coverPreviewUrl}
            />
          ) : (
            <div className="flex flex-col items-center gap-2 text-muted-foreground">
              <ImagePlus className="h-8 w-8" />
              <span className="text-sm font-bold">Ajouter une photo</span>
            </div>
          )}
        </label>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" className="rounded-xl font-bold" asChild>
            <label htmlFor="event-cover-upload" className="cursor-pointer">
              {eventCoverUrl || coverImageFile ? 'Remplacer la photo' : 'Ajouter une photo'}
            </label>
          </Button>
          {(eventCoverUrl || coverImageFile) && !coverMarkedForDeletion && (
            <Button
              type="button"
              variant="outline"
              className="rounded-xl font-bold text-destructive hover:text-destructive"
              onClick={() => {
                setCoverImageFile(null);
                setCoverMarkedForDeletion(true);
              }}
            >
              <Trash2 className="mr-2 h-4 w-4" />
              Supprimer la photo
            </Button>
          )}
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="event-start-date">Date de début</Label>
          <Input id="event-start-date" type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} className="rounded-xl" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="event-end-date">Date de fin</Label>
          <Input id="event-end-date" type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} className="rounded-xl" />
        </div>
      </div>
      <div className="space-y-2">
        <Label htmlFor="event-timezone">Fuseau horaire</Label>
        <Input id="event-timezone" value={timezone} onChange={(event) => setTimezone(event.target.value)} className="rounded-xl" />
      </div>
      <div className="space-y-2">
        <Label htmlFor="event-visibility">Visibilité</Label>
        <Select value={visibility} onValueChange={(value) => setVisibility(value as EventVisibility)}>
          <SelectTrigger id="event-visibility" className="rounded-xl">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="public">Public</SelectItem>
            <SelectItem value="private">Privé</SelectItem>
          </SelectContent>
        </Select>
        <p className="text-sm text-muted-foreground">
          Un événement privé est réservé au staff pour cette phase. Le lien privé sera ajouté dans une prochaine étape.
        </p>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="event-city">Ville</Label>
          <Input id="event-city" value={city} onChange={(event) => setCity(event.target.value)} placeholder="Lorient" className="rounded-xl" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="event-department">Département</Label>
          <Input id="event-department" value={departmentName} onChange={(event) => setDepartmentName(event.target.value)} placeholder="Morbihan" className="rounded-xl" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="event-region">Région</Label>
          <Input id="event-region" value={region} onChange={(event) => setRegion(event.target.value)} placeholder="Bretagne" className="rounded-xl" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="event-country">Pays</Label>
          <Input id="event-country" value={country} onChange={(event) => setCountry(event.target.value)} placeholder="France" className="rounded-xl" />
        </div>
      </div>
      <Button onClick={handleSave} disabled={saving || !name.trim()} className="w-full sm:w-auto font-bold rounded-xl h-11">
        {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
        Sauvegarder
      </Button>
    </div>
  );
}

function createCategoryId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `cat_${crypto.randomUUID()}`;
  }

  return `cat_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

function hasDuplicateCategoryLabel(categories: EventPoiCategory[], label: string, currentId?: string): boolean {
  const comparable = getComparableCategoryLabel(label);
  return categories.some((category) => (
    category.id !== currentId &&
    getComparableCategoryLabel(category.label) === comparable
  ));
}

function PoiCategoriesCard() {
  const { event, eventId } = useEvent();
  const { toast } = useToast();
  const [categories, setCategories] = useState<EventPoiCategory[]>(event?.poiCategories ?? []);
  const [customLabel, setCustomLabel] = useState('');
  const [customIcon, setCustomIcon] = useState(supportedCategoryIcons[0].key);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setCategories(event?.poiCategories ?? []);
    setCustomLabel('');
    setCustomIcon(supportedCategoryIcons[0].key);
  }, [event?.id, event?.poiCategories]);

  const validateCategories = (nextCategories: EventPoiCategory[]): boolean => {
    if (nextCategories.length > MAX_EVENT_POI_CATEGORIES) {
      toast({
        title: 'Limite atteinte',
        description: `${MAX_EVENT_POI_CATEGORIES} catégories maximum par événement.`,
        variant: 'destructive'
      });
      return false;
    }

    const seen = new Set<string>();
    for (const category of nextCategories) {
      const label = normalizeCategoryLabel(category.label);
      if (!label) {
        toast({ title: 'Libellé requis', variant: 'destructive' });
        return false;
      }
      if (label.length > EVENT_POI_CATEGORY_LABEL_MAX_LENGTH) {
        toast({
          title: 'Libellé trop long',
          description: `${EVENT_POI_CATEGORY_LABEL_MAX_LENGTH} caractères maximum.`,
          variant: 'destructive'
        });
        return false;
      }

      const comparable = getComparableCategoryLabel(label);
      if (seen.has(comparable)) {
        toast({
          title: 'Catégorie déjà existante',
          description: 'Deux catégories ne peuvent pas avoir le même libellé.',
          variant: 'destructive'
        });
        return false;
      }
      seen.add(comparable);
    }

    return true;
  };

  const saveCategories = async (nextCategories: EventPoiCategory[], successTitle: string): Promise<boolean> => {
    const normalizedCategories = nextCategories.map((category) => ({
      ...category,
      label: normalizeCategoryLabel(category.label)
    }));

    if (!validateCategories(normalizedCategories)) return false;

    setSaving(true);
    try {
      await updateEventDetails(eventId, { poiCategories: normalizedCategories });
      setCategories(normalizedCategories);
      toast({ title: successTitle });
      return true;
    } catch (error) {
      console.error('[PoiCategoriesCard] update failed', error);
      toast({
        title: 'Erreur',
        description: 'Impossible de sauvegarder les catégories.',
        variant: 'destructive'
      });
      return false;
    } finally {
      setSaving(false);
    }
  };

  const addCategory = async (label: string, icon: string): Promise<boolean> => {
    const normalizedLabel = normalizeCategoryLabel(label);
    if (!normalizedLabel) {
      toast({ title: 'Libellé requis', variant: 'destructive' });
      return false;
    }

    if (hasDuplicateCategoryLabel(categories, normalizedLabel)) {
      toast({
        title: 'Catégorie déjà existante',
        description: 'Ce libellé est déjà utilisé pour cet événement.',
        variant: 'destructive'
      });
      return false;
    }

    return saveCategories([
      ...categories,
      {
        id: createCategoryId(),
        label: normalizedLabel,
        icon
      }
    ], 'Catégorie ajoutée');
  };

  const updateCategory = (categoryId: string, patch: Partial<EventPoiCategory>) => {
    setCategories((current) => current.map((category) => (
      category.id === categoryId ? { ...category, ...patch } : category
    )));
  };

  const moveCategory = (index: number, direction: -1 | 1) => {
    const targetIndex = index + direction;
    if (targetIndex < 0 || targetIndex >= categories.length) return;

    const nextCategories = [...categories];
    const [category] = nextCategories.splice(index, 1);
    nextCategories.splice(targetIndex, 0, category);
    void saveCategories(nextCategories, 'Ordre mis à jour');
  };

  const removeCategory = async (categoryId: string) => {
    setSaving(true);
    try {
      const usedCount = await fetchPoiCategoryUsageCount(eventId, categoryId);

      if (usedCount > 0) {
        toast({
          title: 'Catégorie utilisée',
          description: `Cette catégorie est utilisée par ${usedCount} lieu(x). Réaffectez ces lieux avant de la supprimer.`,
          variant: 'destructive'
        });
        return;
      }

      await saveCategories(
        categories.filter((category) => category.id !== categoryId),
        'Catégorie supprimée'
      );
    } catch (error) {
      console.error('[PoiCategoriesCard] category usage check failed', error);
      toast({
        title: 'Erreur',
        description: "Impossible de vérifier l'utilisation de cette catégorie.",
        variant: 'destructive'
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="rounded-xl border bg-muted/10 p-4">
        <p className="text-sm text-muted-foreground">
          Personnalisez les catégories utilisées pour organiser les lieux de votre événement.
        </p>
        <p className="mt-2 text-xs text-muted-foreground">
          La protection contre la suppression d'une catégorie utilisée sera activée lorsque les POI référenceront ces catégories.
        </p>
      </div>

      <div className="space-y-3">
        {categories.length === 0 && (
          <div className="rounded-2xl border border-dashed bg-muted/10 px-4 py-8 text-center text-sm text-muted-foreground">
            Aucune catégorie personnalisée.
          </div>
        )}

        {categories.map((category, index) => {
          const Icon = resolveCategoryIcon(category.icon);

          return (
            <div key={category.id} className="rounded-2xl border p-3">
              <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_180px_auto] md:items-end">
                <div className="space-y-2">
                  <Label htmlFor={`category-label-${category.id}`}>Libellé</Label>
                  <div className="flex items-center gap-2">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-muted text-primary">
                      <Icon className="h-5 w-5" />
                    </div>
                    <Input
                      id={`category-label-${category.id}`}
                      value={category.label}
                      maxLength={EVENT_POI_CATEGORY_LABEL_MAX_LENGTH}
                      onChange={(event) => updateCategory(category.id, { label: event.target.value })}
                      className="min-w-0 rounded-xl"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor={`category-icon-${category.id}`}>Icône</Label>
                  <Select value={category.icon} onValueChange={(value) => updateCategory(category.id, { icon: value })}>
                    <SelectTrigger id={`category-icon-${category.id}`} className="rounded-xl">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {supportedCategoryIcons.map((icon) => {
                        const OptionIcon = resolveCategoryIcon(icon.key);
                        return (
                          <SelectItem key={icon.key} value={icon.key}>
                            <span className="inline-flex items-center gap-2">
                              <OptionIcon className="h-4 w-4" />
                              {icon.label}
                            </span>
                          </SelectItem>
                        );
                      })}
                    </SelectContent>
                  </Select>
                </div>

                <div className="flex flex-wrap gap-2 md:justify-end">
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    aria-label="Monter la catégorie"
                    disabled={saving || index === 0}
                    onClick={() => moveCategory(index, -1)}
                    className="h-10 w-10 rounded-xl"
                  >
                    <ChevronUp className="h-4 w-4" />
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    aria-label="Descendre la catégorie"
                    disabled={saving || index === categories.length - 1}
                    onClick={() => moveCategory(index, 1)}
                    className="h-10 w-10 rounded-xl"
                  >
                    <ChevronDown className="h-4 w-4" />
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    disabled={saving}
                    onClick={() => void saveCategories(categories, 'Catégorie mise à jour')}
                    className="h-10 rounded-xl font-bold"
                  >
                    <Check className="mr-2 h-4 w-4" />
                    Sauver
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    disabled={saving}
                    onClick={() => void removeCategory(category.id)}
                    className="h-10 rounded-xl font-bold text-destructive hover:text-destructive"
                  >
                    <Trash2 className="mr-2 h-4 w-4" />
                    Supprimer
                  </Button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="space-y-3 rounded-2xl border p-4">
        <div>
          <h3 className="font-bold">Suggestions Spotly</h3>
          <p className="text-sm text-muted-foreground">Chaque suggestion ajoutée reçoit son propre identifiant stable.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {spotlyPoiCategorySuggestions.map((suggestion) => {
            const Icon = resolveCategoryIcon(suggestion.icon);
            return (
              <Button
                key={`${suggestion.label}-${suggestion.icon}`}
                type="button"
                variant="outline"
                size="sm"
                disabled={saving || categories.length >= MAX_EVENT_POI_CATEGORIES}
                onClick={() => void addCategory(suggestion.label, suggestion.icon)}
                className="h-9 rounded-full"
              >
                <Icon className="mr-2 h-4 w-4" />
                {suggestion.label}
              </Button>
            );
          })}
        </div>
      </div>

      <div className="space-y-3 rounded-2xl border p-4">
        <div>
          <h3 className="font-bold">Ajouter une catégorie</h3>
          <p className="text-sm text-muted-foreground">Libellé obligatoire, {EVENT_POI_CATEGORY_LABEL_MAX_LENGTH} caractères maximum.</p>
        </div>
        <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_180px_auto] md:items-end">
          <div className="space-y-2">
            <Label htmlFor="custom-category-label">Libellé</Label>
            <Input
              id="custom-category-label"
              value={customLabel}
              maxLength={EVENT_POI_CATEGORY_LABEL_MAX_LENGTH}
              onChange={(event) => setCustomLabel(event.target.value)}
              placeholder="Ex: Brunch"
              className="rounded-xl"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="custom-category-icon">Icône</Label>
            <Select value={customIcon} onValueChange={(value) => setCustomIcon(value as typeof customIcon)}>
              <SelectTrigger id="custom-category-icon" className="rounded-xl">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {supportedCategoryIcons.map((icon) => {
                  const Icon = resolveCategoryIcon(icon.key);
                  return (
                    <SelectItem key={icon.key} value={icon.key}>
                      <span className="inline-flex items-center gap-2">
                        <Icon className="h-4 w-4" />
                        {icon.label}
                      </span>
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
          </div>
          <Button
            type="button"
            disabled={saving || categories.length >= MAX_EVENT_POI_CATEGORIES || !customLabel.trim()}
            onClick={async () => {
              const didAdd = await addCategory(customLabel, customIcon);
              if (didAdd) {
                setCustomLabel('');
                setCustomIcon(supportedCategoryIcons[0].key);
              }
            }}
            className="h-10 rounded-xl font-bold"
          >
            {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
            Ajouter
          </Button>
        </div>
      </div>
    </div>
  );
}

/* =========================
   APP CONFIG CARD
========================= */

function AppConfigCard() {
  const { eventId } = useEvent();
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingReviews, setSavingReviews] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    fetchAppConfig(eventId)
      .then(appConfig => {
        setConfig(appConfig);
        setLoading(false);
      })
      .catch(() => {
        toast({
          title: 'Erreur',
          description: 'Impossible de charger la configuration.',
          variant: 'destructive'
        });
        setLoading(false);
      });
  }, [toast, eventId]);

  const handleToggleReviews = async (isEnabled: boolean) => {
    setSavingReviews(true);
    try {
      await updateAppConfig({ reviewsEnabled: isEnabled }, eventId);
      setConfig(prev => prev ? { ...prev, reviewsEnabled: isEnabled } : prev);
      toast({
        title: 'Configuration mise à jour',
        description: `Les avis ont été ${isEnabled ? 'activés' : 'désactivés'}.`
      });
    } catch {
      toast({
        title: 'Erreur',
        description: 'Impossible de mettre à jour la configuration.',
        variant: 'destructive'
      });
      setConfig(prev => prev ? { ...prev, reviewsEnabled: !isEnabled } : prev);
    } finally {
      setSavingReviews(false);
    }
  };

  if (loading) {
    return <Skeleton className="h-40 w-full" />;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center space-x-4 rounded-xl border p-4 bg-muted/10">
        <div className="flex-1 space-y-1">
          <Label htmlFor="reviews-switch" className="text-base font-bold">
            Avis et Commentaires
          </Label>
          <p className="text-sm text-muted-foreground">
            Modifier globalement la possibilité de commenter les lieux.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {savingReviews && <Loader2 className="h-4 w-4 animate-spin text-primary" />}
          <Switch
            id="reviews-switch"
            checked={config?.reviewsEnabled ?? true}
            onCheckedChange={handleToggleReviews}
            disabled={savingReviews}
          />
        </div>
      </div>
    </div>
  );
}

function MarketingConfigCard() {
  const { eventId } = useEvent();
  const [config, setConfig] = useState<MarketingConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  useEffect(() => {
    fetchMarketingConfig(eventId)
      .then(data => {
        setConfig(data);
        setLoading(false);
      })
      .catch(() => {
        toast({
          title: 'Erreur',
          description: 'Impossible de charger la configuration marketing.',
          variant: 'destructive'
        });
        setLoading(false);
      });
  }, [toast, eventId]);

  useEffect(() => {
    if (!imageFile) {
      setPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(imageFile);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [imageFile]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 2 * 1024 * 1024) {
      toast({ title: 'Fichier trop lourd', description: "L'image ne doit pas dépasser 2MB.", variant: 'destructive' });
      return;
    }
    setImageFile(file);
  };

  const handleSave = async () => {
    if (!config) return;
    setSaving(true);
    try {
      let imageUrl = config.heroImageUrl;
      if (imageFile) {
        const { url } = await uploadFile(imageFile, `events/${eventId}/marketing/hero-${crypto.randomUUID()}.jpg`);
        imageUrl = url;
      }
      const newConfig = { ...config, heroImageUrl: imageUrl };
      await updateMarketingConfig(newConfig, eventId);
      setConfig(newConfig);
      setImageFile(null);
      setPreviewUrl(null);
      toast({ title: 'Configuration marketing mise à jour' });
    } catch (error) {
      toast({ title: 'Erreur', description: 'Impossible de sauvegarder la configuration.', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <Skeleton className="h-80 w-full" />;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between rounded-xl border p-4 bg-muted/10">
        <div className="flex-1 space-y-1">
          <Label className="text-base font-bold">Activer l'overlay marketing</Label>
          <p className="text-sm text-muted-foreground">Encart promotionnel pour les visiteurs non connectés.</p>
        </div>
        <Switch
          checked={config?.heroEnabled}
          onCheckedChange={checked => setConfig(prev => prev ? { ...prev, heroEnabled: checked } : null)}
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="heroTitle">Titre</Label>
            <Input
              id="heroTitle"
              value={config?.heroTitle}
              onChange={e => setConfig(prev => prev ? { ...prev, heroTitle: e.target.value } : null)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="heroSubtitle">Sous-titre</Label>
            <Textarea
              id="heroSubtitle"
              value={config?.heroSubtitle}
              onChange={e => setConfig(prev => prev ? { ...prev, heroSubtitle: e.target.value } : null)}
            />
          </div>
        </div>
        <div className="space-y-2">
          <Label>Image de fond</Label>
          <Input type="file" accept="image/*" onChange={handleFileChange} className="hidden" id="hero-upload" />
          <label htmlFor="hero-upload" className="relative aspect-video w-full border-2 border-dashed rounded-2xl flex items-center justify-center cursor-pointer overflow-hidden group">
            {previewUrl || config?.heroImageUrl ? (
                <Image src={previewUrl || config!.heroImageUrl} alt="Hero" fill className="object-cover group-hover:scale-105 transition-transform" />
            ) : (
                <ImagePlus className="h-8 w-8 text-muted-foreground" />
            )}
          </label>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 rounded-xl border p-4 bg-muted/10">
        <div className="space-y-2">
          <Label htmlFor="heroCtaMode">Bouton CTA</Label>
          <Select
            value={config?.heroCtaMode ?? 'none'}
            onValueChange={(value) =>
              setConfig(prev => prev ? {
                ...prev,
                heroCtaMode: value as MarketingConfig['heroCtaMode'],
                heroCtaText: value === 'none' || value === 'close' ? '' : prev.heroCtaText
              } : null)
            }
          >
            <SelectTrigger id="heroCtaMode">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">Aucun bouton</SelectItem>
              <SelectItem value="auth">Connexion</SelectItem>
              <SelectItem value="external">Lien externe</SelectItem>
              <SelectItem value="close">Aucun bouton (ancien mode fermeture)</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {config?.heroCtaMode !== 'none' && config?.heroCtaMode !== 'close' && (
          <div className="space-y-2">
            <Label htmlFor="heroCtaText">Texte du bouton</Label>
            <Input
              id="heroCtaText"
              value={config?.heroCtaText}
              onChange={e => setConfig(prev => prev ? { ...prev, heroCtaText: e.target.value } : null)}
              placeholder={config?.heroCtaMode === 'auth' ? 'Se connecter' : 'En savoir plus'}
            />
          </div>
        )}

        {config?.heroCtaMode === 'external' && (
          <div className="space-y-2 md:col-span-2">
            <Label htmlFor="heroCtaLink">Lien externe</Label>
            <Input
              id="heroCtaLink"
              value={config?.heroCtaLink ?? ''}
              onChange={e => setConfig(prev => prev ? { ...prev, heroCtaLink: e.target.value } : null)}
              placeholder="https://..."
            />
          </div>
        )}
      </div>

      <Button onClick={handleSave} disabled={saving} className="w-full sm:w-auto font-bold rounded-xl h-11">
        {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
        Sauvegarder
      </Button>
    </div>
  );
}

function PrivateAccessCard() {
  const { event, eventId } = useEvent();
  const { toast } = useToast();
  const [privateUrl, setPrivateUrl] = useState<string | null>(null);
  const [links, setLinks] = useState<EventPrivateLink[]>([]);
  const [linksLoading, setLinksLoading] = useState(false);
  const [busyAction, setBusyAction] = useState<'create' | string | null>(null);
  const [previewSaving, setPreviewSaving] = useState(false);
  const [privatePreviewEnabled, setPrivatePreviewEnabled] = useState(event?.privatePreviewEnabled !== false);
  const [linkTitle, setLinkTitle] = useState('');
  const [linkDescription, setLinkDescription] = useState('');
  const [generatedLinkShareData, setGeneratedLinkShareData] = useState<{ title?: string; description?: string } | null>(null);

  const isPrivate = event?.visibility === 'private';
  const canSharePrivateUrl = !!privateUrl && typeof navigator !== 'undefined' && typeof navigator.share === 'function';

  const loadLinks = async () => {
    if (!eventId || !isPrivate) {
      setLinks([]);
      return;
    }

    setLinksLoading(true);
    try {
      setLinks(await fetchPrivateEventLinks(eventId));
    } catch (error) {
      console.error('[PrivateAccessCard] fetch links failed', {
        eventId,
        errorCode: (error as any)?.code ?? null,
        errorMessage: (error as any)?.message ?? null,
      });
      toast({
        title: 'Erreur',
        description: 'Impossible de charger les liens privés.',
        variant: 'destructive'
      });
    } finally {
      setLinksLoading(false);
    }
  };

  useEffect(() => {
    loadLinks();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventId, isPrivate]);

  useEffect(() => {
    setPrivatePreviewEnabled(event?.privatePreviewEnabled !== false);
  }, [event?.id, event?.privatePreviewEnabled]);

  const formatDate = (value?: Date) => {
    if (!value) return '—';

    return new Intl.DateTimeFormat('fr-FR', {
      dateStyle: 'short',
      timeStyle: 'short'
    }).format(value);
  };

  const getLinkStatus = (link: EventPrivateLink): 'Actif' | 'Révoqué' | 'Expiré' => {
    if (link.revokedAt) return 'Révoqué';
    if (link.expiresAt <= new Date()) return 'Expiré';
    return 'Actif';
  };

  const handleCreate = async () => {
    if (!event?.slug) return;

    setBusyAction('create');
    try {
      const title = linkTitle.trim();
      const description = linkDescription.trim();
      const result = await rotatePrivateEventToken(eventId, {
        title: title || undefined,
        description: description || undefined
      });
      const url = buildPrivateEventUrl(event.slug, result.token, window.location.origin);
      setPrivateUrl(url);
      setGeneratedLinkShareData({
        title: title || undefined,
        description: description || undefined
      });
      setLinkTitle('');
      setLinkDescription('');
      await loadLinks();

      const copied = (await navigator.clipboard
        ?.writeText(url)
        .then(() => true)
        .catch(() => false)) ?? false;

      toast({
        title: 'Lien privé généré',
        description: copied
          ? 'Le lien a été copié. Il ne sera plus affiché après fermeture de cette page.'
          : "Le lien est affiché ci-dessous. Il ne sera plus affiché après fermeture de cette page."
      });
    } catch (error) {
      console.error('[PrivateAccessCard] create failed', {
        eventId,
        errorCode: (error as any)?.code ?? null,
        errorMessage: (error as any)?.message ?? null,
      });
      toast({
        title: 'Erreur',
        description: 'Impossible de générer le lien privé.',
        variant: 'destructive'
      });
    } finally {
      setBusyAction(null);
    }
  };

  const handleCopy = async () => {
    if (!privateUrl) return;

    try {
      await navigator.clipboard.writeText(privateUrl);
      toast({ title: 'Lien copié' });
    } catch {
      toast({
        title: 'Copie indisponible',
        description: 'Sélectionnez le lien manuellement.',
        variant: 'destructive'
      });
    }
  };

  const handleShare = async () => {
    if (!privateUrl || typeof navigator === 'undefined' || typeof navigator.share !== 'function') return;

    try {
      const title = generatedLinkShareData?.title || 'Lien privé Spotly';
      const description = generatedLinkShareData?.description;

      await navigator.share({
        title,
        text: description ? `${title}\n\n${description}` : title,
        url: privateUrl
      });
    } catch (error) {
      if ((error as any)?.name === 'AbortError') return;
      toast({
        title: 'Partage indisponible',
        description: 'Utilisez Copier le lien.',
        variant: 'destructive'
      });
    }
  };

  const handleRevoke = async (linkId: string) => {
    setBusyAction(linkId);
    try {
      await revokePrivateEventLink(eventId, linkId);
      await loadLinks();
      toast({
        title: 'Lien privé révoqué',
        description: 'Seul ce lien privé est invalidé.'
      });
    } catch (error) {
      console.error('[PrivateAccessCard] revoke failed', {
        eventId,
        errorCode: (error as any)?.code ?? null,
        errorMessage: (error as any)?.message ?? null,
      });
      toast({
        title: 'Erreur',
        description: 'Impossible de révoquer le lien privé.',
        variant: 'destructive'
      });
    } finally {
      setBusyAction(null);
    }
  };

  const handlePrivatePreviewChange = async (checked: boolean) => {
    if (!eventId) return;

    const previousValue = privatePreviewEnabled;
    setPrivatePreviewEnabled(checked);
    setPreviewSaving(true);

    try {
      await updateEventPrivatePreviewEnabled(eventId, checked);
      toast({ title: 'Aperçu du lien privé mis à jour' });
    } catch (error) {
      setPrivatePreviewEnabled(previousValue);
      console.error('[PrivateAccessCard] private preview update failed', {
        eventId,
        errorCode: (error as any)?.code ?? null,
        errorMessage: (error as any)?.message ?? null,
      });
      toast({
        title: 'Erreur',
        description: "Impossible de sauvegarder l'aperçu du lien privé.",
        variant: 'destructive'
      });
    } finally {
      setPreviewSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="rounded-xl border p-4 bg-muted/10 space-y-2">
        <div className="flex items-center gap-2 font-semibold">
          <KeyRound className="h-4 w-4" />
          Accès privés
        </div>
        <p className="text-sm text-muted-foreground">
          Crée des liens de consultation lecture seule. Les tokens ne sont jamais stockés en clair.
        </p>
      </div>

      <div className="flex items-center justify-between gap-4 rounded-xl border p-4">
        <div className="min-w-0 space-y-1">
          <div className="flex items-center gap-2">
            <Label htmlFor="private-preview-enabled">Autoriser l'aperçu du lien privé</Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label="Informations sur l'aperçu du lien privé"
                  className="h-7 w-7 rounded-full text-muted-foreground"
                >
                  <HelpCircle className="h-4 w-4" />
                </Button>
              </PopoverTrigger>
              <PopoverContent align="start" className="w-80 max-w-[calc(100vw-2rem)] text-sm leading-relaxed">
                Lorsque cette option est activée, le nom, la description et la photo de couverture peuvent apparaître dans WhatsApp, Messages et d'autres applications de partage. Cela ne donne pas accès à l'événement. Ces informations peuvent rester temporairement dans le cache de ces services après la révocation du lien.
              </PopoverContent>
            </Popover>
          </div>
        </div>
        <Switch
          id="private-preview-enabled"
          checked={privatePreviewEnabled}
          onCheckedChange={handlePrivatePreviewChange}
          disabled={previewSaving}
          aria-label="Autoriser l'aperçu du lien privé"
        />
      </div>

      {!isPrivate && (
        <p className="text-sm text-muted-foreground">
          Passez la visibilité de l'événement en privé pour utiliser ce lien.
        </p>
      )}

      {privateUrl && (
        <div className="space-y-2">
          <Label htmlFor="private-event-url">Lien généré</Label>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Input id="private-event-url" value={privateUrl} readOnly className="rounded-xl font-mono text-xs" />
            <Button type="button" variant="outline" className="h-10 shrink-0 rounded-xl" onClick={handleCopy}>
              <Copy className="mr-2 h-4 w-4" />
              Copier le lien
            </Button>
            {canSharePrivateUrl && (
              <Button type="button" variant="outline" className="h-10 shrink-0 rounded-xl" onClick={handleShare}>
                <Share2 className="mr-2 h-4 w-4" />
                Partager
              </Button>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            Ce lien est affiché une seule fois. Créer un nouveau lien ne révoque pas les précédents.
          </p>
        </div>
      )}

      <div className="space-y-3 rounded-xl border p-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="private-link-title">Titre</Label>
            <Input
              id="private-link-title"
              value={linkTitle}
              onChange={(event) => setLinkTitle(event.target.value)}
              placeholder="Famille Laurent"
              disabled={!isPrivate || busyAction !== null}
              className="rounded-xl"
            />
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="private-link-description">Description</Label>
            <Textarea
              id="private-link-description"
              value={linkDescription}
              onChange={(event) => setLinkDescription(event.target.value)}
              placeholder="Accès au programme et aux lieux de notre séjour."
              disabled={!isPrivate || busyAction !== null}
              className="min-h-20 rounded-xl"
            />
          </div>
        </div>
        <Button
          type="button"
          onClick={handleCreate}
          disabled={!isPrivate || busyAction !== null}
          className="h-11 rounded-xl font-bold"
        >
          {busyAction === 'create' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
          Créer un lien privé
        </Button>
      </div>

      <div className="overflow-x-auto rounded-xl border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Lien</TableHead>
              <TableHead>Création</TableHead>
              <TableHead>Statut</TableHead>
              <TableHead>Expiration</TableHead>
              <TableHead className="w-[120px] text-right">Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {linksLoading && (
              <TableRow>
                <TableCell colSpan={5} className="text-sm text-muted-foreground">
                  Chargement...
                </TableCell>
              </TableRow>
            )}
            {!linksLoading && links.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="text-sm text-muted-foreground">
                  Aucun lien privé créé.
                </TableCell>
              </TableRow>
            )}
            {!linksLoading && links.map((link) => {
              const status = getLinkStatus(link);
              const canRevoke = status === 'Actif';

              return (
                <TableRow key={link.id}>
                  <TableCell className="min-w-[220px] text-sm">
                    <div className="font-medium">{link.title?.trim() || 'Lien privé'}</div>
                    {link.description?.trim() && (
                      <div className="mt-1 max-w-xs whitespace-normal text-xs text-muted-foreground">
                        {link.description}
                      </div>
                    )}
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-sm">{formatDate(link.createdAt)}</TableCell>
                  <TableCell className="whitespace-nowrap text-sm">{status}</TableCell>
                  <TableCell className="whitespace-nowrap text-sm">{formatDate(link.expiresAt)}</TableCell>
                  <TableCell className="text-right">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => handleRevoke(link.id)}
                      disabled={!canRevoke || busyAction !== null}
                      className="h-9 rounded-xl"
                    >
                      {busyAction === link.id ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Trash2 className="mr-2 h-4 w-4" />}
                      Révoquer
                    </Button>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

export default function AdminPage() {
  const { firebaseUser, role, loading: authLoading, profileLoading } = useAuth();
  const { event, loading: eventLoading, userRole, roleLoading } = useEvent();
  const router = useRouter();

  // Autorisation : Admin local ou Owner global
  const isAuthorized = role === 'owner' || userRole === 'admin';
  const authOrProfileLoading = authLoading || (!!firebaseUser && profileLoading);
  const accessLoading = authOrProfileLoading || eventLoading || roleLoading;

  useEffect(() => {
    if (!accessLoading && !isAuthorized) {
        router.replace('/dashboard');
    }
  }, [accessLoading, isAuthorized, router]);

  if (accessLoading) return <div className="p-12 text-center text-muted-foreground animate-pulse">Chargement de l'administration...</div>;
  if (!isAuthorized) return null;

  return (
    <AppLayout>
      <div className="h-full overflow-y-auto p-6 space-y-8">
        <div className="space-y-1">
           <h1 className="text-3xl font-bold tracking-tight">Réglages de l'Événement</h1>
           <p className="text-muted-foreground">Configuration de l'expérience visiteur pour : <span className="font-bold text-foreground">{event?.name}</span></p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          <Card className="rounded-[2rem] border-muted/60 shadow-sm overflow-hidden">
            <CardHeader className="bg-primary/5">
              <CardTitle>Informations</CardTitle>
              <CardDescription>Nom, dates, fuseau horaire et localisation de l'événement.</CardDescription>
            </CardHeader>
            <CardContent className="pt-6">
              <EventDetailsCard />
            </CardContent>
          </Card>

          <Card className="rounded-[2rem] border-muted/60 shadow-sm overflow-hidden">
            <CardHeader className="bg-primary/5">
              <CardTitle>Application</CardTitle>
              <CardDescription>Gérez les fonctionnalités disponibles pour les visiteurs.</CardDescription>
            </CardHeader>
            <CardContent className="pt-6">
              <AppConfigCard />
            </CardContent>
          </Card>

          <Card className="rounded-[2rem] border-muted/60 shadow-sm overflow-hidden lg:col-span-2">
            <CardHeader className="bg-primary/5">
              <CardTitle>Catégories des lieux</CardTitle>
              <CardDescription>Personnalisez les catégories utilisées pour organiser les lieux de votre événement.</CardDescription>
            </CardHeader>
            <CardContent className="pt-6">
              <PoiCategoriesCard />
            </CardContent>
          </Card>

          <Card className="rounded-[2rem] border-muted/60 shadow-sm overflow-hidden">
            <CardHeader className="bg-primary/5">
              <CardTitle>Accès privés</CardTitle>
              <CardDescription>Créez et révoquez les liens d'accès lecture seule.</CardDescription>
            </CardHeader>
            <CardContent className="pt-6">
              <PrivateAccessCard />
            </CardContent>
          </Card>

          <Card className="rounded-[2rem] border-muted/60 shadow-sm overflow-hidden">
            <CardHeader className="bg-primary/5">
              <CardTitle>Marketing</CardTitle>
              <CardDescription>Promotion et messages d'accueil.</CardDescription>
            </CardHeader>
            <CardContent className="pt-6">
              <MarketingConfigCard />
            </CardContent>
          </Card>
        </div>
      </div>
    </AppLayout>
  );
}
