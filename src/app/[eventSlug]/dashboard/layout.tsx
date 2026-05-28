'use client';

import { AppLayout } from "@/components/layout/app-layout";
import { useAuth } from '@/hooks/use-auth-user';
import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { fetchAppConfig } from '@/lib/data';
import type { AppConfig } from '@/lib/types';
import { Mountain, Clock, Calendar } from 'lucide-react';
import { useEvent } from '@/providers/event-provider';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import Link from 'next/link';

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { role, loading: authLoading } = useAuth();
  const { eventId, event, loading: eventLoading, userRole } = useEvent();
  const params = useParams();
  const eventSlug = params.eventSlug as string;
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

  if (isLoading) {
    return (
       <div className="flex h-screen w-full items-center justify-center bg-background">
        <Mountain className="h-12 w-12 animate-pulse text-primary" />
      </div>
    );
  }

  if (eventSlug && !event) {
    return (
      <div className="flex min-h-screen flex-col bg-background p-4 items-center justify-center">
        <Card className="w-full max-w-md border-muted shadow-2xl rounded-[2.5rem] overflow-hidden">
          <CardHeader className="text-center bg-primary/5 pb-8 pt-10">
            <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-white shadow-xl mb-6">
              <Calendar className="h-10 w-10 text-primary" />
            </div>
            <CardTitle className="text-3xl font-black tracking-tight">Événement indisponible</CardTitle>
            <CardDescription className="text-base mt-2 px-6">
              Cet événement n'est pas publié ou n'est pas accessible avec votre compte.
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-8 pb-10">
            <Button asChild variant="outline" className="w-full rounded-xl h-12 font-bold">
              <Link href="/">Retour au portail</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Si Landing Page active : seuls les membres de l'équipe (admin/editor) peuvent voir le dashboard
  const isStaff = role === 'owner' || userRole === 'admin' || userRole === 'editor';
  const isBlockedByLanding = event?.status !== 'published' && config?.isLandingPageActive && !isStaff;

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
