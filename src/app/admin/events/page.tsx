'use client';

import { useEffect, useState, useCallback } from 'react';
import { useAuth } from '@/hooks/use-auth-user';
import { deleteEvent, fetchAllEvents, fetchUserEvents, updateEventStatus } from '@/lib/data';
import type { AppEvent, EventRole, EventStatus } from '@/lib/types';
import { AppLayout } from '@/components/layout/app-layout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Calendar, LayoutDashboard, Settings, AlertCircle, RefreshCw, Lock, UserCheck, ShieldCheck, Loader2, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { CreateEventDialog } from '@/components/admin/create-event-dialog';
import { cn } from '@/lib/utils';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { Input } from '@/components/ui/input';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

type AppEventWithRole = AppEvent & { userRole?: EventRole };

function getEventOwnerLabel(event: AppEvent): string {
  return event.adminId;
}

function getStatusLabel(status: EventStatus): string {
  if (status === 'published') return 'En ligne';
  if (status === 'paused') return 'En pause';
  return 'Brouillon';
}

function getStatusAction(status: EventStatus): { label: string; nextStatus: EventStatus } {
  if (status === 'published') return { label: 'Mettre en pause', nextStatus: 'paused' };
  if (status === 'paused') return { label: 'Réactiver', nextStatus: 'published' };
  return { label: 'Publier', nextStatus: 'published' };
}

function formatEventDateRange(event: AppEvent): string {
  if (!event.startDate && !event.endDate) return 'Dates à définir';

  return [event.startDate, event.endDate]
    .filter(Boolean)
    .map((date) => date!.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' }))
    .join(' - ');
}

export default function MyEventsPage() {
  const { user, loading: authLoading, isApproved, role: globalRole } = useAuth();
  const { toast } = useToast();
  const [events, setEvents] = useState<AppEventWithRole[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorType, setErrorType] = useState<'NONE' | 'INDEX_MISSING' | 'OTHER'>('NONE');
  const [updatingEventId, setUpdatingEventId] = useState<string | null>(null);
  const [deletingEventId, setDeletingEventId] = useState<string | null>(null);
  const [eventToDelete, setEventToDelete] = useState<AppEventWithRole | null>(null);
  const [deleteConfirmation, setDeleteConfirmation] = useState('');
  const isPlatformOwner = globalRole === 'owner';
  const canAccessEvents = isApproved || isPlatformOwner;

  const loadEvents = useCallback(async (isManual = false) => {
    if (!user || !canAccessEvents) return;
    if (!isManual) setLoading(true);
    
    setErrorType('NONE');
    try {
      const data: AppEventWithRole[] = isPlatformOwner
        ? await fetchAllEvents()
        : await fetchUserEvents(user.uid);

      setEvents(
        data
          .map((event) => ({
            ...event,
            userRole: isPlatformOwner ? 'admin' : event.userRole
          }))
          .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())
      );
    } catch (err: any) {
      console.error("Erreur lors de la récupération des événements:", err);
      if (err.message === 'INDEX_MISSING') {
        setErrorType('INDEX_MISSING');
      } else {
        setErrorType('OTHER');
      }
    } finally {
      setLoading(false);
    }
  }, [user, canAccessEvents, isPlatformOwner]);

  const handleStatusChange = async (event: AppEventWithRole) => {
    const action = getStatusAction(event.status);
    setUpdatingEventId(event.id);

    try {
      await updateEventStatus(event.id, action.nextStatus);
      setEvents((currentEvents) =>
        currentEvents.map((currentEvent) =>
          currentEvent.id === event.id
            ? { ...currentEvent, status: action.nextStatus, updatedAt: new Date() }
            : currentEvent
        )
      );
      toast({
        title: 'Statut mis à jour',
        description: `${event.name} est maintenant ${getStatusLabel(action.nextStatus).toLowerCase()}.`
      });
    } catch {
      toast({
        title: 'Erreur',
        description: "Impossible de mettre à jour le statut de l'événement.",
        variant: 'destructive'
      });
    } finally {
      setUpdatingEventId(null);
    }
  };

  const handleDeleteEvent = async () => {
    if (!eventToDelete || deleteConfirmation !== 'SUPPRIMER') return;

    setDeletingEventId(eventToDelete.id);

    try {
      await deleteEvent(eventToDelete.id);
      setEvents((currentEvents) => currentEvents.filter((event) => event.id !== eventToDelete.id));
      toast({
        title: 'Événement supprimé',
        description: `${eventToDelete.name} a été supprimé définitivement.`
      });
      setEventToDelete(null);
      setDeleteConfirmation('');
    } catch {
      toast({
        title: 'Erreur',
        description: "Impossible de supprimer l'événement.",
        variant: 'destructive'
      });
    } finally {
      setDeletingEventId(null);
    }
  };

  useEffect(() => {
    if (user && canAccessEvents) {
      loadEvents();
    } else if (!authLoading) {
      setLoading(false);
    }
  }, [user, canAccessEvents, authLoading, loadEvents]);

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

  if (!canAccessEvents) {
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
            <h1 className="text-3xl font-bold tracking-tight">
              {isPlatformOwner ? 'Tous les événements' : 'Mes Événements'}
            </h1>
            <p className="text-muted-foreground">
              {isPlatformOwner
                ? 'Supervision globale des événements de la plateforme Spotly.'
                : 'Gestion de vos espaces et festivals personnels.'}
            </p>
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

        {events.length === 0 && !loading ? (
          <Card className="flex flex-col items-center justify-center p-12 text-center border-dashed rounded-[2rem] bg-muted/10">
            <div className="p-4 rounded-full bg-primary/10 mb-4">
               <Calendar className="h-12 w-12 text-primary opacity-50" />
            </div>
            <CardTitle className="text-2xl">Aucun événement trouvé</CardTitle>
            <CardDescription className="mt-2 max-w-sm">
               {isPlatformOwner
                 ? "Aucun événement n'existe encore sur la plateforme."
                 : "Vous n'avez pas encore créé d'événement ou vous n'êtes membre d'aucun espace."}
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
                  <div className="flex items-center justify-between mb-2">
                     <CardTitle className="text-xl font-bold line-clamp-1">{e.name}</CardTitle>
                     <Badge variant={e.status === 'published' ? "default" : "outline"} className={cn(
                        "text-[10px] uppercase font-bold",
                        e.status === 'published' && "bg-green-500/10 text-green-600 border-none",
                        e.status === 'paused' && "bg-amber-500/10 text-amber-600 border-none",
                        e.status === 'draft' && "text-muted-foreground"
                     )}>
                        {getStatusLabel(e.status)}
                     </Badge>
                  </div>
                  
                  <div className="flex flex-wrap gap-2">
                     <Badge className="bg-primary/10 text-primary hover:bg-primary/10 border-none flex gap-1 items-center text-[10px] uppercase font-bold">
                        <ShieldCheck className="h-3 w-3" />
                        {isPlatformOwner ? 'Owner plateforme' : e.userRole || 'Admin'}
                     </Badge>
                     {e.adminId === user?.uid && (
                        <Badge variant="outline" className="text-amber-600 border-amber-200 bg-amber-50 flex gap-1 items-center text-[10px] uppercase font-bold">
                            <UserCheck className="h-3 w-3" />
                            Créateur
                        </Badge>
                     )}
                  </div>
                  <p className="mt-4 text-xs font-semibold text-muted-foreground">
                    {formatEventDateRange(e)}
                    {e.timezone ? ` · ${e.timezone}` : ''}
                  </p>
                  {isPlatformOwner && (
                    <p className="mt-2 text-xs text-muted-foreground">
                      Créateur : <span className="font-semibold text-foreground">{getEventOwnerLabel(e)}</span>
                    </p>
                  )}
                </CardHeader>
                <CardContent className="pt-6 space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <Button variant="default" size="sm" asChild className="rounded-xl h-12 gap-2 font-bold shadow-md">
                       <Link href={`/${e.slug}/dashboard`}>
                          <LayoutDashboard className="h-4 w-4" />
                          Dashboard
                       </Link>
                    </Button>
                    <Button variant="secondary" size="sm" asChild className="rounded-xl h-12 gap-2 font-bold">
                       <Link href={`/${e.slug}/admin`}>
                          <Settings className="h-4 w-4" />
                          Modifier
                       </Link>
                    </Button>
                    {isPlatformOwner && (
                      <Button variant="outline" size="sm" asChild className="rounded-xl h-12 gap-2 font-bold">
                        <Link href={`/${e.slug}/admin/members`}>
                          <UserCheck className="h-4 w-4" />
                          Équipe
                        </Link>
                      </Button>
                    )}
                    {(globalRole === 'owner' || e.userRole === 'admin') && (
                      <>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleStatusChange(e)}
                          disabled={updatingEventId === e.id || deletingEventId === e.id}
                          className="rounded-xl h-12 font-bold"
                        >
                          {updatingEventId === e.id && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                          {getStatusAction(e.status).label}
                        </Button>
                        <Button
                          variant="destructive"
                          size="sm"
                          onClick={() => {
                            setEventToDelete(e);
                            setDeleteConfirmation('');
                          }}
                          disabled={deletingEventId === e.id || updatingEventId === e.id}
                          className="rounded-xl h-12 font-bold"
                        >
                          {deletingEventId === e.id ? (
                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          ) : (
                            <Trash2 className="h-4 w-4 mr-2" />
                          )}
                          Supprimer
                        </Button>
                      </>
                    )}
                  </div>
                  <div className="text-[10px] font-mono text-muted-foreground text-center">
                    ID: {e.id} | /{e.slug}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
        <AlertDialog
          open={eventToDelete !== null}
          onOpenChange={(open) => {
            if (!open && deletingEventId === null) {
              setEventToDelete(null);
              setDeleteConfirmation('');
            }
          }}
        >
          <AlertDialogContent className="rounded-[2rem]">
            <AlertDialogHeader>
              <AlertDialogTitle>Suppression définitive</AlertDialogTitle>
              <AlertDialogDescription className="space-y-4">
                <span className="block">
                  Cette action supprimera définitivement l'événement,
                  ses POI, sa configuration et ses données associées.
                </span>
                <span className="block font-semibold text-destructive">
                  Cette action est irréversible.
                </span>
              </AlertDialogDescription>
            </AlertDialogHeader>
            <div className="space-y-2">
              <label htmlFor="delete-event-confirmation" className="text-sm font-medium">
                Tapez SUPPRIMER pour confirmer
              </label>
              <Input
                id="delete-event-confirmation"
                value={deleteConfirmation}
                onChange={(event) => setDeleteConfirmation(event.target.value)}
                disabled={deletingEventId !== null}
                autoComplete="off"
              />
            </div>
            <AlertDialogFooter>
              <AlertDialogCancel className="rounded-xl" disabled={deletingEventId !== null}>
                Annuler
              </AlertDialogCancel>
              <AlertDialogAction
                onClick={(event) => {
                  event.preventDefault();
                  void handleDeleteEvent();
                }}
                disabled={deleteConfirmation !== 'SUPPRIMER' || deletingEventId !== null}
                className="rounded-xl bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                {deletingEventId !== null && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Supprimer
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </AppLayout>
  );
}
