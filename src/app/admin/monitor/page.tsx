// src/app/admin/monitor/page.tsx
'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
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
import { Server, Users, MapPin, Star, Handshake, MonitorPlay, Presentation, AlertTriangle, Info, CheckCircle, RefreshCw, Loader2 } from 'lucide-react';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import { mapsConfig } from '@/lib/firebase-config';
import { Button } from '@/components/ui/button';

interface MonitorStats {
  totalPois: number;
  activePartners: number;
  totalReviews: number;
  totalUsers: number;
  isLandingPageActive: boolean;
  isHeroMarketingEnabled: boolean;
  poisWithSponsorField: number;
}

const StatCard = ({ title, value, icon: Icon, loading, delta }: { title: string; value: string | number; icon: React.ElementType; loading: boolean, delta?: number }) => {
    const getDeltaBadge = () => {
        if (delta === undefined || delta === 0) return null;
        const color = delta > 0 ? 'bg-green-500/20 text-green-700' : 'bg-red-500/20 text-red-700';
        return <Badge className={`ml-2 text-xs font-mono ${color}`}>{delta > 0 ? `+${delta}`: delta}</Badge>
    }

    return (
        <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">{title}</CardTitle>
                <Icon className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
                {loading ? <Skeleton className="h-8 w-1/2" /> : (
                    <div className="flex items-center">
                        <div className="text-2xl font-bold">{value}</div>
                        {getDeltaBadge()}
                    </div>
                )}
            </CardContent>
        </Card>
    );
}

export default function MonitorPage() {
    const { role, loading: authLoading } = useAuth();
    const router = useRouter();
    const [stats, setStats] = useState<MonitorStats | null>(null);
    const [prevStats, setPrevStats] = useState<MonitorStats | null>(null);
    const [loading, setLoading] = useState(true);
    const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
    const isInitialLoad = useRef(true);
    const [isPageVisible, setIsPageVisible] = useState(true);


    const fetchData = useCallback(async (isManualRefresh = false) => {
        if (!isManualRefresh) {
            setLoading(true);
        }
        try {
            const [users, pois, appConfig, marketingConfig] = await Promise.all([
                fetchUsers(),
                fetchPois(),
                fetchAppConfig(),
                fetchMarketingConfig(),
            ]);

            const totalReviews = pois.reduce((acc, poi) => acc + (poi.reviewCount || 0), 0);
            const activePartners = pois.filter(isSponsorActive).length;
            const poisWithSponsorField = pois.filter(p => !!p.sponsor).length;

            const newStats: MonitorStats = {
                totalPois: pois.length,
                activePartners,
                totalReviews,
                totalUsers: users.length,
                isLandingPageActive: appConfig.isLandingPageActive,
                isHeroMarketingEnabled: marketingConfig.heroEnabled,
                poisWithSponsorField,
            };

            setStats(currentStats => {
                if (!isInitialLoad.current) {
                    setPrevStats(currentStats);
                } else {
                    isInitialLoad.current = false;
                }
                return newStats;
            });

            setLastRefresh(new Date());
        } catch (error) {
            console.error("Failed to fetch monitoring data:", error);
        } finally {
            setLoading(false);
        }
    }, []);

     useEffect(() => {
        const handleVisibilityChange = () => setIsPageVisible(document.visibilityState === 'visible');
        document.addEventListener('visibilitychange', handleVisibilityChange);
        return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
    }, []);

    useEffect(() => {
        if (authLoading) return;
        if (role && role !== 'admin') {
            router.replace('/dashboard');
            return;
        }
        if (role === 'admin' && isPageVisible) {
            fetchData();
            const intervalId = setInterval(() => fetchData(), 30000); // 30 seconds
            return () => clearInterval(intervalId);
        }
    }, [role, authLoading, router, fetchData, isPageVisible]);
    
    // --- DERIVED STATE ---
    const isFestivalMode = stats ? !stats.isLandingPageActive && !stats.isHeroMarketingEnabled : false;
    const poisDelta = stats && prevStats ? stats.totalPois - prevStats.totalPois : 0;
    const reviewsDelta = stats && prevStats ? stats.totalReviews - prevStats.totalReviews : 0;

    const isMapIdDefined = !!process.env.NEXT_PUBLIC_GOOGLE_MAP_ID;
    const isMapApiKeyDefined = !!mapsConfig.apiKey;


    if (authLoading || !stats) {
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
                        <div className="flex items-center gap-4">
                           <div>
                             <h1 className="text-2xl font-bold tracking-tight">Monitoring</h1>
                             <p className="text-muted-foreground">Vue d'ensemble en temps réel de l'activité de l'application.</p>
                           </div>
                           {isFestivalMode && <Badge variant="destructive">Mode Festival Actif</Badge>}
                        </div>
                        <div className="flex items-center gap-2">
                           <Button variant="outline" size="sm" onClick={() => fetchData(true)} disabled={loading}>
                                {loading && !isInitialLoad.current ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : <RefreshCw className="mr-2 h-4 w-4"/>}
                                Rafraîchir
                            </Button>
                            <div className="text-sm text-muted-foreground text-left sm:text-right">
                               {lastRefresh ? <>Dernière mise à jour : {format(lastRefresh, 'HH:mm:ss', { locale: fr })}</> : <Skeleton className="h-5 w-48" />}
                            </div>
                        </div>
                    </div>

                     <Card>
                        <CardHeader>
                            <CardTitle>Alertes Système</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-3">
                            {stats.totalPois === 0 && (
                                <Alert variant="destructive">
                                    <AlertTriangle className="h-4 w-4" />
                                    <AlertTitle>Alerte Critique</AlertTitle>
                                    <AlertDescription>Aucun point d'intérêt (POI) n'est configuré. L'application est vide.</AlertDescription>
                                </Alert>
                            )}
                             {stats.isLandingPageActive && stats.isHeroMarketingEnabled && (
                                <Alert variant="destructive">
                                    <AlertTriangle className="h-4 w-4" />
                                    <AlertTitle>Alerte de Configuration</AlertTitle>
                                    <AlertDescription>La Landing Page et le Hero Marketing sont activés en même temps, ce qui peut créer un conflit d'intention pour l'utilisateur.</AlertDescription>
                                </Alert>
                            )}
                             {isFestivalMode && stats.totalReviews === 0 && (
                                <Alert>
                                    <AlertTriangle className="h-4 w-4" />
                                    <AlertTitle>Alerte de Contenu</AlertTitle>
                                    <AlertDescription>Le "Mode Festival" est actif mais aucun avis n'a encore été posté.</AlertDescription>
                                </Alert>
                            )}
                             {stats.poisWithSponsorField > 0 && stats.activePartners === 0 && (
                                <Alert variant="default">
                                     <Info className="h-4 w-4" />
                                    <AlertTitle>Information Partenariats</AlertTitle>
                                    <AlertDescription>Des POIs ont des configurations de partenariat, mais aucun n'est actuellement actif (vérifier les dates).</AlertDescription>
                                </Alert>
                            )}
                             {stats.totalPois > 0 && !(stats.isLandingPageActive && stats.isHeroMarketingEnabled) && !isFestivalMode && (
                                <Alert>
                                     <CheckCircle className="h-4 w-4 text-green-500" />
                                    <AlertTitle>Système Nominal</AlertTitle>
                                    <AlertDescription>Aucune alerte critique détectée.</AlertDescription>
                                </Alert>
                             )}
                        </CardContent>
                    </Card>

                    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                        <StatCard title="Total Utilisateurs" value={stats.totalUsers} icon={Users} loading={loading} />
                        <StatCard title="Total POIs" value={stats.totalPois} icon={MapPin} loading={loading} delta={poisDelta} />
                        <StatCard title="Total Avis" value={stats.totalReviews} icon={Star} loading={loading} delta={reviewsDelta} />
                        <StatCard title="Partenaires Actifs" value={stats.activePartners} icon={Handshake} loading={loading} />
                    </div>

                    <div className="grid gap-4 md:grid-cols-2">
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
                                        <Badge variant={stats.isLandingPageActive ? "default" : "secondary"}>{stats.isLandingPageActive ? "Activée" : "Désactivée"}</Badge>
                                    </AlertTitle>
                                </Alert>
                                <Alert>
                                    <Presentation className="h-4 w-4" />
                                    <AlertTitle className="flex items-center justify-between">
                                        <span>Hero Marketing (visiteurs)</span>
                                        <Badge variant={stats.isHeroMarketingEnabled ? "default" : "secondary"}>{stats.isHeroMarketingEnabled ? "Activé" : "Désactivé"}</Badge>
                                    </AlertTitle>
                                </Alert>
                            </CardContent>
                        </Card>
                         <Card>
                            <CardHeader>
                                <CardTitle>Santé Google Maps</CardTitle>
                                <CardDescription>Vérification des configurations essentielles.</CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                <Alert>
                                    <AlertTitle className="flex items-center justify-between">
                                        <span>Clé d'API Google Maps</span>
                                        <Badge variant={isMapApiKeyDefined ? "default" : "destructive"}>{isMapApiKeyDefined ? "Présente" : "Absente"}</Badge>
                                    </AlertTitle>
                                    <AlertDescription>
                                        Nécessaire pour l'affichage de la carte.
                                    </AlertDescription>
                                </Alert>
                                <Alert>
                                    <AlertTitle className="flex items-center justify-between">
                                        <span>ID de carte Google Maps</span>
                                        <Badge variant={isMapIdDefined ? "default" : "destructive"}>{isMapIdDefined ? "Présent" : "Absent"}</Badge>
                                    </AlertTitle>
                                    <AlertDescription>
                                        Nécessaire pour le style personnalisé de la carte.
                                    </AlertDescription>
                                </Alert>
                            </CardContent>
                        </Card>
                    </div>
                </div>
            </div>
        </AppLayout>
    );
}
