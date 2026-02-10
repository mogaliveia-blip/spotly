// src/app/page.tsx
'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/hooks/use-auth-user';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { AuthDialog } from '@/components/auth/auth-dialog';
import { fetchAppConfig } from '@/lib/data';
import type { AppConfig } from '@/lib/types';
import { Mountain, Users, LogIn, LogOut } from 'lucide-react';
import Image from 'next/image';
import { signOut } from 'firebase/auth';
import { auth } from '@/lib/firebase';

export default function LandingPage() {
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [internalAccessClicked, setInternalAccessClicked] = useState(false);
  const { role, loading: authLoading, user } = useAuth();
  const router = useRouter();

  useEffect(() => {
    async function getConfig() {
      try {
        const appConfig = await fetchAppConfig();
        setConfig(appConfig);
      } catch (e) {
        console.error("Could not fetch app config", e);
        // Default to landing page being active if config fails
        setConfig({ isLandingPageActive: true });
      }
    }
    getConfig();
  }, []);

  const canAccessInternally = role === 'admin' || role === 'editor';

  const handleEnterApp = () => {
    router.push('/dashboard');
  };
  
  const handleSignOut = async () => {
    await signOut(auth);
    router.refresh();
  };

  const isLoading = authLoading || !config;

  if (isLoading) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-background">
        <Mountain className="h-12 w-12 animate-pulse text-primary" />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="sticky top-0 z-20 flex h-16 items-center justify-between border-b bg-background/80 px-4 backdrop-blur-sm md:px-6">
        <div className="flex items-center gap-2">
          <Mountain className="h-6 w-6 text-primary" />
          <span className="text-lg font-semibold">Leu Tempo</span>
        </div>
        <div className="flex items-center gap-2">
          {user ? (
            // --- UTILISATEUR CONNECTÉ ---
            <>
              {/* Bouton "Accès interne" pour admin/editor quand la landing page est active */}
              {config.isLandingPageActive && canAccessInternally && (
                <Button variant="outline" size="sm" onClick={() => setInternalAccessClicked(true)}>
                  <Users className="mr-2 h-4 w-4" />
                  Accès interne
                </Button>
              )}
              
              {/* Bouton "Se déconnecter" pour tous les utilisateurs connectés */}
              <Button variant="outline" size="sm" onClick={handleSignOut}>
                <LogOut className="mr-2 h-4 w-4" />
                Se déconnecter
              </Button>
            </>
          ) : (
            // --- UTILISATEUR DÉCONNECTÉ ---
            <>
              {/* Bouton "Se connecter" uniquement si la landing page est inactive */}
              {!config.isLandingPageActive && (
                <AuthDialog trigger={<Button>Se connecter</Button>} />
              )}
            </>
          )}
        </div>
      </header>

      <main className="flex-1">
        <section className="relative h-[60vh] w-full lg:h-[70vh]">
          <Image
            src="https://picsum.photos/seed/festival/1920/1080"
            alt="Festival de nuit"
            fill
            className="object-cover"
            priority
            data-ai-hint="festival night"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-background via-background/50 to-transparent" />
          <div className="relative z-10 flex h-full flex-col items-center justify-center text-center p-4">
             <div className="bg-black/50 p-6 rounded-lg backdrop-blur-sm shadow-xl">
                <h1 className="text-4xl font-bold tracking-tight sm:text-5xl md:text-6xl text-primary-foreground">
                    Leu Tempo Festival
                </h1>
                <p className="mt-4 max-w-2xl text-lg text-primary-foreground/90">
                    Bientôt disponible. L'application officielle pour ne rien manquer de l'événement.
                </p>

                {config.isLandingPageActive && canAccessInternally && internalAccessClicked && (
                    <div className="mt-8 animate-in fade-in zoom-in-95 duration-500">
                        <Button size="lg" onClick={handleEnterApp}>
                            <LogIn className="mr-2 h-5 w-5" />
                            Entrer dans l'application
                        </Button>
                    </div>
                )}
                 {!config.isLandingPageActive && !user && (
                    <div className="mt-8">
                       <AuthDialog trigger={<Button size="lg">Accéder à l'application</Button>} />
                    </div>
                 )}
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

       <footer className="py-6 text-center text-sm text-muted-foreground border-t">
          © {new Date().getFullYear()} Leu Tempo Festival. Tous droits réservés.
        </footer>
    </div>
  );
}
