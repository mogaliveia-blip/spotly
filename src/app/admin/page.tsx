// src/app/admin/page.tsx
'use client';

import { useEffect, useState, useMemo } from 'react';
import { useAuth } from '@/hooks/use-auth-user';
import { useRouter } from 'next/navigation';
import { fetchUsers, updateUserRole, fetchAppConfig, updateAppConfig, fetchMarketingConfig, updateMarketingConfig, uploadFile } from '@/lib/data';
import type { AppUser, UserRole, AppConfig, MarketingConfig } from '@/lib/types';
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

function AppConfigCard() {
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    fetchAppConfig().then(appConfig => {
      setConfig(appConfig);
      setLoading(false);
    }).catch(() => {
      toast({ title: "Erreur", description: "Impossible de charger la configuration.", variant: "destructive" });
      setLoading(false);
    });
  }, [toast]);

  const handleToggleLandingPage = async (isActive: boolean) => {
    setSaving(true);
    try {
      await updateAppConfig({ isLandingPageActive: isActive });
      setConfig(prev => prev ? { ...prev, isLandingPageActive: isActive } : { isLandingPageActive: isActive });
      toast({ title: "Configuration mise à jour", description: `La page d'accueil a été ${isActive ? 'activée' : 'désactivée'}.` });
    } catch (error) {
      toast({ title: "Erreur", description: "Impossible de mettre à jour la configuration.", variant: "destructive" });
      // Revert UI change on error
      setConfig(prev => prev ? { ...prev, isLandingPageActive: !isActive } : { isLandingPageActive: !isActive });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <Skeleton className="h-10 w-full" />;
  }

  return (
    <div className="flex items-center space-x-4 rounded-md border p-4">
      <div className="flex-1 space-y-1">
        <Label htmlFor="landing-page-switch" className="text-base font-medium">
          Activer la page d'accueil (mode pré-événement)
        </Label>
        <p className="text-sm text-muted-foreground">
          Si activée, les visiteurs verront une landing page. Seuls les admins et éditeurs pourront accéder à l'application.
        </p>
      </div>
       <div className="flex items-center gap-2">
        {saving && <Loader2 className="h-4 w-4 animate-spin" />}
        <Switch
          id="landing-page-switch"
          checked={config?.isLandingPageActive ?? true}
          onCheckedChange={handleToggleLandingPage}
          disabled={saving}
        />
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
        fetchMarketingConfig().then(data => {
            setConfig(data);
            setLoading(false);
        }).catch(() => {
            toast({ title: "Erreur", description: "Impossible de charger la configuration marketing.", variant: "destructive" });
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
            toast({ title: "Fichier trop lourd", description: "L'image ne doit pas dépasser 2MB.", variant: "destructive" });
            return;
        }
        if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
            toast({ title: "Format invalide", description: "Veuillez sélectionner une image JPG, PNG, ou WEBP.", variant: "destructive" });
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
            await updateMarketingConfig(newConfig);
            setConfig(newConfig);
            setImageFile(null);
            setPreviewUrl(null);
            toast({ title: "Configuration marketing mise à jour" });
        } catch (error) {
            toast({ title: "Erreur", description: "Impossible de sauvegarder la configuration.", variant: "destructive" });
        } finally {
            setSaving(false);
        }
    };

    if (loading) {
        return <Skeleton className="h-96 w-full" />;
    }

    if (!config) {
        return <p>Impossible de charger la configuration.</p>;
    }

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between rounded-md border p-4">
                <div className="flex-1 space-y-1">
                    <Label htmlFor="hero-enabled-switch" className="text-base font-medium">Activer l'overlay marketing</Label>
                    <p className="text-sm text-muted-foreground">Si activé, un encart promotionnel s'affichera sur la carte pour les visiteurs non connectés.</p>
                </div>
                <Switch id="hero-enabled-switch" checked={config.heroEnabled} onCheckedChange={checked => setConfig({ ...config, heroEnabled: checked })} />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-4">
                    <div className="space-y-2">
                        <Label htmlFor="heroTitle">Titre</Label>
                        <Input id="heroTitle" value={config.heroTitle} onChange={e => setConfig({ ...config, heroTitle: e.target.value })} />
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="heroSubtitle">Sous-titre</Label>
                        <Textarea id="heroSubtitle" value={config.heroSubtitle} onChange={e => setConfig({ ...config, heroSubtitle: e.target.value })} />
                    </div>
                    <div className="space-y-2">
                        <Label>Image de fond</Label>
                         <Input id="hero-image-upload" type="file" accept="image/jpeg,image/png,image/webp" onChange={handleFileChange} className="hidden" />
                        <label htmlFor="hero-image-upload" className="relative aspect-video w-full border-2 border-dashed rounded-lg flex items-center justify-center cursor-pointer hover:border-primary transition-colors">
                           {(previewUrl || config.heroImageUrl) ? (
                                <Image src={previewUrl || config.heroImageUrl} alt="Aperçu du Hero" fill className="object-cover rounded-lg" />
                           ) : (
                               <div className="text-center text-muted-foreground">
                                   <ImagePlus className="mx-auto h-12 w-12" />
                                   <p>Cliquez pour ajouter une image (max 2MB)</p>
                               </div>
                           )}
                        </label>
                    </div>
                </div>
                <div className="space-y-4">
                    <div className="space-y-2">
                        <Label htmlFor="heroCtaText">Texte du bouton (CTA)</Label>
                        <Input id="heroCtaText" value={config.heroCtaText} onChange={e => setConfig({ ...config, heroCtaText: e.target.value })} />
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="heroCtaMode">Action du bouton</Label>
                        <Select value={config.heroCtaMode} onValueChange={value => setConfig({ ...config, heroCtaMode: value as any })}>
                            <SelectTrigger id="heroCtaMode"><SelectValue /></SelectTrigger>
                            <SelectContent>
                                <SelectItem value="auth">Ouvrir la modale de connexion</SelectItem>
                                <SelectItem value="external">Ouvrir un lien externe</SelectItem>
                                <SelectItem value="none">Aucun bouton</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                    {config.heroCtaMode === 'external' && (
                         <div className="space-y-2">
                            <Label htmlFor="heroCtaLink">Lien externe du CTA</Label>
                            <Input id="heroCtaLink" placeholder="https://example.com" value={config.heroCtaLink} onChange={e => setConfig({ ...config, heroCtaLink: e.target.value })} />
                        </div>
                    )}
                </div>
            </div>
             <Button onClick={handleSave} disabled={saving}>
                {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Sauvegarder la configuration
            </Button>
        </div>
    );
}

function UserTable() {
  const [users, setUsers] = useState<AppUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [roleFilter, setRoleFilter] = useState<UserRole | 'all'>('all');
  const { user: currentUser } = useAuth();
  const { toast } = useToast();

  useEffect(() => {
    async function loadUsers() {
      try {
        const userList = await fetchUsers();
        setUsers(userList);
      } catch (error) {
        console.error("Failed to fetch users:", error);
        toast({ title: "Erreur", description: "Impossible de charger les utilisateurs.", variant: "destructive" });
      } finally {
        setLoading(false);
      }
    }
    loadUsers();
  }, [toast]);

  const filteredUsers = useMemo(() => {
    return users
      .filter(user => {
        if (roleFilter !== 'all' && user.role !== roleFilter) {
          return false;
        }
        if (searchTerm && !user.displayName?.toLowerCase().includes(searchTerm.toLowerCase())) {
          return false;
        }
        return true;
      })
      .sort((a, b) => a.displayName?.localeCompare(b.displayName || '') || 0);
  }, [users, searchTerm, roleFilter]);

  const handleRoleChange = (uid: string, newRole: UserRole) => {
    updateUserRole(uid, newRole);
    setUsers(users.map(u => u.uid === uid ? { ...u, role: newRole } : u));
    toast({ title: "Rôle mis à jour", description: `Le rôle de l'utilisateur a été changé en ${newRole}.` });
  };
  
  const handleDeleteUser = (uid: string) => {
    console.log(`TODO: Implement secure user deletion for UID: ${uid}`);
    toast({ title: "Action non implémentée", description: "La suppression sécurisée des utilisateurs doit être effectuée côté serveur.", variant: "destructive" });
  };


  if (loading) {
    return (
      <div className="space-y-2">
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-12 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
        <div className="flex flex-col sm:flex-row gap-4">
            <Input
                placeholder="Rechercher par nom..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="max-w-sm"
            />
            <Select value={roleFilter} onValueChange={(value) => setRoleFilter(value as any)}>
                <SelectTrigger className="w-full sm:w-[180px]">
                    <SelectValue placeholder="Filtrer par rôle" />
                </SelectTrigger>
                <SelectContent>
                    <SelectItem value="all">Tous les rôles</SelectItem>
                    <SelectItem value="admin">Admin</SelectItem>
                    <SelectItem value="editor">Editor</SelectItem>
                    <SelectItem value="user">User</SelectItem>
                </SelectContent>
            </Select>
        </div>
      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Utilisateur</TableHead>
              <TableHead className="w-[150px]">Rôle</TableHead>
              <TableHead className="w-[100px] text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredUsers.map((user) => (
              <TableRow key={user.uid}>
                <TableCell>
                  <div className="flex items-center gap-4">
                    <Avatar>
                      <AvatarImage src={user.photoURL || undefined} alt={user.displayName || 'Avatar'} />
                      <AvatarFallback>{user.displayName?.charAt(0) || user.email?.charAt(0) || 'U'}</AvatarFallback>
                    </Avatar>
                    <div>
                      <div className="font-medium">{user.displayName || 'Utilisateur Anonyme'}</div>
                      <div className="text-sm text-muted-foreground">{user.email}</div>
                    </div>
                  </div>
                </TableCell>
                <TableCell>
                  <Select
                    value={user.role}
                    onValueChange={(value) => handleRoleChange(user.uid, value as UserRole)}
                    disabled={user.uid === currentUser?.uid}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="admin">Admin</SelectItem>
                      <SelectItem value="editor">Editor</SelectItem>
                      <SelectItem value="user">User</SelectItem>
                    </SelectContent>
                  </Select>
                </TableCell>
                <TableCell className="text-right">
                   <Button
                        variant="destructive"
                        size="icon"
                        onClick={() => handleDeleteUser(user.uid)}
                        disabled // Disabled for safety as it requires server-side logic
                        title="La suppression sécurisée n'est pas encore implémentée"
                    >
                        <Trash2 className="h-4 w-4" />
                    </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}


export default function AdminPage() {
    const { role } = useAuth();
    const router = useRouter();

    useEffect(() => {
        if (role && role !== 'admin') {
            router.replace('/dashboard');
        }
    }, [role, router]);

    if (role !== 'admin') {
        return null; 
    }

    return (
        <AppLayout>
            <div className="h-full overflow-y-auto p-6">
                <div className="space-y-8">
                    <Card>
                        <CardHeader>
                            <CardTitle>Configuration de l'application</CardTitle>
                            <CardDescription>Gérez les paramètres globaux de l'application.</CardDescription>
                        </CardHeader>
                        <CardContent>
                            <AppConfigCard />
                        </CardContent>
                    </Card>
                     <Card>
                        <CardHeader>
                            <CardTitle>Configuration Marketing</CardTitle>
                            <CardDescription>Gérez le contenu de l'overlay marketing pour les nouveaux visiteurs.</CardDescription>
                        </CardHeader>
                        <CardContent>
                            <MarketingConfigCard />
                        </CardContent>
                    </Card>
                    <Card>
                        <CardHeader>
                            <CardTitle>Gestion des utilisateurs</CardTitle>
                            <CardDescription>Gérez les rôles et les accès des utilisateurs de l'application.</CardDescription>
                        </CardHeader>
                        <CardContent>
                            <UserTable />
                        </CardContent>
                    </Card>
                </div>
            </div>
        </AppLayout>
    );
}
