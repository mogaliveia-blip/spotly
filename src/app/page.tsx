'use client';

import { useMemo, useState, useEffect, useCallback, useRef } from 'react';
import type { MouseEvent } from 'react';
import { useAuth } from '@/hooks/use-auth-user';
import { Button } from '@/components/ui/button';
import { fetchAppConfig, DEFAULT_EVENT_ID, fetchPublishedEvents, fetchUserEvents } from '@/lib/data';
import type { AppConfig, AppEvent } from '@/lib/types';
import { Mountain, ArrowRight, Calendar, Search, MapPin, X } from 'lucide-react';
import { signOut } from 'firebase/auth';
import { auth } from '@/lib/firebase';
import Image from 'next/image';
import { AuthDialog } from '@/components/auth/auth-dialog';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { canAccessMyEvents, canAccessPlatformAdmin } from '@/lib/access-control';
import { SpotlyMapPreview } from '@/components/marketing/spotly-map-preview';

const ALL_DEPARTMENTS_VALUE = 'all';
const EVENTS_LOAD_TIMEOUT_MS = 8000;
const EVENTS_RETRY_DELAY_MS = 900;
const EVENTS_STALE_MS = 30000;
const defaultConfig: AppConfig = { isLandingPageActive: false };

type EventsLoadStatus = 'loading' | 'refreshing' | 'success' | 'error';

let publishedEventsMemoryCache: { events: AppEvent[]; loadedAt: number } | null = null;

function normalizeSearchValue(value?: string): string {
  return value?.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim() ?? '';
}

function getEventDepartmentLabel(event: AppEvent): string | null {
  if (!event.departmentCode && !event.departmentName) return null;
  return [event.departmentCode?.trim(), event.departmentName?.trim()].filter(Boolean).join(' - ');
}

function getEventDepartmentFilterValue(event: AppEvent): string | null {
  return event.departmentCode?.trim() || event.departmentName?.trim() || null;
}

function startOfToday(): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

function endOfToday(): Date {
  const start = startOfToday();
  return new Date(start.getTime() + 24 * 60 * 60 * 1000 - 1);
}

function getEventTiming(event: AppEvent): 'ongoing' | 'upcoming' | 'past' {
  const todayStart = startOfToday();
  const todayEnd = endOfToday();

  if (event.endDate && event.endDate < todayStart) return 'past';
  if (event.startDate && event.startDate > todayEnd) return 'upcoming';
  return 'ongoing';
}

function compareEventsByDate(a: AppEvent, b: AppEvent): number {
  const aTime = a.startDate?.getTime() ?? Number.MAX_SAFE_INTEGER;
  const bTime = b.startDate?.getTime() ?? Number.MAX_SAFE_INTEGER;
  return aTime - bTime || a.name.localeCompare(b.name, 'fr');
}

export default function PortalPage() {
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [events, setEvents] = useState<AppEvent[]>(publishedEventsMemoryCache?.events ?? []);
  const [eventsStatus, setEventsStatus] = useState<EventsLoadStatus>(publishedEventsMemoryCache?.events.length ? 'refreshing' : 'loading');
  const [eventsError, setEventsError] = useState<string | null>(null);
  const [lastEventsLoadedAt, setLastEventsLoadedAt] = useState<number | null>(publishedEventsMemoryCache?.loadedAt ?? null);
  const [hasEventMembership, setHasEventMembership] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [departmentFilter, setDepartmentFilter] = useState(ALL_DEPARTMENTS_VALUE);
  const { user, role: globalRole } = useAuth();
  const eventRequestSeqRef = useRef(0);
  const activeEventsRequestRef = useRef<number | null>(null);
  const latestEventsRef = useRef<AppEvent[]>(publishedEventsMemoryCache?.events ?? []);

  const effectiveConfig = config ?? defaultConfig;
  const showMyEvents = !!user && canAccessMyEvents({ globalRole, hasEventMembership });
  const showPlatformAdmin = canAccessPlatformAdmin(globalRole);

  const departments = useMemo(() => {
    const map = new Map<string, { code: string; name: string; label: string }>();

    events.forEach((event) => {
      const code = getEventDepartmentFilterValue(event);
      if (!code) return;

      map.set(code, {
        code,
        name: event.departmentName?.trim() || event.departmentCode?.trim() || code,
        label: getEventDepartmentLabel(event) ?? code
      });
    });

    return Array.from(map.values()).sort((a, b) => a.label.localeCompare(b.label, 'fr'));
  }, [events]);
  const hasDepartmentOptions = departments.length > 0;
  const hasActiveFilters = searchQuery.trim().length > 0 || (hasDepartmentOptions && departmentFilter !== ALL_DEPARTMENTS_VALUE);

  const filteredEvents = useMemo(() => {
    const normalizedQuery = normalizeSearchValue(searchQuery);

    return events.filter((event) => {
      const matchesDepartment =
        departmentFilter === ALL_DEPARTMENTS_VALUE ||
        getEventDepartmentFilterValue(event) === departmentFilter;

      if (!matchesDepartment) return false;
      if (!normalizedQuery) return true;

      const searchable = [
        event.name,
        event.slug,
        event.city,
        event.departmentCode,
        event.departmentName,
        event.region,
        event.country
      ].map(normalizeSearchValue).join(' ');

      return searchable.includes(normalizedQuery);
    });
  }, [events, searchQuery, departmentFilter]);

  const groupedEvents = useMemo(() => {
    const groups = {
      ongoing: [] as AppEvent[],
      upcoming: [] as AppEvent[],
      past: [] as AppEvent[]
    };

    filteredEvents.forEach((event) => {
      groups[getEventTiming(event)].push(event);
    });

    groups.ongoing.sort(compareEventsByDate);
    groups.upcoming.sort(compareEventsByDate);
    groups.past.sort((a, b) => compareEventsByDate(b, a));

    return groups;
  }, [filteredEvents]);

  const resetFilters = () => {
    setSearchQuery('');
    setDepartmentFilter(ALL_DEPARTMENTS_VALUE);
  };

  useEffect(() => {
    if (departmentFilter === ALL_DEPARTMENTS_VALUE) return;

    const departmentExists = departments.some((department) => department.code === departmentFilter);
    if (!departmentExists) {
      setDepartmentFilter(ALL_DEPARTMENTS_VALUE);
    }
  }, [departmentFilter, departments]);

  useEffect(() => {
    let isMounted = true;

    if (!user || showPlatformAdmin) {
      setHasEventMembership(false);
      return;
    }

    fetchUserEvents(user.uid)
      .then((userEvents) => {
        if (isMounted) setHasEventMembership(userEvents.length > 0);
      })
      .catch(() => {
        if (isMounted) setHasEventMembership(false);
      });

    return () => {
      isMounted = false;
    };
  }, [user, showPlatformAdmin]);

  const readEventsWithTimeout = useCallback(() => {
    let timeoutId: number | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timeoutId = window.setTimeout(() => reject(new Error('EVENTS_LOAD_TIMEOUT')), EVENTS_LOAD_TIMEOUT_MS);
    });

    return Promise.race([fetchPublishedEvents(), timeout]).finally(() => {
      if (timeoutId !== undefined) window.clearTimeout(timeoutId);
    });
  }, []);

  const loadPublishedEvents = useCallback(async (reason: 'initial' | 'retry' | 'resume' | 'manual' = 'initial') => {
    if (activeEventsRequestRef.current !== null) return;

    const cached = publishedEventsMemoryCache;
    const currentEvents = latestEventsRef.current;
    const hadValidEvents = (cached?.events.length ?? 0) > 0 || currentEvents.length > 0;
    const requestId = ++eventRequestSeqRef.current;
    activeEventsRequestRef.current = requestId;

    if (cached?.events.length) {
      setEvents(cached.events);
      setLastEventsLoadedAt(cached.loadedAt);
    } else if (!hadValidEvents && reason === 'initial') {
      setEvents([]);
      setLastEventsLoadedAt(null);
    }

    setEventsStatus(hadValidEvents ? 'refreshing' : 'loading');
    setEventsError(null);

    try {
      let nextEvents: AppEvent[];

      try {
        nextEvents = await readEventsWithTimeout();
      } catch {
        await new Promise((resolve) => window.setTimeout(resolve, EVENTS_RETRY_DELAY_MS));
        nextEvents = await readEventsWithTimeout();
      }

      if (nextEvents.length === 0 && !hadValidEvents) {
        await new Promise((resolve) => window.setTimeout(resolve, EVENTS_RETRY_DELAY_MS));
        nextEvents = await readEventsWithTimeout();
      }

      if (activeEventsRequestRef.current !== requestId || eventRequestSeqRef.current !== requestId) {
        return;
      }

      const loadedAt = Date.now();
      publishedEventsMemoryCache = { events: nextEvents, loadedAt };
      setEvents(nextEvents);
      setLastEventsLoadedAt(loadedAt);
      setEventsStatus('success');
      setEventsError(null);
    } catch (error: any) {
      if (activeEventsRequestRef.current !== requestId || eventRequestSeqRef.current !== requestId) {
        return;
      }

      setEventsStatus('error');
      setEventsError(
        error?.message === 'EVENTS_LOAD_TIMEOUT'
          ? 'Le chargement des événements prend trop de temps. Vérifiez votre connexion puis réessayez.'
          : 'Impossible de charger les événements.'
      );
    } finally {
      if (activeEventsRequestRef.current === requestId) {
        activeEventsRequestRef.current = null;
      }
    }
  }, [readEventsWithTimeout]);

  useEffect(() => {
    latestEventsRef.current = events;
  }, [events]);

  const renderEventCard = (event: AppEvent) => {
    const departmentLabel = getEventDepartmentLabel(event);
    const locationLabel = [event.city, departmentLabel, event.region].filter(Boolean).join(' · ');
    const dateLabel = [event.startDate, event.endDate]
      .filter(Boolean)
      .map((date) => date!.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' }))
      .join(' - ');

    return (
      <Link key={event.id} href={`/${event.slug}/dashboard`} className="group">
        <Card className="rounded-[2.5rem] overflow-hidden border-muted shadow-sm group-hover:shadow-2xl group-hover:-translate-y-1 transition-all duration-300">
          <CardHeader className="bg-primary/5 p-8">
            <div className="flex justify-between items-start mb-4">
              <div className="p-3 rounded-2xl bg-white shadow-sm text-primary">
                <Mountain className="h-6 w-6" />
              </div>
              <span className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-white/50 shadow-sm transition-colors group-hover:bg-primary group-hover:text-white" aria-hidden="true">
                <ArrowRight className="h-4 w-4" />
              </span>
            </div>
            <CardTitle className="text-2xl font-black line-clamp-1">{event.name}</CardTitle>
            <CardDescription className="font-bold text-xs uppercase tracking-widest text-primary/60">
              {event.slug}
            </CardDescription>
          </CardHeader>
          <CardContent className="p-8 bg-white border-t space-y-4">
            {dateLabel && (
              <div className="flex items-start gap-2 text-sm font-semibold text-foreground">
                <Calendar className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                <span>{dateLabel}</span>
              </div>
            )}
            {locationLabel && (
              <div className="flex items-start gap-2 text-sm font-semibold text-foreground">
                <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                <span>{locationLabel}</span>
              </div>
            )}
            <p className="text-sm text-muted-foreground font-medium leading-relaxed">
              Accédez à la carte interactive, aux avis de la communauté et à toutes les informations pratiques de cet événement.
            </p>
          </CardContent>
        </Card>
      </Link>
    );
  };

  const renderEventSection = (title: string, sectionEvents: AppEvent[]) => {
    if (sectionEvents.length === 0) return null;

    return (
      <section className="space-y-4">
        <h3 className="text-lg font-black tracking-tight">{title}</h3>
        <div className="grid gap-8 sm:grid-cols-2">
          {sectionEvents.map(renderEventCard)}
        </div>
      </section>
    );
  };

  useEffect(() => {
    void loadPublishedEvents('initial');
  }, [loadPublishedEvents]);

  useEffect(() => {
    let isMounted = true;

    fetchAppConfig(DEFAULT_EVENT_ID)
      .then((appConfig) => {
        if (isMounted) setConfig(appConfig);
      })
      .catch(() => {
        if (isMounted) setConfig(defaultConfig);
      });

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    const shouldRefresh = () => {
      if (activeEventsRequestRef.current !== null) return false;
      if (eventsStatus === 'error' && events.length > 0) return true;
      if (events.length === 0) return true;
      if (!lastEventsLoadedAt) return true;
      return Date.now() - lastEventsLoadedAt > EVENTS_STALE_MS;
    };

    const refreshAfterResume = () => {
      if (document.visibilityState !== 'visible') return;
      if (shouldRefresh()) void loadPublishedEvents('resume');
    };

    window.addEventListener('pageshow', refreshAfterResume);
    document.addEventListener('visibilitychange', refreshAfterResume);

    return () => {
      window.removeEventListener('pageshow', refreshAfterResume);
      document.removeEventListener('visibilitychange', refreshAfterResume);
    };
  }, [events.length, eventsStatus, lastEventsLoadedAt, loadPublishedEvents]);

  const handleSignOut = async () => {
    await signOut(auth);
    window.location.reload();
  };

  const handleSpotlyHomeClick = useCallback((event: MouseEvent<HTMLAnchorElement>) => {
    if (window.location.pathname !== '/') return;
    event.preventDefault();
    void loadPublishedEvents('manual');
  }, [loadPublishedEvents]);

  if (eventsStatus === 'loading' && events.length === 0 && !config) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-background">
        <Mountain className="h-12 w-12 animate-pulse text-primary" />
      </div>
    );
  }

  // MODE MAINTENANCE / LANDING PAGE ACTIVE
  if (effectiveConfig.isLandingPageActive && events.length === 0 && eventsStatus === 'success') {
    return (
      <div className="flex min-h-screen flex-col bg-background">
        <header className="sticky top-0 z-20 flex h-16 items-center justify-between border-b bg-background/80 px-4 backdrop-blur-sm md:px-6">
          <Link
            href="/"
            onClick={handleSpotlyHomeClick}
            className="inline-flex h-11 items-center gap-2 rounded-xl border bg-background/90 px-3 shadow-sm transition hover:bg-accent active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Mountain className="h-6 w-6 text-primary" />
            <span className="text-lg font-semibold">Spotly</span>
          </Link>
          {user && (
            <div className="flex items-center gap-2">
              {showMyEvents && (
                <Button variant="outline" size="sm" asChild>
                  <Link href="/admin/events">Mes Événements</Link>
                </Button>
              )}
              {showPlatformAdmin && (
                <Button variant="ghost" size="sm" asChild>
                  <Link href="/admin">Administration Plateforme</Link>
                </Button>
              )}
              <Button variant="ghost" size="sm" onClick={handleSignOut}>
                Se déconnecter
              </Button>
            </div>
          )}
        </header>

        <main className="flex-1">
          <section className="relative h-[60vh] w-full lg:h-[70vh]">
            <Image
              src="https://images.unsplash.com/photo-1533174072545-7a4b6ad7a6c3?q=80&w=2070&auto=format&fit=crop"
              alt="Festival"
              fill
              className="object-cover"
              priority
              data-ai-hint="festival night"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-background via-background/50 to-transparent" />
            <div className="relative z-10 flex h-full flex-col items-center justify-center text-center p-4">
               <div className="bg-black/50 p-8 rounded-[2rem] backdrop-blur-md shadow-2xl border border-white/10 max-w-2xl">
                  <h1 className="text-4xl font-black tracking-tight sm:text-5xl md:text-6xl text-white">
                      Spotly
                  </h1>
                  <p className="mt-4 text-lg text-white/90 font-medium">
                      Bientôt disponible. L'application officielle pour ne rien manquer de vos festivals préférés.
                  </p>
              </div>
            </div>
          </section>

          <section className="py-16 md:py-24">
              <div className="container mx-auto px-4 text-center">
                  <h2 className="text-3xl font-bold tracking-tight">Préparez votre visite</h2>
                  <p className="mt-4 max-w-3xl mx-auto text-muted-foreground">
                      L'application sera bientôt disponible pour tous. Retrouvez le programme, les points d'intérêt, et organisez votre expérience pour un festival inoubliable.
                  </p>
              </div>
          </section>
        </main>

         <footer className="py-8 border-t mt-auto">
            <div className="container mx-auto px-4 text-center text-sm text-muted-foreground">
              <p>© {new Date().getFullYear()} Spotly. Tous droits réservés.</p>
              {!user && (
                   <div className="mt-4">
                      <AuthDialog 
                          trigger={
                              <Button variant="link" size="sm" className="text-xs font-bold uppercase tracking-widest text-muted-foreground/60 hover:text-primary transition-colors">
                                  Accès Organisateur
                              </Button>
                          }
                      />
                  </div>
              )}
            </div>
          </footer>
      </div>
    );
  }

  // MODE PORTAIL / LANDING PAGE FALSE
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="sticky top-0 z-20 flex h-16 items-center justify-between border-b bg-background/80 px-4 backdrop-blur-sm md:px-6">
        <Link
          href="/"
          onClick={handleSpotlyHomeClick}
          className="inline-flex h-11 items-center gap-2 rounded-xl border bg-background/90 px-3 shadow-sm transition hover:bg-accent active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Mountain className="h-6 w-6 text-primary" />
          <span className="text-lg font-bold tracking-tight text-primary">Spotly</span>
        </Link>
        <div className="flex items-center gap-3">
          {user ? (
            <>
              {showMyEvents && (
                <Button variant="ghost" size="sm" asChild className="font-bold rounded-xl">
                 <Link href="/admin/events">Mes Événements</Link>
                </Button>
              )}
              {showPlatformAdmin && (
                <Button variant="ghost" size="sm" asChild className="hidden sm:flex font-bold rounded-xl">
                  <Link href="/admin">Administration Plateforme</Link>
                </Button>
              )}
              <Button variant="outline" size="sm" onClick={handleSignOut} className="rounded-xl font-bold">
                  Quitter
              </Button>
            </>
          ) : (
            <AuthDialog
              trigger={
                <Button size="sm" className="font-bold rounded-xl shadow-sm px-5">
                  Se connecter
                </Button>
              }
            />
          )}
        </div>
      </header>

      <main className="flex-1 container mx-auto px-4 py-12 md:py-20">
        <div className="mx-auto max-w-6xl space-y-16">
          
          <div className="grid items-center gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(420px,520px)] lg:gap-12">
            <div className="space-y-6 text-center lg:text-left">
              <h1 className="text-4xl sm:text-5xl md:text-7xl font-black tracking-tighter text-foreground">
                Chaque événement, tous ses lieux, <span className="text-primary">sur une carte</span>.
              </h1>
              <p className="text-xl text-muted-foreground max-w-2xl mx-auto leading-relaxed lg:mx-0">
                Découvrez les événements autour de vous, leurs lieux utiles, leurs informations et les avis directement sur une carte interactive.
              </p>
              <div className="flex flex-col items-center justify-center gap-3 sm:flex-row lg:justify-start">
                <Button asChild size="lg" className="w-full rounded-2xl px-7 font-bold shadow-sm sm:w-auto">
                  <Link href="#evenements">Explorer les événements</Link>
                </Button>
              </div>
              {!user && (
                <div className="mx-auto flex max-w-md flex-col items-center gap-2 lg:mx-0 lg:items-start">
                  <p className="text-sm font-medium leading-relaxed text-muted-foreground">
                    Vous organisez un événement ? Nous pouvons créer votre espace Spotly avec vous.
                  </p>
                  <Button asChild variant="link" size="sm" className="h-auto px-2 font-bold lg:-ml-2">
                    <Link href="/contact">Parler de mon événement</Link>
                  </Button>
                </div>
              )}
            </div>

            <SpotlyMapPreview />
          </div>

          <section className="hidden sm:block">
            <Card className="overflow-hidden rounded-[2rem] border-muted bg-card shadow-sm">
              <CardContent className="grid gap-6 p-6 md:grid-cols-[1fr_auto] md:items-center md:p-8">
                <div className="space-y-3">
                  <div className="inline-flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1 text-xs font-bold uppercase tracking-widest text-primary">
                    <Mountain className="h-3.5 w-3.5" />
                    Spotly mobile
                  </div>
                  <div className="space-y-2">
                    <h2 className="text-2xl font-black tracking-tight">Spotly sur votre téléphone</h2>
                    <p className="max-w-xl text-sm font-medium leading-relaxed text-muted-foreground md:text-base">
                      Scannez le QR Code pour découvrir les événements près de chez vous et installer Spotly sur votre écran d'accueil.
                    </p>
                  </div>
                </div>
                <div className="mx-auto rounded-3xl border bg-white p-4 shadow-sm md:mx-0">
                  <Image
                    src="/spotly-qr-code.png"
                    alt="QR Code officiel Spotly vers https://spotly.anavastudio.fr/"
                    width={168}
                    height={168}
                    className="h-[168px] w-[168px]"
                  />
                </div>
              </CardContent>
            </Card>
          </section>

          <div id="evenements" className="scroll-mt-24 space-y-8">
            <div className="flex items-center justify-between">
               <h2 className="text-2xl font-bold flex items-center gap-2">
                 <Calendar className="h-6 w-6 text-primary" />
                 Événements en cours
               </h2>
               <div className="h-px flex-1 mx-8 bg-muted hidden sm:block" />
            </div>

            {(events.length > 0 || eventsStatus === 'loading' || eventsStatus === 'refreshing') && (
              <div className="rounded-[2rem] border bg-card p-4 shadow-sm">
                <div className={hasDepartmentOptions ? 'grid gap-3 md:grid-cols-[1fr_260px_auto] md:items-center' : 'grid gap-3 md:grid-cols-[1fr_auto] md:items-center'}>
                  <div className="relative">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      aria-label="Rechercher un événement"
                      value={searchQuery}
                      onChange={(event) => setSearchQuery(event.target.value)}
                      placeholder="Rechercher par nom, ville, région..."
                      className="h-11 rounded-2xl pl-10"
                    />
                  </div>

                  {hasDepartmentOptions && (
                    <Select value={departmentFilter} onValueChange={setDepartmentFilter}>
                      <SelectTrigger aria-label="Filtrer par département" className="h-11 rounded-2xl">
                        <SelectValue placeholder="Tous les départements" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={ALL_DEPARTMENTS_VALUE}>Tous les départements</SelectItem>
                        {departments.map((department) => (
                          <SelectItem key={department.code} value={department.code}>
                            {department.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}

                  <Button
                    type="button"
                    variant="ghost"
                    onClick={resetFilters}
                    disabled={!hasActiveFilters}
                    className="h-11 rounded-2xl md:px-4"
                  >
                    <X className="h-4 w-4" />
                    Réinitialiser
                  </Button>
                </div>
              </div>
            )}

            {eventsStatus === 'refreshing' && events.length > 0 && (
              <div className="text-center text-xs font-semibold text-muted-foreground">
                Actualisation des événements…
              </div>
            )}

            {eventsStatus === 'error' && events.length > 0 && (
              <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-center text-sm font-semibold text-amber-900">
                {eventsError}
              </div>
            )}

            {eventsStatus === 'loading' && events.length === 0 ? (
              <div className="grid gap-6 sm:grid-cols-2">
                <div className="h-48 rounded-[2rem] bg-muted animate-pulse" />
                <div className="h-48 rounded-[2rem] bg-muted animate-pulse" />
              </div>
            ) : events.length > 0 ? (
              filteredEvents.length > 0 ? (
                <div className="space-y-10">
                  {renderEventSection('En cours', groupedEvents.ongoing)}
                  {renderEventSection('À venir', groupedEvents.upcoming)}
                  {renderEventSection('Terminés', groupedEvents.past)}
                </div>
              ) : (
                <div className="text-center py-16 bg-muted/20 rounded-[3rem] border-2 border-dashed border-muted">
                  <Search className="h-12 w-12 mx-auto text-muted-foreground opacity-30 mb-4" />
                  <p className="text-muted-foreground font-bold">Aucun événement ne correspond à ces filtres.</p>
                  <p className="text-sm text-muted-foreground mt-2">
                    {hasDepartmentOptions ? 'Essayez une autre recherche ou un autre département.' : 'Essayez une autre recherche.'}
                  </p>
                  <Button type="button" variant="outline" onClick={resetFilters} className="mt-6 rounded-2xl">
                    Réinitialiser les filtres
                  </Button>
                </div>
              )
            ) : eventsStatus === 'error' && events.length === 0 ? (
              <div className="text-center py-20 bg-muted/20 rounded-[3rem] border-2 border-dashed border-muted">
                <Mountain className="h-12 w-12 mx-auto text-muted-foreground opacity-20 mb-4" />
                <p className="text-muted-foreground font-bold">{eventsError}</p>
                <Button type="button" variant="outline" onClick={() => void loadPublishedEvents('retry')} className="mt-6 rounded-2xl">
                  Réessayer
                </Button>
              </div>
            ) : (
              <div className="text-center py-20 bg-muted/20 rounded-[3rem] border-2 border-dashed border-muted">
                <Mountain className="h-12 w-12 mx-auto text-muted-foreground opacity-20 mb-4" />
                <p className="text-muted-foreground font-bold">Aucun événement en cours</p>
                <p className="text-sm text-muted-foreground mt-2">Revenez bientôt !</p>
              </div>
            )}
          </div>

        </div>
      </main>

      <footer className="py-12 border-t mt-20">
        <div className="container mx-auto px-4">
          <div className="flex flex-col md:flex-row justify-between items-center gap-8">
            <div className="flex items-center gap-2">
              <Mountain className="h-6 w-6 text-primary" />
              <span className="text-lg font-bold">Spotly</span>
            </div>
            
            <div className="text-sm text-muted-foreground">
               © {new Date().getFullYear()} Spotly. Votre guide événementiel.
            </div>

            <div className="flex items-center gap-4">
               {!user && (
                  <AuthDialog 
                    trigger={
                        <Button variant="ghost" size="sm" className="text-xs font-bold uppercase tracking-widest text-muted-foreground/60 hover:text-primary">
                            Se connecter
                        </Button>
                    }
                  />
               )}
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
