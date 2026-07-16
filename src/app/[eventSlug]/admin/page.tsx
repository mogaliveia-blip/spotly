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
  uploadFile
} from '@/lib/data';
import type { AppConfig, MarketingConfig } from '@/lib/types';
import { AppLayout } from '@/components/layout/app-layout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { Trash2, Loader2, ImagePlus } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import Image from 'next/image';
import { useEvent } from '@/providers/event-provider';

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
  const [startDate, setStartDate] = useState(toDateInputValue(event?.startDate));
  const [endDate, setEndDate] = useState(toDateInputValue(event?.endDate));
  const [timezone, setTimezone] = useState(event?.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone ?? 'Europe/Paris');
  const [city, setCity] = useState(event?.city ?? '');
  const [departmentName, setDepartmentName] = useState(event?.departmentName ?? '');
  const [region, setRegion] = useState(event?.region ?? '');
  const [country, setCountry] = useState(event?.country ?? 'France');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setName(event?.name ?? '');
    setStartDate(toDateInputValue(event?.startDate));
    setEndDate(toDateInputValue(event?.endDate));
    setTimezone(event?.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone ?? 'Europe/Paris');
    setCity(event?.city ?? '');
    setDepartmentName(event?.departmentName ?? '');
    setRegion(event?.region ?? '');
    setCountry(event?.country ?? 'France');
  }, [event]);

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

    setSaving(true);
    try {
      await updateEventDetails(eventId, {
        name: name.trim(),
        startDate: parseDateInputValue(startDate),
        endDate: parseDateInputValue(endDate),
        timezone: timezone.trim() || 'Europe/Paris',
        city: optionalText(city),
        departmentName: optionalText(departmentName),
        region: optionalText(region),
        country: optionalText(country)
      });
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

/* =========================
   APP CONFIG CARD
========================= */

function AppConfigCard() {
  const { eventId } = useEvent();
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingKey, setSavingKey] = useState<'landing' | 'reviews' | null>(null);
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

  const handleToggleLandingPage = async (isActive: boolean) => {
    setSavingKey('landing');
    try {
      await updateAppConfig({ isLandingPageActive: isActive }, eventId);
      setConfig(prev => prev ? { ...prev, isLandingPageActive: isActive } : prev);
      toast({
        title: 'Configuration mise à jour',
        description: `La page d'accueil a été ${isActive ? 'activée' : 'désactivée'}.`
      });
    } catch {
      toast({
        title: 'Erreur',
        description: 'Impossible de mettre à jour la configuration.',
        variant: 'destructive'
      });
      setConfig(prev => prev ? { ...prev, isLandingPageActive: !isActive } : prev);
    } finally {
      setSavingKey(null);
    }
  };

  const handleToggleReviews = async (isEnabled: boolean) => {
    setSavingKey('reviews');
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
      setSavingKey(null);
    }
  };

  if (loading) {
    return <Skeleton className="h-40 w-full" />;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center space-x-4 rounded-xl border p-4 bg-muted/10">
        <div className="flex-1 space-y-1">
          <Label htmlFor="landing-page-switch" className="text-base font-bold">
            Page d'accueil (Pré-événement)
          </Label>
          <p className="text-sm text-muted-foreground">
            Si activée, les visiteurs verront une page d'attente.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {savingKey === 'landing' && <Loader2 className="h-4 w-4 animate-spin text-primary" />}
          <Switch
            id="landing-page-switch"
            checked={config?.isLandingPageActive ?? true}
            onCheckedChange={handleToggleLandingPage}
            disabled={savingKey !== null}
          />
        </div>
      </div>

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
          {savingKey === 'reviews' && <Loader2 className="h-4 w-4 animate-spin text-primary" />}
          <Switch
            id="reviews-switch"
            checked={config?.reviewsEnabled ?? true}
            onCheckedChange={handleToggleReviews}
            disabled={savingKey !== null}
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

export default function AdminPage() {
  const { role, loading: authLoading } = useAuth();
  const { event, loading: eventLoading, userRole } = useEvent();
  const router = useRouter();

  // Autorisation : Admin local ou Owner global
  const isAuthorized = role === 'owner' || userRole === 'admin';

  useEffect(() => {
    if (!authLoading && !eventLoading && !isAuthorized) {
        router.replace('/dashboard');
    }
  }, [isAuthorized, authLoading, eventLoading, router]);

  if (authLoading || eventLoading) return <div className="p-12 text-center text-muted-foreground animate-pulse">Chargement de l'administration...</div>;
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
              <CardDescription>Paramètres globaux pour cet événement.</CardDescription>
            </CardHeader>
            <CardContent className="pt-6">
              <AppConfigCard />
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
