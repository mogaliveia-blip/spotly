'use client';

import { useAuth } from '@/hooks/use-auth-user';
import { Mountain } from 'lucide-react';

/**
 * Layout pour la route globale /dashboard.
 * Simplifié pour ne gérer que l'état de chargement initial avant la redirection.
 */
export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { loading: authLoading } = useAuth();
  
  if (authLoading) {
    return (
       <div className="flex h-screen w-full items-center justify-center bg-background">
        <Mountain className="h-12 w-12 animate-pulse text-primary" />
      </div>
    );
  }

  return <>{children}</>;
}
