'use client';

import React, { useEffect, useState, useMemo } from 'react';
import { useAuth } from '@/hooks/use-auth-user';
import { useRouter } from 'next/navigation';
import {
  fetchUsers,
  fetchAllEvents,
  fetchEventMembers,
  updateUserRole,
  updateUserApproval,
  fetchAppConfig,
  updateAppConfig,
  fetchMarketingConfig,
  updateMarketingConfig,
  uploadFile,
  DEFAULT_EVENT_ID
} from '@/lib/data';
import type { AppUser, UserRole, AppConfig, MarketingConfig, AppEvent, EventMemberWithProfile, EventRole, EventStatus } from '@/lib/types';
import { AppLayout } from '@/components/layout/app-layout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { CalendarDays, ImagePlus, Loader2, Search, ShieldCheck, UserCheck, UserX, UsersRound } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import Image from 'next/image';
import { Badge } from '@/components/ui/badge';
import Link from 'next/link';
import { cn } from '@/lib/utils';

const PLATFORM_ROLE_DESCRIPTIONS: Record<UserRole, string> = {
  owner: 'Administration globale, validation des comptes et supervision plateforme.',
  user: "Compte standard. Les droits admin/editor se donnent dans l'équipe d'un événement."
};

type UserEventMembership = {
  event: AppEvent;
  role: EventRole;
  joinedAt?: Date;
};

type UserWithEventMemberships = AppUser & {
  memberships: UserEventMembership[];
};

type EventStatusFilter = 'all' | EventStatus;

function getStatusLabel(status: EventStatus): string {
  if (status === 'published') return 'Publié';
  if (status === 'paused') return 'En pause';
  return 'Brouillon';
}

function getStatusBadgeClass(status: EventStatus): string {
  return cn(
    'text-[10px] uppercase font-bold',
    status === 'published' && 'bg-green-500/10 text-green-600 border-none',
    status === 'paused' && 'bg-amber-500/10 text-amber-600 border-none',
    status === 'draft' && 'text-muted-foreground'
  );
}

function formatDate(date?: Date): string | null {
  if (!date) return null;
  return date.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' });
}

/* =========================
   APP CONFIG CARD
========================= */

function AppConfigCard() {
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingKey, setSavingKey] = useState<'landing' | 'reviews' | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    fetchAppConfig(DEFAULT_EVENT_ID)
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
  }, [toast]);

  const handleToggleLandingPage = async (isActive: boolean) => {
    setSavingKey('landing');
    try {
      await updateAppConfig({ isLandingPageActive: isActive }, DEFAULT_EVENT_ID);
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
      await updateAppConfig({ reviewsEnabled: isEnabled }, DEFAULT_EVENT_ID);
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
    return <Skeleton className="h-20 w-full" />;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center space-x-4 rounded-md border p-4">
        <div className="flex-1 space-y-1">
          <Label htmlFor="landing-page-switch" className="text-base font-medium">
            Activer la page d'accueil (mode pré-événement)
          </Label>
          <p className="text-sm text-muted-foreground">
            Si activée, les visiteurs verront une landing page.
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

      <div className="flex items-center space-x-4 rounded-md border p-4">
        <div className="flex-1 space-y-1">
          <Label htmlFor="reviews-switch" className="text-base font-medium">
            Activer les avis et commentaires
          </Label>
          <p className="text-sm text-muted-foreground">
            Activer globalement les avis sur les lieux.
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
  const [config, setConfig] = useState<MarketingConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  useEffect(() => {
    fetchMarketingConfig(DEFAULT_EVENT_ID)
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
  }, [toast]);

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
        const { url } = await uploadFile(imageFile, `marketing/hero/${crypto.randomUUID()}`);
        imageUrl = url;
      }
      const newConfig = { ...config, heroImageUrl: imageUrl };
      await updateMarketingConfig(newConfig, DEFAULT_EVENT_ID);
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

  if (loading) return <Skeleton className="h-96 w-full" />;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between rounded-md border p-4">
        <div className="flex-1 space-y-1">
          <Label htmlFor="hero-enabled-switch" className="text-base font-medium">Activer l'overlay marketing</Label>
        </div>
        <Switch
          id="hero-enabled-switch"
          checked={config?.heroEnabled}
          onCheckedChange={checked => setConfig(prev => prev ? { ...prev, heroEnabled: checked } : null)}
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="heroTitle">Titre</Label>
            <Input id="heroTitle" value={config?.heroTitle} onChange={e => setConfig(prev => prev ? { ...prev, heroTitle: e.target.value } : null)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="heroSubtitle">Sous-titre</Label>
            <Textarea id="heroSubtitle" value={config?.heroSubtitle} onChange={e => setConfig(prev => prev ? { ...prev, heroSubtitle: e.target.value } : null)} />
          </div>
        </div>
        <div className="space-y-2">
            <Label>Image</Label>
            <Input type="file" onChange={handleFileChange} className="hidden" id="hero-img" />
            <label htmlFor="hero-img" className="relative aspect-video w-full border-2 border-dashed rounded-lg flex items-center justify-center cursor-pointer overflow-hidden">
                {previewUrl || config?.heroImageUrl ? (
                    <Image src={previewUrl || config!.heroImageUrl} alt="Hero" fill className="object-cover" />
                ) : <ImagePlus className="h-12 w-12 text-muted-foreground" />}
            </label>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 rounded-md border p-4">
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

      <Button onClick={handleSave} disabled={saving}>
        {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
        Sauvegarder
      </Button>
    </div>
  );
}

function UserEventsOverviewCard() {
  const [rows, setRows] = useState<UserWithEventMemberships[]>([]);
  const [eventsCount, setEventsCount] = useState(0);
  const [membershipsCount, setMembershipsCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [roleFilter, setRoleFilter] = useState<'all' | UserRole>('all');
  const [eventStatusFilter, setEventStatusFilter] = useState<EventStatusFilter>('all');
  const { toast } = useToast();

  useEffect(() => {
    let isMounted = true;

    async function loadOverview() {
      try {
        const [users, events] = await Promise.all([
          fetchUsers(),
          fetchAllEvents()
        ]);

        const membershipsByUser = new Map<string, UserEventMembership[]>();
        let totalMemberships = 0;

        await Promise.all(events.map(async (event) => {
          const members = await fetchEventMembers(event.id);
          totalMemberships += members.length;

          members.forEach((member: EventMemberWithProfile) => {
            const current = membershipsByUser.get(member.uid) ?? [];
            current.push({
              event,
              role: member.role,
              joinedAt: member.joinedAt
            });
            membershipsByUser.set(member.uid, current);
          });
        }));

        const nextRows = users
          .map((user) => ({
            ...user,
            memberships: (membershipsByUser.get(user.uid) ?? [])
              .sort((a, b) => a.event.name.localeCompare(b.event.name, 'fr'))
          }))
          .sort((a, b) => (a.displayName || a.email || '').localeCompare(b.displayName || b.email || '', 'fr'));

        if (!isMounted) return;
        setRows(nextRows);
        setEventsCount(events.length);
        setMembershipsCount(totalMemberships);
      } catch {
        if (!isMounted) return;
        toast({
          title: 'Erreur',
          description: "Impossible de charger la vue Utilisateurs & Événements.",
          variant: 'destructive'
        });
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    void loadOverview();

    return () => {
      isMounted = false;
    };
  }, [toast]);

  const filteredRows = useMemo(() => {
    const normalizedSearch = searchTerm.trim().toLowerCase();

    return rows
      .map((user) => ({
        ...user,
        memberships: user.memberships.filter((membership) =>
          eventStatusFilter === 'all' || membership.event.status === eventStatusFilter
        )
      }))
      .filter((user) => {
        const matchesSearch =
          !normalizedSearch ||
          user.displayName?.toLowerCase().includes(normalizedSearch) ||
          user.email?.toLowerCase().includes(normalizedSearch);
        const matchesRole = roleFilter === 'all' || user.role === roleFilter;
        const matchesEventStatus = eventStatusFilter === 'all' || user.memberships.length > 0;
        return matchesSearch && matchesRole && matchesEventStatus;
      });
  }, [rows, searchTerm, roleFilter, eventStatusFilter]);

  const renderUserIdentity = (user: AppUser) => (
    <div className="flex min-w-0 items-center gap-3">
      <Avatar className="h-10 w-10 shrink-0">
        <AvatarImage src={user.photoURL || undefined} />
        <AvatarFallback>{user.displayName?.charAt(0) || user.email?.charAt(0) || 'U'}</AvatarFallback>
      </Avatar>
      <div className="min-w-0">
        <div className="truncate text-sm font-semibold">{user.displayName || 'Utilisateur sans nom'}</div>
        <div className="truncate text-xs text-muted-foreground">{user.email || 'Email non renseigné'}</div>
        <div className="mt-2 flex flex-wrap gap-2 md:hidden">
          <Badge variant={user.role === 'owner' ? 'default' : 'outline'}>{user.role}</Badge>
          <Badge variant={user.isApproved ? 'default' : 'outline'} className={user.isApproved ? 'bg-green-500 hover:bg-green-600' : ''}>
            {user.isApproved ? 'Approuvé' : 'En attente'}
          </Badge>
        </div>
      </div>
    </div>
  );

  const renderMemberships = (memberships: UserEventMembership[]) => {
    if (memberships.length === 0) {
      return <div className="text-sm text-muted-foreground">Aucun événement associé.</div>;
    }

    return (
      <div className="space-y-3">
        {memberships.map(({ event, role, joinedAt }) => {
          const href = event.slug ? `/${event.slug}/admin` : '/admin/events';
          const createdAt = formatDate(event.createdAt);

          return (
            <div key={`${event.id}-${role}`} className="rounded-xl border bg-muted/20 p-3">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div className="min-w-0 space-y-2">
                  <div className="font-semibold leading-tight">{event.name}</div>
                  <div className="flex flex-wrap gap-2">
                    <Badge variant={event.status === 'published' ? 'default' : 'outline'} className={getStatusBadgeClass(event.status)}>
                      {getStatusLabel(event.status)}
                    </Badge>
                    <Badge variant="secondary" className="text-[10px] uppercase font-bold">{role}</Badge>
                    {createdAt && <Badge variant="outline" className="text-[10px] uppercase font-bold">Créé le {createdAt}</Badge>}
                    {!createdAt && joinedAt && <Badge variant="outline" className="text-[10px] uppercase font-bold">Membre depuis {formatDate(joinedAt)}</Badge>}
                  </div>
                </div>
                <Button asChild size="sm" variant="outline" className="h-9 shrink-0 rounded-xl">
                  <Link href={href}>Ouvrir</Link>
                </Button>
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  if (loading) return <Skeleton className="h-64 w-full" />;

  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl border bg-muted/20 p-4">
          <div className="text-2xl font-bold">{rows.length}</div>
          <div className="text-xs font-medium text-muted-foreground">Utilisateurs</div>
        </div>
        <div className="rounded-xl border bg-muted/20 p-4">
          <div className="text-2xl font-bold">{eventsCount}</div>
          <div className="text-xs font-medium text-muted-foreground">Événements</div>
        </div>
        <div className="rounded-xl border bg-muted/20 p-4">
          <div className="text-2xl font-bold">{membershipsCount}</div>
          <div className="text-xs font-medium text-muted-foreground">Memberships</div>
        </div>
      </div>

      <div className="grid gap-3 lg:grid-cols-[1fr_180px_220px]">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
            placeholder="Rechercher nom ou email"
            className="pl-9"
          />
        </div>
        <Select value={roleFilter} onValueChange={(value) => setRoleFilter(value as 'all' | UserRole)}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tous</SelectItem>
            <SelectItem value="owner">Owner</SelectItem>
            <SelectItem value="user">Users</SelectItem>
          </SelectContent>
        </Select>
        <Select value={eventStatusFilter} onValueChange={(value) => setEventStatusFilter(value as EventStatusFilter)}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tous les événements</SelectItem>
            <SelectItem value="published">Publiés</SelectItem>
            <SelectItem value="draft">Brouillons</SelectItem>
            <SelectItem value="paused">En pause</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="hidden rounded-md border md:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Utilisateur</TableHead>
              <TableHead>Rôle plateforme</TableHead>
              <TableHead>Événements associés</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredRows.map((user) => (
              <TableRow key={user.uid}>
                <TableCell className="w-[280px] align-top">{renderUserIdentity(user)}</TableCell>
                <TableCell className="w-[180px] align-top">
                  <div className="flex flex-col items-start gap-2">
                    <Badge variant={user.role === 'owner' ? 'default' : 'outline'}>{user.role}</Badge>
                    <Badge variant={user.isApproved ? 'default' : 'outline'} className={user.isApproved ? 'bg-green-500 hover:bg-green-600' : ''}>
                      {user.isApproved ? 'Approuvé' : 'En attente'}
                    </Badge>
                  </div>
                </TableCell>
                <TableCell className="align-top">{renderMemberships(user.memberships)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <div className="space-y-4 md:hidden">
        {filteredRows.map((user) => (
          <div key={user.uid} className="rounded-2xl border p-4">
            <div className="space-y-4">
              {renderUserIdentity(user)}
              {renderMemberships(user.memberships)}
            </div>
          </div>
        ))}
      </div>

      {filteredRows.length === 0 && (
        <div className="rounded-xl border bg-muted/20 p-8 text-center text-sm text-muted-foreground">
          Aucun utilisateur ne correspond aux filtres.
        </div>
      )}
    </div>
  );
}

function UserTable() {
  const [users, setUsers] = useState<AppUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filter, setFilter] = useState<'all' | 'pending' | 'approved'>('all');
  const { user: currentUser } = useAuth();
  const { toast } = useToast();

  useEffect(() => {
    fetchUsers().then(setUsers).finally(() => setLoading(false));
  }, []);

  const filteredUsers = useMemo(() => {
    return users.filter(u => {
        const matchesSearch = !searchTerm || u.displayName?.toLowerCase().includes(searchTerm.toLowerCase()) || u.email?.toLowerCase().includes(searchTerm.toLowerCase());
        const matchesFilter = filter === 'all' || (filter === 'approved' ? u.isApproved : !u.isApproved);
        return matchesSearch && matchesFilter;
    }).sort((a, b) => (a.isApproved === b.isApproved ? 0 : a.isApproved ? 1 : -1));
  }, [users, searchTerm, filter]);

  const handleRoleChange = async (uid: string, newRole: UserRole) => {
    const previousUsers = users;
    setUsers(users.map(u => (u.uid === uid ? { ...u, role: newRole } : u)));

    try {
      await updateUserRole(uid, newRole);
      toast({
        title: 'Rôle plateforme mis à jour',
        description: "Les rôles d'événement restent gérés dans l'équipe de chaque événement."
      });
    } catch {
      setUsers(previousUsers);
      toast({
        title: 'Erreur',
        description: 'Impossible de modifier le rôle plateforme.',
        variant: 'destructive'
      });
    }
  };

  const handleApprovalToggle = async (uid: string, currentStatus: boolean) => {
    try {
        await updateUserApproval(uid, !currentStatus);
        setUsers(users.map(u => (u.uid === uid ? { ...u, isApproved: !currentStatus } : u)));
        toast({ title: !currentStatus ? 'Utilisateur approuvé' : 'Accès révoqué' });
    } catch (e) {
        toast({ title: 'Erreur', variant: 'destructive' });
    }
  };

  if (loading) return <Skeleton className="h-40 w-full" />;

  return (
    <div className="space-y-6">
      <div className="rounded-xl border bg-muted/20 p-4 text-sm text-muted-foreground">
        Cette table gère uniquement les rôles plateforme : <span className="font-semibold text-foreground">owner</span> et <span className="font-semibold text-foreground">user</span>. Les rôles événement <span className="font-semibold text-foreground">admin</span> et <span className="font-semibold text-foreground">editor</span> se gèrent dans l'équipe de chaque événement.
      </div>

      <div className="grid gap-3 md:grid-cols-[1fr_220px]">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Rechercher nom ou email"
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={filter} onValueChange={(v: any) => setFilter(v)}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tous les utilisateurs</SelectItem>
            <SelectItem value="pending">En attente uniquement</SelectItem>
            <SelectItem value="approved">Approuvés uniquement</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="hidden rounded-md border md:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Utilisateur</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Rôle</TableHead>
              <TableHead>Statut</TableHead>
              <TableHead className="hidden lg:table-cell">Périmètre</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredUsers.map(user => (
              <TableRow key={user.uid}>
                <TableCell className="w-[240px]">
                  <div className="flex min-w-0 items-center gap-3">
                    <Avatar className="h-10 w-10 shrink-0">
                      <AvatarImage src={user.photoURL || undefined} />
                      <AvatarFallback>{user.displayName?.charAt(0) || user.email?.charAt(0) || 'U'}</AvatarFallback>
                    </Avatar>
                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold">{user.displayName || 'Utilisateur sans nom'}</div>
                    </div>
                  </div>
                </TableCell>
                <TableCell className="max-w-[260px]">
                  <div className="truncate text-sm text-muted-foreground">{user.email || 'Email non renseigné'}</div>
                </TableCell>
                <TableCell>
                  <Select
                    value={user.role}
                    onValueChange={v => handleRoleChange(user.uid, v as UserRole)}
                    disabled={user.uid === currentUser?.uid}
                  >
                    <SelectTrigger className="h-9 w-[170px] text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="owner">Owner plateforme</SelectItem>
                      <SelectItem value="user">Utilisateur</SelectItem>
                    </SelectContent>
                  </Select>
                </TableCell>
                <TableCell>
                  <Badge variant={user.isApproved ? "default" : "outline"} className={user.isApproved ? "bg-green-500 hover:bg-green-600" : ""}>
                    {user.isApproved ? "Approuvé" : "En attente"}
                  </Badge>
                </TableCell>
                <TableCell className="hidden lg:table-cell max-w-xs">
                  <div className="text-xs text-muted-foreground">
                    {PLATFORM_ROLE_DESCRIPTIONS[user.role]}
                  </div>
                </TableCell>
                <TableCell className="text-right">
                  {user.uid !== currentUser?.uid && (
                    <Button
                      variant={user.isApproved ? "ghost" : "default"}
                      size="sm"
                      className="h-9 gap-1 rounded-lg"
                      onClick={() => handleApprovalToggle(user.uid, user.isApproved)}
                    >
                      {user.isApproved ? <UserX className="h-3 w-3" /> : <UserCheck className="h-3 w-3" />}
                      <span>{user.isApproved ? "Révoquer" : "Approuver"}</span>
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <div className="space-y-4 md:hidden">
        {filteredUsers.map(user => (
          <div key={user.uid} className="rounded-2xl border p-4">
            <div className="space-y-4">
              <div className="flex min-w-0 items-start gap-3">
                <Avatar className="h-10 w-10 shrink-0">
                  <AvatarImage src={user.photoURL || undefined} />
                  <AvatarFallback>{user.displayName?.charAt(0) || user.email?.charAt(0) || 'U'}</AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <div className="break-words text-sm font-semibold">{user.displayName || 'Utilisateur sans nom'}</div>
                  <div className="break-words text-xs text-muted-foreground">{user.email || 'Email non renseigné'}</div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <Badge variant={user.role === 'owner' ? 'default' : 'outline'}>{user.role}</Badge>
                    <Badge variant={user.isApproved ? "default" : "outline"} className={user.isApproved ? "bg-green-500 hover:bg-green-600" : ""}>
                      {user.isApproved ? "Approuvé" : "En attente"}
                    </Badge>
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <div className="text-xs font-medium text-muted-foreground">Rôle plateforme</div>
                <Select
                  value={user.role}
                  onValueChange={v => handleRoleChange(user.uid, v as UserRole)}
                  disabled={user.uid === currentUser?.uid}
                >
                  <SelectTrigger className="h-11 w-full text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="owner">Owner plateforme</SelectItem>
                    <SelectItem value="user">Utilisateur</SelectItem>
                  </SelectContent>
                </Select>
                <div className="text-xs text-muted-foreground">{PLATFORM_ROLE_DESCRIPTIONS[user.role]}</div>
              </div>

              {user.uid !== currentUser?.uid && (
                <Button
                  variant={user.isApproved ? "outline" : "default"}
                  className="h-11 w-full gap-2 rounded-xl"
                  onClick={() => handleApprovalToggle(user.uid, user.isApproved)}
                >
                  {user.isApproved ? <UserX className="h-4 w-4" /> : <UserCheck className="h-4 w-4" />}
                  {user.isApproved ? "Révoquer" : "Approuver"}
                </Button>
              )}
            </div>
          </div>
        ))}
      </div>

      {filteredUsers.length === 0 && (
        <div className="rounded-xl border bg-muted/20 p-8 text-center text-sm text-muted-foreground">
          Aucun utilisateur ne correspond aux filtres.
        </div>
      )}
    </div>
  );
}

export default function AdminPage() {
  const { firebaseUser, role, loading, profileLoading } = useAuth();
  const router = useRouter();

  // Seul le rôle global 'owner' peut désormais accéder à l'administration de la plateforme
  const canAccess = role === 'owner';
  const authOrProfileLoading = loading || (!!firebaseUser && profileLoading);

  useEffect(() => {
    if (!authOrProfileLoading && !canAccess) router.replace('/dashboard');
  }, [authOrProfileLoading, canAccess, router]);

  if (authOrProfileLoading) return <div className="p-12 text-center text-muted-foreground animate-pulse">Chargement de l'administration...</div>;
  if (!canAccess) return null;

  return (
    <AppLayout>
      <div className="h-full overflow-y-auto p-6 space-y-8">
        <div className="space-y-2">
          <h1 className="text-3xl font-bold tracking-tight">Administration Plateforme</h1>
          <p className="text-muted-foreground">
            Console réservée aux owners pour valider les comptes, gérer les owners plateforme et superviser Spotly.
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <Card className="rounded-2xl border-muted shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <ShieldCheck className="h-4 w-4 text-primary" />
                Rôles plateforme
              </CardTitle>
              <CardDescription>Attribués sur les documents users.</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-2">
              <Badge>owner</Badge>
              <Badge variant="outline">user</Badge>
            </CardContent>
          </Card>

          <Card className="rounded-2xl border-muted shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <UsersRound className="h-4 w-4 text-primary" />
                Rôles événement
              </CardTitle>
              <CardDescription>Attribués dans events/{'{eventId}'}/members.</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-2">
              <Badge variant="secondary">admin</Badge>
              <Badge variant="secondary">editor</Badge>
            </CardContent>
          </Card>

          <Card className="rounded-2xl border-muted shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <CalendarDays className="h-4 w-4 text-primary" />
                Équipes événement
              </CardTitle>
              <CardDescription>La gestion admin/editor se fait événement par événement.</CardDescription>
            </CardHeader>
            <CardContent>
              <Button asChild variant="outline" className="h-9 rounded-xl">
                <Link href="/admin/events">Voir les événements</Link>
              </Button>
            </CardContent>
          </Card>
        </div>
        
        <Card className="rounded-2xl border-muted shadow-sm overflow-hidden">
            <CardHeader className="bg-primary/5">
              <CardTitle>Gestion des utilisateurs plateforme</CardTitle>
              <CardDescription>Validez les accès et gérez uniquement les rôles globaux owner/user.</CardDescription>
            </CardHeader>
            <CardContent className="pt-6">
              <UserTable />
            </CardContent>
          </Card>

        <Card className="rounded-2xl border-muted shadow-sm overflow-hidden">
            <CardHeader className="bg-primary/5">
              <CardTitle>Utilisateurs & Événements</CardTitle>
              <CardDescription>Visualiser les événements auxquels chaque utilisateur participe ainsi que son rôle dans chacun d'eux.</CardDescription>
            </CardHeader>
            <CardContent className="pt-6">
              <UserEventsOverviewCard />
            </CardContent>
          </Card>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          <Card className="rounded-2xl border-muted shadow-sm overflow-hidden">
            <CardHeader className="bg-primary/5">
              <CardTitle>Configuration Globale</CardTitle>
              <CardDescription>Paramètres applicables à toute la plateforme.</CardDescription>
            </CardHeader>
            <CardContent className="pt-6">
              <AppConfigCard />
            </CardContent>
          </Card>

          <Card className="rounded-2xl border-muted shadow-sm overflow-hidden">
            <CardHeader className="bg-primary/5">
              <CardTitle>Marketing Global</CardTitle>
              <CardDescription>Overlay marketing pour les visiteurs non connectés.</CardDescription>
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
