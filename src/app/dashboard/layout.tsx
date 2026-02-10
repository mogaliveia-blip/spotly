'use client';

import { AppLayout } from "@/components/layout/app-layout";
import { useAuth } from '@/hooks/use-auth-user';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { fetchAppConfig } from '@/lib/data';
import type { AppConfig } from '@/lib/types';
import { Mountain } from 'lucide-react';
import { VerifyEmailPage } from '@/components/auth/verify-email-page';

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { role, user, loading: authLoading } = useAuth();
  const router = useRouter();
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [configLoading, setConfigLoading] = useState(true);

  useEffect(() => {
    fetchAppConfig().then(appConfig => {
      setConfig(appConfig);
      setConfigLoading(false);
    }).catch(() => {
      // En cas d'erreur, on suppose que la page d'accueil est désactivée pour ne pas bloquer l'accès.
      setConfig({ isLandingPageActive: false });
      setConfigLoading(false);
    });
  }, []);
  
  const isLoading = authLoading || configLoading;

  useEffect(() => {
    if (isLoading) {
      return; // Attendre que l'authentification et la configuration soient chargées
    }

    // Règle n°1 : Les rôles privilégiés (admin, editor) ont toujours accès.
    if (role === 'admin' || role === 'editor') {
      return; // Accès autorisé
    }
    
    // Règle n°2 : Les utilisateurs non authentifiés sont toujours redirigés vers l'accueil.
    if (!user) {
        router.replace('/');
        return;
    }
    
    // Règle n°3 : L'accès pour le rôle standard 'user' dépend de l'état de la landing page.
    if (role === 'user') {
        if (config?.isLandingPageActive) {
            // La landing page est active, on bloque les utilisateurs standards.
            router.replace('/');
        }
        // Si la landing page est désactivée, l'accès est autorisé en ne faisant rien.
    }

  }, [role, user, config, isLoading, router]);


  if (isLoading) {
    return (
       <div className="flex h-screen w-full items-center justify-center bg-background">
        <Mountain className="h-12 w-12 animate-pulse text-primary" />
      </div>
    );
  }

  // Le portail de vérification d'e-mail doit se situer après le chargement.
  if (user && !user.emailVerified) {
    return <VerifyEmailPage />;
  }

  // On détermine si l'utilisateur actuel doit être bloqué après toutes les vérifications.
  // C'est une sécurité finale pour éviter l'affichage de contenu avant une redirection.
  const isBlocked = 
    !user || 
    (role === 'user' && config?.isLandingPageActive);

  if (isBlocked) {
    // Le useEffect a déjà dû déclencher la redirection.
    // Ceci affiche une icône de chargement pendant que la redirection s'effectue.
    return (
       <div className="flex h-screen w-full items-center justify-center bg-background">
        <Mountain className="h-12 w-12 animate-pulse text-primary" />
      </div>
    );
  }

  return <AppLayout>{children}</AppLayout>;
}
