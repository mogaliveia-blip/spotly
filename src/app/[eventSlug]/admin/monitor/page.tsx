'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useAuth } from '@/hooks/use-auth-user';
import { useRouter } from 'next/navigation';
import { fetchUsers, fetchPois, fetchMarketingConfig } from '@/lib/data';
import { isSponsorActive } from '@/lib/sponsor-utils';
import { AppLayout } from '@/components/layout/app-layout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import {
  Users,
  MapPin,
  Star,
  Handshake,
  RefreshCw,
  Loader2,
  BarChart3,
  Activity
} from 'lucide-react';

import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import { mapsConfig } from '@/lib/firebase-config';
import { Button } from '@/components/ui/button';
import { useEvent } from '@/providers/event-provider';

interface MonitorStats {
  totalPois: number;
  activePartners: number;
  totalReviews: number;
  totalUsers: number;
  isHeroMarketingEnabled: boolean;
  poisWithSponsorField: number;
}

const StatCard = ({ title, value, icon: Icon, loading, delta }: { title: string; value: string | number; icon: React.ElementType; loading: boolean, delta?: number }) => {
    const getDeltaBadge = () => {
        if (delta === undefined || delta === 0) return null;
        const color = delta > 0 ? 'bg-green-500/20 text-green-700' : 'bg-red-500/20 text-red-700';
        return <Badge className={`ml-2 text-xs font-mono border-none ${color}`}>{delta > 0 ? `+${delta}`: delta}</Badge>
    }

    return (
        <Card className="rounded-2xl border-muted/60">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-bold uppercase tracking-tight text-muted-foreground">{title}</CardTitle>
                <Icon className="h-4 w-4 text-primary" />
            </CardHeader>
            <CardContent>
                {loading ? <Skeleton className="h-8 w-1/2" /> : (
                    <div className="flex items-center">
                        <div className="text-2xl font-black">{value}</div>
                        {getDeltaBadge()}
                    </div>
                )}
            </CardContent>
        </Card>
    );
}

export default function MonitorPage() {
    const { role: globalRole, loading: authLoading } = useAuth();
    const { eventId, loading: eventLoading, userRole } = useEvent();
    const router = useRouter();
    const [stats, setStats] = useState<MonitorStats | null>(null);
    const [prevStats, setPrevStats] = useState<MonitorStats | null>(null);
    const [loading, setLoading] = useState(true);
    const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
    const isInitialLoad = useRef(true);

    const fetchData = useCallback(async (isManualRefresh = false) => {
        if (eventLoading) return;
        if (!isManualRefresh) setLoading(true);

        try {
            const [users, pois, marketingConfig] = await Promise.all([
                globalRole === 'owner' ? fetchUsers() : Promise.resolve([]),
                fetchPois(eventId),
                fetchMarketingConfig(eventId),
            ]);

            const totalReviews = pois.reduce((acc, poi) => acc + (poi.reviewCount || 0), 0);
            const activePartners = pois.filter(isSponsorActive).length;
            const poisWithSponsorField = pois.filter(p => !!p.sponsor).length;

            const newStats: MonitorStats = {
                totalPois: pois.length,
                activePartners,
                totalReviews,
                totalUsers: users.length,
                isHeroMarketingEnabled: marketingConfig.heroEnabled,
                poisWithSponsorField,
            };

            setStats(currentStats => {
                if (!isInitialLoad.current) setPrevStats(currentStats);
                else isInitialLoad.current = false;
                return newStats;
            });

            setLastRefresh(new Date());

        } catch (error) {
            console.error("Failed to fetch monitoring data:", error);
        } finally {
            setLoading(false);
        }
    }, [eventId, eventLoading, globalRole]);

    useEffect(() => {
        if (authLoading || eventLoading) return;
        if (globalRole !== 'owner' && userRole !== 'admin') {
            router.replace('/dashboard');
            return;
        }
        fetchData();
        const intervalId = setInterval(() => fetchData(), 60000);
        return () => clearInterval(intervalId);
    }, [globalRole, userRole, authLoading, eventLoading, router, fetchData]);

    const poisDelta = stats && prevStats ? stats.totalPois - prevStats.totalPois : 0;
    const reviewsDelta = stats && prevStats ? stats.totalReviews - prevStats.totalReviews : 0;

    const isMapApiKeyDefined = !!mapsConfig.apiKey;

    if (authLoading || !stats) {
        return (
            <AppLayout>
                <div className="flex h-full w-full items-center justify-center">
                    <Loader2 className="h-12 w-12 animate-spin text-primary" />
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
                             <h1 className="text-3xl font-bold tracking-tight">Supervision</h1>
                             <p className="text-muted-foreground text-sm">Activité en temps réel de l'événement.</p>
                        </div>

                        <div className="flex items-center gap-3">
                           <Button variant="outline" size="sm" onClick={() => fetchData(true)} disabled={loading} className="rounded-xl font-bold">
                                {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : <RefreshCw className="mr-2 h-4 w-4"/>}
                                Actualiser
                            </Button>
                            <div className="text-[10px] uppercase font-bold text-muted-foreground bg-muted px-2 py-1 rounded-md">
                               {lastRefresh ? format(lastRefresh, 'HH:mm:ss') : '--:--:--'}
                            </div>
                        </div>
                    </div>

                    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                        <StatCard title="Utilisateurs" value={stats.totalUsers} icon={Users} loading={loading} />
                        <StatCard title="Points d'Intérêt" value={stats.totalPois} icon={MapPin} loading={loading} delta={poisDelta} />
                        <StatCard title="Avis cumulés" value={stats.totalReviews} icon={Star} loading={loading} delta={reviewsDelta} />
                        <StatCard title="Sponsors" value={stats.activePartners} icon={Handshake} loading={loading} />
                    </div>

                    <div className="grid gap-6 md:grid-cols-2">
                        <Card className="rounded-3xl border-muted/60 overflow-hidden">
                            <CardHeader className="bg-primary/5">
                                <CardTitle className="text-lg">Services</CardTitle>
                            </CardHeader>
                            <CardContent className="space-y-3 pt-4">
                                <div className="flex justify-between items-center p-3 rounded-xl bg-muted/20">
                                    <span className="text-sm font-bold">Overlay marketing</span>
                                    <Badge variant={stats.isHeroMarketingEnabled ? "default" : "secondary"}>{stats.isHeroMarketingEnabled ? "On" : "Off"}</Badge>
                                </div>
                            </CardContent>
                        </Card>

                        <Card className="rounded-3xl border-muted/60 overflow-hidden">
                            <CardHeader className="bg-primary/5">
                                <CardTitle className="text-lg">Google Maps API</CardTitle>
                            </CardHeader>
                            <CardContent className="space-y-3 pt-4">
                                <div className="flex justify-between items-center p-3 rounded-xl bg-muted/20">
                                    <span className="text-sm font-bold">Clé API</span>
                                    <Badge variant={isMapApiKeyDefined ? "default" : "destructive"}>{isMapApiKeyDefined ? "Configurée" : "Manquante"}</Badge>
                                </div>
                                <div className="flex justify-between items-center p-3 rounded-xl bg-muted/20">
                                    <span className="text-sm font-bold">Analytique</span>
                                    <div className="flex gap-2">
                                        <Button variant="ghost" size="icon" className="h-6 w-6" asChild>
                                            <a href="https://analytics.google.com/" target="_blank"><Activity size={14} /></a>
                                        </Button>
                                        <Button variant="ghost" size="icon" className="h-6 w-6" asChild>
                                            <a href="https://analytics.google.com/" target="_blank"><BarChart3 size={14} /></a>
                                        </Button>
                                    </div>
                                </div>
                            </CardContent>
                        </Card>
                    </div>

                </div>
            </div>
        </AppLayout>
    );
}
