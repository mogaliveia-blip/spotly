'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/hooks/use-auth-user';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { fetchAppConfig } from '@/lib/data';
import type { AppConfig } from '@/lib/types';
import { Mountain } from 'lucide-react';
import { signOut } from 'firebase/auth';
import { auth } from '@/lib/firebase';
import Image from 'next/image';
import { AuthDialog } from '@/components/auth/auth-dialog';

export default function LandingPage() {
  const [config, setConfig] = useState<AppConfig | null>(null);
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();

  const isLoading = authLoading || !config;

  useEffect(() => {
    fetchAppConfig()
      .then(appConfig => {
        if (appConfig.isLandingPageActive) {
          setConfig(appConfig);
        } else {
          router.replace('/dashboard');
        }
      })
      .catch(e => {
        console.error("Could not fetch app config", e);
        // If config fails to load, redirect to dashboard to avoid blocking access.
        router.replace('/dashboard');
      });
  }, [router]);

  const handleSignOut = async () => {
    await signOut(auth);
    // After sign-out, we want to ensure the page reflects the signed-out state.
    // A page refresh is a robust way to do this without complex state management.
    router.refresh();
  };

  if (isLoading) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-background">
        <Mountain className="h-12 w-12 animate-pulse text-primary" />
      </div>
    );
  }
  
  // If we reach here, it means we are definitely on the landing page because config.isLandingPageActive is true.
  // The redirection logic in useEffect handles the other case.
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="sticky top-0 z-20 flex h-16 items-center justify-between border-b bg-background/80 px-4 backdrop-blur-sm md:px-6">
        <div className="flex items-center gap-2">
          <Mountain className="h-6 w-6 text-primary" />
          <span className="text-lg font-semibold">Spotly</span>
        </div>
         {user && (
            <div className="flex items-center gap-2">
                {(user.role === 'admin' || user.role === 'editor') && (
                     <Button variant="outline" size="sm" asChild>
                        <a href="/dashboard">Entrer dans l'application</a>
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
                    Spotly
                </h1>
                <p className="mt-4 max-w-2xl text-lg text-primary-foreground/90">
                    Bientôt disponible. L'application officielle pour ne rien manquer de l'événement.
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

       <footer className="py-6 border-t">
          <div className="container mx-auto text-center text-sm text-muted-foreground">
            <p>© {new Date().getFullYear()} Spotly. Tous droits réservés.</p>
            {!user && (
                 <div className="mt-2">
                    <AuthDialog 
                        trigger={
                            <Button variant="link" size="sm" className="text-xs text-muted-foreground/80 hover:text-muted-foreground">
                                Espace organisateur
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
