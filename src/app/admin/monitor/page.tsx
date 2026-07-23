'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import {
  Activity,
  CalendarClock,
  CheckCircle,
  Clock,
  Loader2,
  MapPin,
  RefreshCw,
  Server,
  ShieldCheck,
  Star,
  Users
} from 'lucide-react';

import { AppLayout } from '@/components/layout/app-layout';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuth } from '@/hooks/use-auth-user';
import { fetchPlatformMonitorStats } from '@/lib/data';
import type { PlatformMonitorStats } from '@/lib/data';
import { mapsConfig } from '@/lib/firebase-config';

const StatCard = ({
  title,
  value,
  icon: Icon,
  loading,
  delta
}: {
  title: string
  value: string | number
  icon: React.ElementType
  loading: boolean
  delta?: number
}) => {
  const deltaBadge = delta && delta !== 0
    ? (
      <Badge variant="secondary" className={delta > 0 ? 'text-green-700' : 'text-red-700'}>
        {delta > 0 ? `+${delta}` : delta}
      </Badge>
    )
    : null;

  return (
    <Card className="rounded-2xl border-muted/60">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
        <Icon className="h-4 w-4 text-primary" />
      </CardHeader>
      <CardContent>
        {loading ? (
          <Skeleton className="h-8 w-20" />
        ) : (
          <div className="flex items-center gap-2">
            <div className="text-2xl font-bold">{value}</div>
            {deltaBadge}
          </div>
        )}
      </CardContent>
    </Card>
  );
};

const MetricRow = ({ label, value }: { label: string; value: string | number }) => (
  <div className="flex items-center justify-between rounded-xl bg-muted/30 px-3 py-2">
    <span className="text-sm text-muted-foreground">{label}</span>
    <span className="text-sm font-bold">{value}</span>
  </div>
);

export default function MonitorPage() {
  const { role, loading: authLoading } = useAuth();
  const router = useRouter();
  const [stats, setStats] = useState<PlatformMonitorStats | null>(null);
  const [prevStats, setPrevStats] = useState<PlatformMonitorStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const isInitialLoad = useRef(true);

  const fetchData = useCallback(async (isManualRefresh = false) => {
    if (!isManualRefresh) setLoading(true);

    try {
      const nextStats = await fetchPlatformMonitorStats();

      setStats((currentStats) => {
        if (!isInitialLoad.current) setPrevStats(currentStats);
        else isInitialLoad.current = false;
        return nextStats;
      });
      setLastRefresh(new Date());
    } catch (error) {
      console.error('[MonitorPage] Failed to fetch platform monitoring data:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (authLoading) return;

    if (role && role !== 'owner') {
      router.replace('/dashboard');
      return;
    }

    if (role === 'owner') {
      fetchData();
      const intervalId = setInterval(() => fetchData(), 60000);
      return () => clearInterval(intervalId);
    }
  }, [role, authLoading, router, fetchData]);

  const isMapApiKeyDefined = !!mapsConfig.apiKey;
  const poisDelta = stats && prevStats ? stats.content.totalPois - prevStats.content.totalPois : 0;
  const reviewsDelta = stats && prevStats ? stats.content.totalReviews - prevStats.content.totalReviews : 0;
  const usersDelta = stats && prevStats ? stats.users.total - prevStats.users.total : 0;
  const eventsDelta = stats && prevStats ? stats.events.total - prevStats.events.total : 0;

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
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h1 className="text-2xl font-bold tracking-tight">Monitoring Plateforme</h1>
              <p className="text-muted-foreground">
                Vue d'ensemble multi-événements, basée sur les statuts et contenus actifs de la plateforme.
              </p>
            </div>

            <div className="flex flex-col gap-2 sm:items-end">
              <Button variant="outline" size="sm" onClick={() => fetchData(true)} disabled={loading}>
                {loading && !isInitialLoad.current ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <RefreshCw className="mr-2 h-4 w-4" />
                )}
                Rafraîchir
              </Button>
              <div className="text-sm text-muted-foreground">
                {lastRefresh
                  ? <>Dernière actualisation : {format(lastRefresh, 'HH:mm:ss', { locale: fr })}</>
                  : <Skeleton className="h-5 w-48" />}
              </div>
            </div>
          </div>

          <section className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <StatCard title="Utilisateurs" value={stats.users.total} icon={Users} loading={loading} delta={usersDelta} />
            <StatCard title="Événements" value={stats.events.total} icon={CalendarClock} loading={loading} delta={eventsDelta} />
            <StatCard title="Points d'intérêt" value={stats.content.totalPois} icon={MapPin} loading={loading} delta={poisDelta} />
            <StatCard title="Avis" value={stats.content.totalReviews} icon={Star} loading={loading} delta={reviewsDelta} />
          </section>

          <section className="grid gap-4 lg:grid-cols-3">
            <Card className="rounded-2xl border-muted/60">
              <CardHeader>
                <CardTitle>Utilisateurs</CardTitle>
                <CardDescription>Comptes plateforme et droits globaux.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                <MetricRow label="Approuvés" value={stats.users.approved} />
                <MetricRow label="Révoqués" value={stats.users.revoked} />
                <MetricRow label="Owners plateforme" value={stats.users.owners} />
              </CardContent>
            </Card>

            <Card className="rounded-2xl border-muted/60">
              <CardHeader>
                <CardTitle>Événements</CardTitle>
                <CardDescription>Cycle de vie piloté par le champ status.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                <MetricRow label="Brouillons" value={stats.events.draft} />
                <MetricRow label="Publiés" value={stats.events.published} />
                <MetricRow label="En pause" value={stats.events.paused} />
              </CardContent>
            </Card>

            <Card className="rounded-2xl border-muted/60">
              <CardHeader>
                <CardTitle>Calendrier</CardTitle>
                <CardDescription>Lecture des dates renseignées sur les événements.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                <MetricRow label="En cours" value={stats.events.ongoing} />
                <MetricRow label="À venir" value={stats.events.upcoming} />
                <MetricRow label="Terminés" value={stats.events.ended} />
              </CardContent>
            </Card>
          </section>

          <section className="grid gap-4 md:grid-cols-2">
            <Card className="rounded-2xl border-muted/60">
              <CardHeader>
                <CardTitle>Contenus</CardTitle>
                <CardDescription>Agrégation des POIs de tous les événements.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                <MetricRow label="POIs" value={stats.content.totalPois} />
                <MetricRow label="Avis cumulés" value={stats.content.totalReviews} />
                <MetricRow label="Sponsors actifs" value={stats.content.activeSponsors} />
                <MetricRow label="POIs avec sponsor configuré" value={stats.content.poisWithSponsorField} />
              </CardContent>
            </Card>

            <Card className="rounded-2xl border-muted/60">
              <CardHeader>
                <CardTitle>Services</CardTitle>
                <CardDescription>Signaux techniques disponibles côté application.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <Alert>
                  <ShieldCheck className="h-4 w-4" />
                  <AlertTitle className="flex items-center justify-between gap-3">
                    <span>Clé Google Maps</span>
                    <Badge variant={isMapApiKeyDefined ? 'default' : 'destructive'}>
                      {isMapApiKeyDefined ? 'Configurée' : 'Absente'}
                    </Badge>
                  </AlertTitle>
                  <AlertDescription>
                    Indique uniquement si la clé est présente dans la configuration client.
                  </AlertDescription>
                </Alert>

                <Alert>
                  <Activity className="h-4 w-4" />
                  <AlertTitle className="flex items-center justify-between gap-3">
                    <span>Overlay marketing</span>
                    <Badge variant={stats.marketing.heroEnabledEvents > 0 ? 'default' : 'secondary'}>
                      {stats.marketing.heroEnabledEvents} événement(s)
                    </Badge>
                  </AlertTitle>
                  <AlertDescription>
                    Nombre d'événements dont le hero marketing est activé. Ce n'est pas un statut global portail.
                  </AlertDescription>
                </Alert>
              </CardContent>
            </Card>
          </section>

          <section>
            {stats.events.total === 0 ? (
              <Alert>
                <Clock className="h-4 w-4" />
                <AlertTitle>Aucun événement</AlertTitle>
                <AlertDescription>
                  La plateforme ne contient encore aucun événement. Les métriques de contenus restent donc à zéro.
                </AlertDescription>
              </Alert>
            ) : (
              <Alert>
                <CheckCircle className="h-4 w-4 text-green-500" />
                <AlertTitle>Monitoring cohérent avec le multi-événements</AlertTitle>
                <AlertDescription>
                  Les indicateurs de publication utilisent les statuts des événements, sans dépendre des anciens réglages de page d'accueil.
                </AlertDescription>
              </Alert>
            )}
          </section>
        </div>
      </div>
    </AppLayout>
  );
}
