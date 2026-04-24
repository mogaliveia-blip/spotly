'use client';

import { useEffect, useState, useCallback } from 'react';
import { useAuth } from '@/hooks/use-auth-user';
import { fetchUserEvents } from '@/lib/data';
import type { AppEvent } from '@/lib/types';
import { AppLayout } from '@/components/layout/app-layout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Calendar, LayoutDashboard, Settings, AlertCircle, RefreshCw, Lock } from 'lucide-react';
import Link from 'next/link';
import { CreateEventDialog } from '@/components/admin/create-event-dialog';
import { cn } from '@/lib/utils';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

export default function MyEventsPage() {
  const { user, loading: authLoading, isApproved } = useAuth();
  const [events, setEvents] = useState<AppEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorType, setErrorType] = useState<'NONE' | 'INDEX_MISSING' | 'OTHER'>('NONE');

  const loadEvents = useCallback(async (isManual = false) => {
    if (!user || !isApproved) return;
    if (!isManual) setLoading(true);
    
    setErrorType('NONE');
    try {
      const data = await fetchUserEvents(user.uid);
      setEvents(data);
    } catch (err: any) {
      if (err.message === 'INDEX_MISSING') {
        setErrorType('INDEX_MISSING');
      } else {
        setErrorType('OTHER');
      }
    } finally {
      setLoading(false);
    }
  }, [user, isApproved]);

  useEffect(() => {
    if (user && isApproved) {
      loadEvents();
    } else if (!authLoading) {
      setLoading(false);
    }
  }, [user, isApproved, authLoading, loadEvents]);

  if (authLoading || (loading && events.length === 0)) {
    return (
      <AppLayout>
        <div className="p-6 space-y-6">
          <Skeleton className="h-10 w-48" />
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
             <Skeleton className="h-48 w-full rounded-2xl" />
             <Skeleton className="h-48 w-full rounded-2xl" />
             <Skeleton className="h-48 w-full rounded-2xl" />
          </div>
        </div>
      </AppLayout>
    );
  }

  // ✅ UI si non approuvé
  if (!isApproved) {
    return (
        <AppLayout>
            <div className="p-6 max-w-4xl mx-auto pt-20">
                <Card className="text-center p-12 rounded-[2rem] border-muted shadow-lg bg-primary/5">
                    <div className="mx-auto h-16 w-16 bg-primary/10 rounded-full flex items-center justify-center mb-6">
                        <Lock className="h-8 w-8 text-primary" />
                    </div>
                    <CardTitle className="text-3xl font-bold">Accès restreint</CardTitle>
                    <CardDescription className="text-lg mt-4 max-w-md mx-auto">
                        Votre compte n'est pas encore validé. Seuls les organisateurs approuvés peuvent créer et gérer des événements.
                    </CardDescription>
                    <div className="mt-8">
                        <Button asChild variant="outline" className="rounded-xl px-8 h-12">
                            <Link href="/access-pending">Voir mon statut</Link>
                        </Button>
                    </div>
                </Card>
            </div>
        </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="h-full overflow-y-auto p-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Mes Événements</h1>
            <p className="text-muted-foreground">Gérez vos différents festivals et rassemblements.</p>
          </div>
          <div className="flex gap-2">
            <Button 
              variant="outline" 
              size="sm" 
              onClick={() => loadEvents(true)} 
              disabled={loading}
              className="rounded-xl h-10 px-4"
            >
                <RefreshCw className={cn("h-4 w-4 mr-2", loading && "animate-spin")} />
                Actualiser
            </Button>
            <CreateEventDialog onEventCreated={() => loadEvents(true)} />
          </div>
        </div>

        {errorType === 'INDEX_MISSING' && (
            <Alert variant="destructive" className="mb-8 rounded-2xl border-2">
                <AlertCircle className="h-4 w-4" />
                <AlertTitle className="font-bold">Index Firestore en cours de préparation</AlertTitle>
                <AlertDescription className="mt-2 space-y-2">
                    <p>Vos événements sont bien enregistrés mais l'affichage nécessite un index Firestore.</p>
                    <p className="text-xs font-semibold underline decoration-dotted">Cela prend généralement 3 à 5 minutes.</p>
                </AlertDescription>
            </Alert>
        )}

        {events.length === 0 ? (
          <Card className="flex flex-col items-center justify-center p-12 text-center border-dashed rounded-[2rem] bg-muted/10">
            <div className="p-4 rounded-full bg-primary/10 mb-4">
               <Calendar className="h-12 w-12 text-primary opacity-50" />
            </div>
            <CardTitle className="text-2xl">Aucun événement trouvé</CardTitle>
            <CardDescription className="mt-2 max-w-sm">
               Vous n'avez pas encore créé d'événement.
            </CardDescription>
            <div className="mt-8">
              <CreateEventDialog onEventCreated={() => loadEvents(true)} />
            </div>
          </Card>
        ) : (
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {events.map((e) => (
              <Card key={e.id} className="group hover:shadow-xl transition-all overflow-hidden border-muted rounded-[2rem]">
                <CardHeader className="bg-muted/30 pb-6">
                  <div className="flex items-center justify-between">
                     <CardTitle className="text-xl font-bold line-clamp-1">{e.name}</CardTitle>
                     <span className={cn(
                        "text-[10px] uppercase font-bold px-2 py-0.5 rounded-full whitespace-nowrap",
                        e.status === 'published' ? "bg-green-500/10 text-green-600" : "bg-primary/10 text-primary"
                     )}>
                        {e.status === 'published' ? 'Publié' : 'Brouillon'}
                     </span>
                  </div>
                  <CardDescription className="font-mono text-xs opacity-60">/{e.slug}</CardDescription>
                </CardHeader>
                <CardContent className="pt-6 space-y-4">
                  <div className="flex gap-2">
                    <Button variant="default" size="sm" asChild className="flex-1 rounded-xl h-12 gap-2 font-bold shadow-md">
                       <Link href={`/${e.slug}/dashboard`}>
                          <LayoutDashboard className="h-4 w-4" />
                          Dashboard
                       </Link>
                    </Button>
                    <Button variant="secondary" size="icon" asChild className="rounded-xl h-12 w-12 shrink-0">
                       <Link href={`/${e.slug}/admin`}>
                          <Settings className="h-4 w-4" />
                       </Link>
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </AppLayout>
  );
}
