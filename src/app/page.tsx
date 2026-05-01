'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/hooks/use-auth-user';
import { Button } from '@/components/ui/button';
import { fetchAppConfig, DEFAULT_EVENT_ID, fetchPublishedEvents } from '@/lib/data';
import type { AppConfig, AppEvent } from '@/lib/types';
import { Mountain, Loader2, ArrowRight, Calendar } from 'lucide-react';
import { signOut } from 'firebase/auth';
import { auth } from '@/lib/firebase';
import Image from 'next/image';
import { AuthDialog } from '@/components/auth/auth-dialog';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';

export default function PortalPage() {
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [events, setEvents] = useState<AppEvent[]>([]);
  const [eventsLoading, setEventsLoading] = useState(false);
  const { user, loading: authLoading } = useAuth();

  const isLoading = authLoading || !config;

  useEffect(() => {
    console.log(`[Audit] PortalPage monté. Chargement de la config globale...`);
    
    fetchAppConfig(DEFAULT_EVENT_ID)
      .then(appConfig => {
        console.log(`[Audit] PortalPage a reçu la config:`, appConfig);
        console.log(`[Audit] Évaluation config.isLandingPageActive:`, appConfig.isLandingPageActive);
        
        setConfig(appConfig);
        
        // Si le portail est actif (pas de maintenance), on charge les événements
        if (!appConfig.isLandingPageActive) {
          console.log(`[Audit] Le portail est ACTIF. Chargement des événements publiés...`);
          setEventsLoading(true);
          fetchPublishedEvents()
            .then(data => {
                console.log(`[Audit] Événements reçus: ${data.length}`);
                setEvents(data);
            })
            .finally(() => setEventsLoading(false));
        } else {
            console.log(`[Audit] Le portail est en mode LANDING PAGE.`);
        }
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
  if (config.isLandingPageActive) {
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

            {eventsLoading ? (
              <div className="grid gap-6 sm:grid-cols-2">
                <div className="h-48 rounded-[2rem] bg-muted animate-pulse" />
                <div className="h-48 rounded-[2rem] bg-muted animate-pulse" />
              </div>
            ) : events.length > 0 ? (
              <div className="grid gap-8 sm:grid-cols-2">
                {events.map((event) => (
                  <Link key={event.id} href={`/${event.slug}/dashboard`} className="group">
                    <Card className="rounded-[2.5rem] overflow-hidden border-muted shadow-sm group-hover:shadow-2xl group-hover:-translate-y-1 transition-all duration-300">
                      <CardHeader className="bg-primary/5 p-8">
                         <div className="flex justify-between items-start mb-4">
                            <div className="p-3 rounded-2xl bg-white shadow-sm text-primary">
                               <Mountain className="h-6 w-6" />
                            </div>
                            <Button variant="ghost" size="icon" className="rounded-full bg-white/50 group-hover:bg-primary group-hover:text-white transition-colors shadow-sm">
                               <ArrowRight className="h-4 w-4" />
                            </Button>
                         </div>
                         <CardTitle className="text-2xl font-black line-clamp-1">{event.name}</CardTitle>
                         <CardDescription className="font-bold text-xs uppercase tracking-widest text-primary/60">
                           {event.slug}
                         </CardDescription>
                      </CardHeader>
                      <CardContent className="p-8 bg-white border-t">
                         <p className="text-sm text-muted-foreground font-medium leading-relaxed">
                            Accédez à la carte interactive, aux avis de la communauté et à toutes les informations pratiques de cet événement.
                         </p>
                      </CardContent>
                    </Card>
                  </Link>
                ))}
              </div>
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
