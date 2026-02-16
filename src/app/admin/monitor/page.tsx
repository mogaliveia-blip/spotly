// src/app/admin/monitor/page.tsx
'use client';

import { useEffect, useState, useCallback } from 'react';
import { useAuth } from '@/hooks/use-auth-user';
import { useRouter } from 'next/navigation';
import { fetchUsers, fetchPois, fetchAppConfig, fetchMarketingConfig } from '@/lib/data';
import type { AppUser, POI, AppConfig, MarketingConfig } from '@/lib/types';
import { isSponsorActive } from '@/lib/sponsor-utils';
import { AppLayout } from '@/components/layout/app-layout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Server, Users, MapPin, Star, Handshake, MonitorPlay, Presentation } from 'lucide-react';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';

interface MonitorStats {
  totalPois: number;
  activePartners: number;
  totalReviews: number;
  totalUsers: number;
  isLandingPageActive: boolean;
  isHeroMarketingEnabled: boolean;
}

const StatCard = ({ title, value, icon: Icon, loading }: { title: string; value: string | number; icon: React.ElementType; loading: boolean }) => (
    <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{title}</CardTitle>
            <Icon className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
            {loading ? <Skeleton className="h-8 w-1/2" /> : <div className="text-2xl font-bold">{value}</div>}
        </CardContent>
    </Card>
);

export default function MonitorPage() {
    const { role, loading: authLoading } = useAuth();
    const router = useRouter();
    const [stats, setStats] = useState<MonitorStats | null>(null);
    const [loading, setLoading] = useState(true);
    const [lastRefresh, setLastRefresh] = useState<Date | null>(null);

    const fetchData = useCallback(async () => {
        try {
            const [users, pois, appConfig, marketingConfig] = await Promise.all([
                fetchUsers(),
                fetchPois(),
                fetchAppConfig(),
                fetchMarketingConfig(),
            ]);

            const totalReviews = pois.reduce((acc, poi) => acc + (poi.reviewCount || 0), 0);
            const activePartners = pois.filter(isSponsorActive).length;

            setStats({
                totalPois: pois.length,
                activePartners,
                totalReviews,
                totalUsers: users.length,
                isLandingPageActive: appConfig.isLandingPageActive,
                isHeroMarketingEnabled: marketingConfig.heroEnabled,
            });
            setLastRefresh(new Date());
        } catch (error) {
            console.error("Failed to fetch monitoring data:", error);
            // Optionally, set an error state to show in the UI
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        if (authLoading) return;
        if (role && role !== 'admin') {
            router.replace('/dashboard');
            return;
        }
        if (role === 'admin') {
            fetchData();
            const intervalId = setInterval(fetchData, 30000); // 30 seconds
            return () => clearInterval(intervalId);
        }
    }, [role, authLoading, router, fetchData]);

    if (authLoading || role !== 'admin') {
        return (
            <AppLayout>
                <div className="flex h-full w-full items-center justify-center">
                    <Server className="h-12 w-12 animate-pulse text-primary" />
                </div>
            </AppLayout>
        );
    }
    
    return (
        <AppLayout>
            <div className="h-full overflow-y-auto p-6">
                <div className="space-y-6">
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                        <div>
                            <h1 className="text-2xl font-bold tracking-tight">Monitoring</h1>
                            <p className="text-muted-foreground">Vue d'ensemble en temps réel de l'activité de l'application.</p>
                        </div>
                        <div className="text-sm text-muted-foreground text-left sm:text-right">
                            {loading ? <Skeleton className="h-5 w-48" /> : (
                                <>
                                    Dernière mise à jour : {lastRefresh ? format(lastRefresh, 'HH:mm:ss', { locale: fr }) : 'N/A'}
                                </>
                            )}
                        </div>
                    </div>

                    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                        <StatCard title="Total Utilisateurs" value={stats?.totalUsers ?? 0} icon={Users} loading={loading} />
                        <StatCard title="Total POIs" value={stats?.totalPois ?? 0} icon={MapPin} loading={loading} />
                        <StatCard title="Total Avis" value={stats?.totalReviews ?? 0} icon={Star} loading={loading} />
                        <StatCard title="Partenaires Actifs" value={stats?.activePartners ?? 0} icon={Handshake} loading={loading} />
                    </div>

                    <Card>
                        <CardHeader>
                            <CardTitle>État du système</CardTitle>
                            <CardDescription>Configuration actuelle des modules principaux.</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                             <Alert>
                                <MonitorPlay className="h-4 w-4" />
                                <AlertTitle className="flex items-center justify-between">
                                    <span>Landing Page (pré-événement)</span>
                                    {loading ? <Skeleton className="h-6 w-16" /> : <Badge variant={stats?.isLandingPageActive ? "default" : "secondary"}>{stats?.isLandingPageActive ? "Activée" : "Désactivée"}</Badge>}
                                </AlertTitle>
                                <AlertDescription>
                                    Si activée, les visiteurs voient la page d'accueil et seuls les admins/éditeurs peuvent entrer.
                                </AlertDescription>
                            </Alert>
                             <Alert>
                                <Presentation className="h-4 w-4" />
                                <AlertTitle className="flex items-center justify-between">
                                    <span>Hero Marketing (visiteurs)</span>
                                    {loading ? <Skeleton className="h-6 w-16" /> : <Badge variant={stats?.isHeroMarketingEnabled ? "default" : "secondary"}>{stats?.isHeroMarketingEnabled ? "Activé" : "Désactivé"}</Badge>}
                                </AlertTitle>
                                <AlertDescription>
                                    Si activé, une bannière marketing est affichée aux visiteurs non connectés sur la carte.
                                </AlertDescription>
                            </Alert>
                        </CardContent>
                    </Card>
                </div>
            </div>
        </AppLayout>
    );
}
