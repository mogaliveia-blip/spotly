'use client';

import { useMemo, useState, useEffect, useCallback, useRef } from 'react';
import type { MouseEvent } from 'react';
import { useAuth } from '@/hooks/use-auth-user';
import { Button } from '@/components/ui/button';
import { fetchAppConfig, DEFAULT_EVENT_ID, fetchPublishedEvents, fetchUserEvents } from '@/lib/data';
import type { AppConfig, AppEvent } from '@/lib/types';
import { formatEventDateRange, getEventCalendarRange, getEventTiming } from '@/lib/event-time';
import { Mountain, ArrowRight, Calendar, CalendarDays, Search, MapPin, X } from 'lucide-react';
import { signOut } from 'firebase/auth';
import { auth } from '@/lib/firebase';
import Image from 'next/image';
import { AuthDialog } from '@/components/auth/auth-dialog';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { canAccessMyEvents, canAccessPlatformAdmin } from '@/lib/access-control';
import { selectPortalView } from '@/lib/portal-view';
import { SpotlyMapPreview } from '@/components/marketing/spotly-map-preview';
import { SpotlyQrReminder } from '@/components/marketing/spotly-qr-reminder';
import { discoveryCategories } from '@/lib/event-discovery';
import type { DiscoveryCategoryId } from '@/lib/event-discovery';

const ALL_DEPARTMENTS_VALUE = 'all';
const EVENTS_LOAD_TIMEOUT_MS = 8000;
const EVENTS_RETRY_DELAY_MS = 900;
const EVENTS_STALE_MS = 30000;

type EventsLoadStatus = 'loading' | 'refreshing' | 'success' | 'error';

let publishedEventsMemoryCache: { events: AppEvent[]; loadedAt: number } | null = null;

const categoryAppearance: Record<DiscoveryCategoryId, { border: string; badge: string; image: string }> = {
  music: { border: 'border-l-violet-500', badge: 'bg-violet-100 text-violet-900 dark:bg-violet-950 dark:text-violet-100', image: 'bg-violet-100 text-violet-700 dark:bg-violet-950 dark:text-violet-200' },
  culture: { border: 'border-l-rose-500', badge: 'bg-rose-100 text-rose-900 dark:bg-rose-950 dark:text-rose-100', image: 'bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-200' },
  gastronomy: { border: 'border-l-amber-500', badge: 'bg-amber-100 text-amber-950 dark:bg-amber-950 dark:text-amber-100', image: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200' },
  sport: { border: 'border-l-sky-500', badge: 'bg-sky-100 text-sky-900 dark:bg-sky-950 dark:text-sky-100', image: 'bg-sky-100 text-sky-700 dark:bg-sky-950 dark:text-sky-200' },
  nature: { border: 'border-l-emerald-500', badge: 'bg-emerald-100 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-100', image: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-200' },
  other: { border: 'border-l-slate-500', badge: 'bg-slate-100 text-slate-900 dark:bg-slate-800 dark:text-slate-100', image: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200' },
};
const unknownCategoryAppearance = {
  border: 'border-l-muted-foreground', badge: 'bg-muted text-foreground', image: 'bg-muted text-muted-foreground',
};

function EventCoverImage({ event, fallbackClassName }: { event: AppEvent; fallbackClassName: string }) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const eventCoverUrl = event.eventCoverUrl?.trim();
  const usableUrl = !!eventCoverUrl && (
    eventCoverUrl.startsWith('https://') ||
    (eventCoverUrl.startsWith('/') && !eventCoverUrl.startsWith('//')) ||
    eventCoverUrl.startsWith('data:image/')
  );
  const showImage = usableUrl && failedUrl !== eventCoverUrl;
  const optimizable = !!eventCoverUrl && (
    (eventCoverUrl.startsWith('/') && !eventCoverUrl.startsWith('//')) ||
    eventCoverUrl.startsWith('https://firebasestorage.googleapis.com/')
  );

  return (
    <div className={`relative flex h-36 w-full items-center justify-center overflow-hidden sm:h-44 lg:h-48 ${fallbackClassName}`}>
      {showImage ? <Image
        src={eventCoverUrl}
        alt={`Couverture de ${event.name}`}
        fill
        unoptimized={!optimizable}
        sizes="(max-width: 767px) calc(100vw - 2rem), (max-width: 1279px) 45vw, 540px"
        className="object-cover"
        onError={() => setFailedUrl(eventCoverUrl)}
      /> : <CalendarDays aria-hidden="true" className="h-12 w-12 opacity-70" />}
    </div>
  );
}

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

function compareEventsByDate(a: AppEvent, b: AppEvent): number {
  const aDay = getEventCalendarRange(a)?.startDay ?? '9999-12-31';
  const bDay = getEventCalendarRange(b)?.startDay ?? '9999-12-31';
  return aDay.localeCompare(bDay) || a.name.localeCompare(b.name, 'fr');
}

export default function PortalPage() {
  const [config, setConfig] = useState<AppConfig | null | undefined>(undefined);
  const [configAttempt, setConfigAttempt] = useState(0);
  const [events, setEvents] = useState<AppEvent[]>(publishedEventsMemoryCache?.events ?? []);
  const [eventsStatus, setEventsStatus] = useState<EventsLoadStatus>(publishedEventsMemoryCache?.events.length ? 'refreshing' : 'loading');
  const [initialEventsResolved, setInitialEventsResolved] = useState(false);
  const [eventsError, setEventsError] = useState<string | null>(null);
  const [lastEventsLoadedAt, setLastEventsLoadedAt] = useState<number | null>(publishedEventsMemoryCache?.loadedAt ?? null);
  const [hasEventMembership, setHasEventMembership] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [departmentFilter, setDepartmentFilter] = useState(ALL_DEPARTMENTS_VALUE);
  const { user, firebaseUser, role: globalRole } = useAuth();
  const eventRequestSeqRef = useRef(0);
  const activeEventsRequestRef = useRef<number | null>(null);
  const latestEventsRef = useRef<AppEvent[]>(publishedEventsMemoryCache?.events ?? []);

  const showMyEvents = !!user && !firebaseUser?.isAnonymous && canAccessMyEvents({ globalRole, hasEventMembership });
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
      past: [] as AppEvent[],
      unknown: [] as AppEvent[]
    };

    const now = new Date();
    filteredEvents.forEach((event) => {
      groups[getEventTiming(event, now)].push(event);
    });

    groups.ongoing.sort(compareEventsByDate);
    groups.upcoming.sort(compareEventsByDate);
    groups.past.sort((a, b) => compareEventsByDate(b, a));
    groups.unknown.sort(compareEventsByDate);

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
      setInitialEventsResolved(true);
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
      setInitialEventsResolved(true);
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
    const dateLabel = getEventCalendarRange(event) ? formatEventDateRange(event) : null;
    const category = discoveryCategories.find((item) => item.id === event.categoryId);
    const appearance = category ? categoryAppearance[category.id] : unknownCategoryAppearance;

    return (
      <Link key={event.id} href={`/${event.slug}/dashboard`} className="group block h-full rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2">
        <Card className={`flex h-full min-w-0 flex-col overflow-hidden rounded-2xl border border-l-4 bg-card shadow-sm transition-shadow duration-200 group-hover:shadow-md motion-reduce:transition-none ${appearance.border}`}>
          <EventCoverImage event={event} fallbackClassName={appearance.image} />
          <CardHeader className="space-y-2 p-4 pb-2 sm:p-5 sm:pb-2">
            <div className="flex items-start justify-between gap-3">
              <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${appearance.badge}`}>
                {category?.label ?? 'Événement'}
              </span>
              <ArrowRight aria-hidden="true" className="h-5 w-5 shrink-0 text-primary" />
            </div>
            <CardTitle className="break-words text-lg font-bold leading-snug sm:text-xl">{event.name}</CardTitle>
          </CardHeader>
          <CardContent className="mt-auto space-y-2 px-4 pb-4 pt-1 sm:px-5 sm:pb-5">
            {dateLabel && (
              <div className="flex items-start gap-2 text-sm text-foreground">
                <Calendar className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                <span>{dateLabel}</span>
              </div>
            )}
            {locationLabel && (
              <div className="flex items-start gap-2 text-sm text-foreground">
                <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                <span>{locationLabel}</span>
              </div>
            )}
          </CardContent>
        </Card>
      </Link>
    );
  };

  const renderEventSection = (title: string, sectionEvents: AppEvent[]) => {
    if (sectionEvents.length === 0) return null;

    return (
      <section className="space-y-3">
        <h3 className="text-lg font-black tracking-tight">{title}</h3>
        <div className="grid gap-4 md:grid-cols-2">
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

    setConfig(undefined);
    fetchAppConfig(DEFAULT_EVENT_ID, { throwOnReadError: true })
      .then((appConfig) => {
        if (isMounted) setConfig(appConfig);
      })
      .catch(() => {
        if (isMounted) setConfig(null);
      });

    return () => {
      isMounted = false;
    };
  }, [configAttempt]);

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

  const portalView = selectPortalView(config, initialEventsResolved, events.length, eventsStatus, lastEventsLoadedAt !== null);

  if (portalView === 'loading') {
    return <main role="status" className="flex min-h-screen items-center justify-center bg-background text-sm text-muted-foreground">Chargement de l’accueil…</main>;
  }

  if (portalView === 'config-error' || portalView === 'events-error') {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background px-4 text-center">
        <p role="alert" className="text-sm text-muted-foreground">
          {portalView === 'config-error' ? 'Impossible de charger la configuration de l’accueil.' : eventsError}
        </p>
        <Button variant="outline" onClick={() => {
          if (portalView === 'config-error') {
            setConfig(undefined);
            setConfigAttempt((attempt) => attempt + 1);
          } else {
            void loadPublishedEvents('retry');
          }
        }}>Réessayer</Button>
      </main>
    );
  }

  // MODE MAINTENANCE / LANDING PAGE ACTIVE
  if (portalView === 'landing') {
    return (
      <div className="flex min-h-screen flex-col bg-background">
        <header className="sticky top-0 z-20 flex h-16 items-center justify-between border-b bg-background/80 px-4 backdrop-blur-sm md:px-6">
          <Link
            href="/"
            onClick={handleSpotlyHomeClick}
            className="inline-flex h-11 items-center gap-2 rounded-xl border bg-background/90 px-3 shadow-sm transition hover:bg-accent active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Mountain className="h-6 w-6 text-primary" />
            <span className="text-base font-semibold sm:text-lg">Un Instant Ici</span>
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
                      Un Instant Ici
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
              <p>© {new Date().getFullYear()} Un Instant Ici. Tous droits réservés.</p>
              <p className="mt-2">
                Un Instant Ici est une création{' '}
                <a href="https://anavastudio.fr" target="_blank" rel="noopener noreferrer" className="font-medium underline underline-offset-4 hover:text-primary">
                  Anava Studio
                </a>
              </p>
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
          <span className="text-sm font-bold tracking-tight text-primary sm:text-lg">Un Instant Ici</span>
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

      <main className="flex-1 container mx-auto px-4 py-5 sm:px-6 sm:py-8 lg:py-10">
        <div className="mx-auto max-w-6xl space-y-6 sm:space-y-10 lg:space-y-14">
          <section className="space-y-2 sm:space-y-3" aria-labelledby="portal-heading">
            <h1 id="portal-heading" className="max-w-3xl text-[28px] font-black leading-tight tracking-tight text-foreground sm:text-4xl lg:text-5xl">
              Votre prochaine découverte commence <span className="text-primary">ici.</span>
            </h1>
            <p className="max-w-2xl text-sm text-muted-foreground sm:text-base">
              Des événements et des expériences à vivre près de chez vous.
            </p>
          </section>

          <section id="evenements" className="scroll-mt-24 space-y-4 sm:space-y-5" aria-labelledby="events-heading">
            <div className="max-w-4xl rounded-2xl border border-primary/25 bg-primary/10 p-3 shadow-sm sm:p-4">
                <div className={hasDepartmentOptions ? 'grid min-w-0 gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,240px)_auto] md:items-center' : 'grid min-w-0 gap-3 md:grid-cols-[minmax(0,1fr)_auto] md:items-center'}>
                  <div className="relative">
                    <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-primary" />
                    <Input
                      aria-label="Rechercher un événement"
                      value={searchQuery}
                      onChange={(event) => setSearchQuery(event.target.value)}
                      placeholder="Rechercher par nom, ville, région..."
                      className="h-11 rounded-2xl border-primary/25 bg-card pl-10 shadow-sm"
                    />
                  </div>

                  {hasDepartmentOptions && (
                    <div className="relative">
                      <MapPin aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 z-10 h-4 w-4 -translate-y-1/2 text-primary" />
                      <Select value={departmentFilter} onValueChange={setDepartmentFilter}>
                        <SelectTrigger aria-label="Filtrer par département" className="h-11 rounded-2xl border-primary/25 bg-card pl-10 shadow-sm">
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
                    </div>
                  )}

                  {hasActiveFilters && (
                    <Button type="button" variant="ghost" onClick={resetFilters} className="h-11 rounded-2xl md:px-4">
                      <X className="h-4 w-4" /> Réinitialiser
                    </Button>
                  )}
                </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 id="events-heading" className="text-2xl font-bold">À découvrir</h2>
              <Button asChild variant="link" size="sm" className="h-auto px-0 font-semibold">
                <Link href="/discovery"><MapPin aria-hidden="true" className="h-4 w-4" /> Recherche avancée</Link>
              </Button>
            </div>

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
              <div className="grid gap-4 md:grid-cols-2" role="status" aria-label="Chargement des événements">
                <div className="h-48 rounded-2xl bg-muted animate-pulse motion-reduce:animate-none" />
                <div className="hidden h-48 rounded-2xl bg-muted animate-pulse motion-reduce:animate-none md:block" />
              </div>
            ) : events.length > 0 ? (
              filteredEvents.length > 0 ? (
                <div className="space-y-8">
                  {renderEventSection('Aujourd’hui', groupedEvents.ongoing)}
                  {renderEventSection('À venir', groupedEvents.upcoming)}
                  {renderEventSection('Terminés', groupedEvents.past)}
                  {renderEventSection('Dates à vérifier', groupedEvents.unknown)}
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
                <p className="text-muted-foreground font-bold">Aucun événement à découvrir pour le moment</p>
                <p className="text-sm text-muted-foreground mt-2">Revenez bientôt !</p>
              </div>
            )}
          </section>

          <section className="grid items-center gap-6 border-t pt-8 lg:grid-cols-2 lg:gap-10" aria-labelledby="event-map-heading">
            <div className="space-y-3">
              <h2 id="event-map-heading" className="text-2xl font-bold">Profitez pleinement de chaque événement</h2>
              <p className="max-w-xl text-sm leading-relaxed text-muted-foreground sm:text-base">
                Ouvrez sa Carte Event pour retrouver ses points sur la carte et les informations utiles à votre visite.
              </p>
            </div>
            <SpotlyMapPreview />
          </section>

          {!user && (
            <section className="rounded-2xl border bg-card p-5 sm:p-6" aria-labelledby="organizer-heading">
              <h2 id="organizer-heading" className="text-lg font-bold">Vous organisez un événement ?</h2>
              <p className="mt-2 text-sm text-muted-foreground">Nous pouvons créer votre espace Un Instant Ici avec vous.</p>
              <Button asChild variant="link" size="sm" className="mt-2 h-auto px-0 font-semibold">
                <Link href="/contact">Parler de mon événement <ArrowRight aria-hidden="true" className="h-4 w-4" /></Link>
              </Button>
            </section>
          )}

          <SpotlyQrReminder />

        </div>
      </main>

      <footer className="py-12 border-t mt-20">
        <div className="container mx-auto px-4">
          <div className="flex flex-col md:flex-row justify-between items-center gap-8">
            <div className="flex items-center gap-2">
              <Mountain className="h-6 w-6 text-primary" />
              <span className="text-lg font-bold">Un Instant Ici</span>
            </div>
            
            <div className="text-sm text-muted-foreground">
              <p>© {new Date().getFullYear()} Un Instant Ici. Votre guide événementiel.</p>
              <p className="mt-2 text-center md:text-left">
                Un Instant Ici est une création{' '}
                <a href="https://anavastudio.fr" target="_blank" rel="noopener noreferrer" className="font-medium underline underline-offset-4 hover:text-primary">
                  Anava Studio
                </a>
              </p>
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
