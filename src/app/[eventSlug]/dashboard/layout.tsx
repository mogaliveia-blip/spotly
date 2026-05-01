'use client';

import { AppLayout } from "@/components/layout/app-layout";
import { useAuth } from '@/hooks/use-auth-user';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { fetchAppConfig } from '@/lib/data';
import type { AppConfig } from '@/lib/types';
import { Mountain, Loader2, Clock, Calendar } from 'lucide-react';
import { VerifyEmailPage } from '@/components/auth/verify-email-page';
import { useEvent } from '@/providers/event-provider';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import Link from 'next/link';

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { role, user, loading: authLoading, isApproved } = useAuth();
  const { eventId, event, loading: eventLoading } = useEvent();
  const router = useRouter();
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [configLoading, setConfigLoading] = useState(true);

  useEffect(() => {
    if (eventLoading) {
        setConfigLoading(true);
        return;
    }

    fetchAppConfig(eventId).then(appConfig => {
      setConfig(appConfig);
      setConfigLoading(false);
    }).catch(() => {
      setConfig({ isLandingPageActive: false });
      setConfigLoading(false);
    });
  }, [eventId, eventLoading]);
  
  const isLoading = authLoading || configLoading || eventLoading;

  useEffect(() => {
    if (isLoading) return;

    // Blocage si non approuvé (pour les comptes connectés)
    if (user && !isApproved) {
        router.replace('/access-pending');
        return;
    }
  }, [isLoading, router, user, isApproved]);


  if (isLoading) {
    return (
       <div className="flex h-screen w-full items-center justify-center bg-background">
        <Mountain className="h-12 w-12 animate-pulse text-primary" />
      </div>
    );
  }

  // Redirection si non approuvé
  if (user && !isApproved) {
     return null; 
  }

  if (user && !user.emailVerified) {
    return <VerifyEmailPage />;
  }

  // Si Landing Page active : seuls les membres de l'équipe (admin/editor) peuvent voir le dashboard
  const isStaff = role === 'admin' || role === 'editor' || role === 'owner';
  const isBlockedByLanding = config?.isLandingPageActive && !isStaff;

  if (isBlockedByLanding) {
    return (
      <div className="flex min-h-screen flex-col bg-background p-4 items-center justify-center">
         <Card className="w-full max-w-md border-muted shadow-2xl rounded-[2.5rem] overflow-hidden">
            <CardHeader className="text-center bg-primary/5 pb-8 pt-10">
                <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-white shadow-xl mb-6">
                    <Calendar className="h-10 w-10 text-primary" />
                </div>
                <CardTitle className="text-3xl font-black tracking-tight">C'est pour bientôt !</CardTitle>
                <CardDescription className="text-base mt-2 px-6">
                    L'espace <strong>{event?.name || 'événement'}</strong> prépare son ouverture.
                </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6 pt-8 pb-10">
                <div className="flex items-center gap-4 p-4 rounded-2xl bg-muted/30 border border-dashed border-muted-foreground/20">
                    <Clock className="h-5 w-5 text-muted-foreground shrink-0" />
                    <p className="text-sm text-muted-foreground leading-relaxed">
                        Cet événement est actuellement en mode préparation. Revenez très prochainement pour découvrir la carte et le programme !
                    </p>
                </div>

                <div className="pt-2">
                    <Button asChild variant="outline" className="w-full rounded-xl h-12 font-bold">
                        <Link href="/">Retour au portail</Link>
                    </Button>
                </div>
            </CardContent>
         </Card>
      </div>
    );
  }

  return <AppLayout>{children}</AppLayout>;
}
