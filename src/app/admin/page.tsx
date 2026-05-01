'use client';

import React, { useEffect, useState, useMemo } from 'react';
import { useAuth } from '@/hooks/use-auth-user';
import { useRouter } from 'next/navigation';
import {
  fetchUsers,
  updateUserRole,
  updateUserApproval,
  fetchAppConfig,
  updateAppConfig,
  fetchMarketingConfig,
  updateMarketingConfig,
  uploadFile,
  DEFAULT_EVENT_ID
} from '@/lib/data';
import type { AppUser, UserRole, AppConfig, MarketingConfig } from '@/lib/types';
import { AppLayout } from '@/components/layout/app-layout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { Trash2, Loader2, ImagePlus, UserCheck, UserX } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import Image from 'next/image';
import { Badge } from '@/components/ui/badge';

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
          {savingKey === 'landing' && <Loader2 className="h-4 w-4 animate-spin" />}
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
          {savingKey === 'reviews' && <Loader2 className="h-4 w-4 animate-spin" />}
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

      <Button onClick={handleSave} disabled={saving}>
        {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
        Sauvegarder
      </Button>
    </div>
  );
}

function UserTable() {
  const [users, setUsers] = useState<AppUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filter, setFilter] = useState<'all' | 'pending' | 'approved'>('all');
  const { user: currentUser, role: currentUserRole } = useAuth();
  const { toast } = useToast();

  const isOwner = currentUserRole === 'owner';

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

  const handleRoleChange = (uid: string, newRole: UserRole) => {
    if (!isOwner) return;
    updateUserRole(uid, newRole);
    setUsers(users.map(u => (u.uid === uid ? { ...u, role: newRole } : u)));
    toast({ title: 'Rôle mis à jour' });
  };

  const handleApprovalToggle = async (uid: string, currentStatus: boolean) => {
    if (!isOwner) return;
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
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row gap-4">
        <Input placeholder="Rechercher..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="max-w-sm" />
        <Select value={filter} onValueChange={(v: any) => setFilter(v)}>
          <SelectTrigger className="w-[180px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tous les utilisateurs</SelectItem>
            <SelectItem value="pending">En attente uniquement</SelectItem>
            <SelectItem value="approved">Approuvés uniquement</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Utilisateur</TableHead>
              <TableHead>Statut</TableHead>
              <TableHead>Rôle Plateforme</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredUsers.map(user => (
              <TableRow key={user.uid}>
                <TableCell>
                  <div className="flex items-center gap-3">
                    <Avatar className="h-8 w-8">
                      <AvatarImage src={user.photoURL || undefined} />
                      <AvatarFallback>{user.displayName?.charAt(0) || 'U'}</AvatarFallback>
                    </Avatar>
                    <div>
                      <div className="font-medium text-sm">{user.displayName}</div>
                      <div className="text-xs text-muted-foreground">{user.email}</div>
                    </div>
                  </div>
                </TableCell>
                <TableCell>
                  <Badge variant={user.isApproved ? "default" : "outline"} className={user.isApproved ? "bg-green-500 hover:bg-green-600" : ""}>
                    {user.isApproved ? "Approuvé" : "En attente"}
                  </Badge>
                </TableCell>
                <TableCell>
                  {isOwner ? (
                    <Select 
                      value={user.role} 
                      onValueChange={v => handleRoleChange(user.uid, v as UserRole)} 
                      disabled={user.uid === currentUser?.uid}
                    >
                      <SelectTrigger className="w-[110px] h-8 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="owner">Owner</SelectItem>
                        <SelectItem value="user">User</SelectItem>
                      </SelectContent>
                    </Select>
                  ) : (
                    <Badge variant="outline" className="h-8 capitalize">{user.role}</Badge>
                  )}
                </TableCell>
                <TableCell className="text-right">
                  {isOwner && user.uid !== currentUser?.uid && (
                    <Button
                      variant={user.isApproved ? "ghost" : "default"}
                      size="sm"
                      className="h-8 gap-1 rounded-lg"
                      onClick={() => handleApprovalToggle(user.uid, user.isApproved)}
                    >
                      {user.isApproved ? <UserX className="h-3 w-3" /> : <UserCheck className="h-3 w-3" />}
                      <span className="hidden sm:inline">{user.isApproved ? "Révoquer" : "Approuver"}</span>
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

export default function AdminPage() {
  const { role, loading } = useAuth();
  const router = useRouter();

  // Seul le rôle 'owner' peut désormais accéder à l'administration globale
  const canAccess = role === 'owner';

  useEffect(() => {
    if (!loading && !canAccess) router.replace('/dashboard');
  }, [role, loading, router, canAccess]);

  if (loading) return <div className="p-12 text-center text-muted-foreground animate-pulse">Chargement de l'administration...</div>;
  if (!canAccess) return null;

  return (
    <AppLayout>
      <div className="h-full overflow-y-auto p-6 space-y-8">
        <h1 className="text-3xl font-bold tracking-tight">Administration Plateforme</h1>
        
        <Card className="rounded-2xl border-muted shadow-sm overflow-hidden">
            <CardHeader className="bg-primary/5">
              <CardTitle>Gestion des Utilisateurs</CardTitle>
              <CardDescription>Validez les accès et gérez les rôles propriétaires.</CardDescription>
            </CardHeader>
            <CardContent className="pt-6">
              <UserTable />
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