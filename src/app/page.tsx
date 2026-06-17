'use client';

import { useMemo, useState, useEffect } from 'react';
import { useAuth } from '@/hooks/use-auth-user';
import { Button } from '@/components/ui/button';
import { fetchAppConfig, DEFAULT_EVENT_ID, fetchPublishedEvents } from '@/lib/data';
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

const ALL_DEPARTMENTS_VALUE = 'all';

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
  const [events, setEvents] = useState<AppEvent[]>([]);
  const [eventsLoading, setEventsLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [departmentFilter, setDepartmentFilter] = useState(ALL_DEPARTMENTS_VALUE);
  const { user, loading: authLoading } = useAuth();

  const isLoading = authLoading || !config;

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
    console.log(`[Audit] PortalPage monté. Chargement de la config globale...`);
    
    fetchAppConfig(DEFAULT_EVENT_ID)
      .then(appConfig => {
        console.log(`[Audit] PortalPage a reçu la config:`, appConfig);
        console.log(`[Audit] Évaluation config.isLandingPageActive:`, appConfig.isLandingPageActive);
        
        setConfig(appConfig);
        
        setEventsLoading(true);
        fetchPublishedEvents()
          .then(data => {
              console.log(`[Audit] Événements reçus: ${data.length}`);
              setEvents(data);
          })
          .finally(() => setEventsLoading(false));
      })
      .catch((err) => {
        console.error(`[Audit] Erreur fatale lors du chargement initial:`, err);
        setConfig({ isLandingPageActive: false });
      });
  }, []);

  const handleSignOut = async () => {
    await signOut(auth);
    window.location.reload();
  };

  if (isLoading) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-background">
        <Mountain className="h-12 w-12 animate-pulse text-primary" />
      </div>
    );
  }

  // MODE MAINTENANCE / LANDING PAGE ACTIVE
  if (config.isLandingPageActive && events.length === 0 && !eventsLoading) {
    return (
      <div className="flex min-h-screen flex-col bg-background">
        <header className="sticky top-0 z-20 flex h-16 items-center justify-between border-b bg-background/80 px-4 backdrop-blur-sm md:px-6">
          <div className="flex items-center gap-2">
            <Mountain className="h-6 w-6 text-primary" />
            <span className="text-lg font-semibold">Spotly</span>
          </div>
          {user && (
            <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" asChild>
                    <Link href="/admin/events">Espace Organisateur</Link>
                </Button>
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
        <div className="flex items-center gap-2">
          <Mountain className="h-6 w-6 text-primary" />
          <span className="text-lg font-bold tracking-tight text-primary">Spotly</span>
        </div>
        <div className="flex items-center gap-3">
          {user ? (
            <>
              <Button variant="ghost" size="sm" asChild className="hidden sm:flex font-bold rounded-xl">
                 <Link href="/admin/events">Mes Événements</Link>
              </Button>
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
        <div className="max-w-4xl mx-auto space-y-16">
          
          <div className="text-center space-y-6">
            <h1 className="text-5xl md:text-7xl font-black tracking-tighter text-foreground">
              Explorez le <span className="text-primary">Festival</span>.
            </h1>
            <p className="text-xl text-muted-foreground max-w-2xl mx-auto leading-relaxed">
              Découvrez la programmation, trouvez les points d'intérêt et vivez une expérience immersive au cœur de l'événement.
            </p>
          </div>

          <div className="space-y-8">
            <div className="flex items-center justify-between">
               <h2 className="text-2xl font-bold flex items-center gap-2">
                 <Calendar className="h-6 w-6 text-primary" />
                 Événements en cours
               </h2>
               <div className="h-px flex-1 mx-8 bg-muted hidden sm:block" />
            </div>

            {(events.length > 0 || eventsLoading) && (
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

            {eventsLoading ? (
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
            ) : (
              <div className="text-center py-20 bg-muted/20 rounded-[3rem] border-2 border-dashed border-muted">
                <Mountain className="h-12 w-12 mx-auto text-muted-foreground opacity-20 mb-4" />
                <p className="text-muted-foreground font-bold">Aucun événement n'est actuellement disponible publiquement.</p>
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
                            Espace Organisateur
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
