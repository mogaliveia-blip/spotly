'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/use-auth-user';
import { Loader2 } from 'lucide-react';

/**
 * Route /dashboard (Global)
 * Désormais utilisée uniquement comme point d'entrée pour redirection.
 * Le dashboard métier n'existe que dans le scope /[eventSlug]/dashboard.
 */
export default function DashboardRedirectPage() {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;

    // Redirection intelligente :
    // - Connecté : vers la gestion des événements
    // - Visiteur : vers la landing page
    if (user) {
      router.replace('/admin/events');
    } else {
      router.replace('/');
    }
  }, [user, loading, router]);

  return (
    <div className="flex h-screen w-full items-center justify-center bg-background">
      <div className="flex flex-col items-center gap-4">
        <Loader2 className="h-12 w-12 animate-spin text-primary opacity-20" />
        <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground animate-pulse">
          Redirection en cours...
        </p>
      </div>
    </div>
  );
}
