'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/hooks/use-auth-user';
import { fetchUserEvents } from '@/lib/data';
import type { AppEvent } from '@/lib/types';
import { AppLayout } from '@/components/layout/app-layout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Calendar, ChevronRight, LayoutDashboard, Settings } from 'lucide-react';
import Link from 'next/link';
import { CreateEventDialog } from '@/components/admin/create-event-dialog';
import { cn } from '@/lib/utils';

export default function MyEventsPage() {
  const { user, loading: authLoading } = useAuth();
  const [events, setEvents] = useState<AppEvent[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (user) {
      fetchUserEvents(user.uid)
        .then(setEvents)
        .finally(() => setLoading(false));
    } else if (!authLoading) {
      setLoading(false);
    }
  }, [user, authLoading]);

  if (authLoading || loading) {
    return (
      <AppLayout>
        <div className="p-6 space-y-6">
          <Skeleton className="h-10 w-48" />
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
             <Skeleton className="h-48 w-full rounded-2xl" />
             <Skeleton className="h-48 w-full rounded-2xl" />
             <Skeleton className="h-48 w-full rounded-2xl" />
          </div>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="h-full overflow-y-auto p-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Mes Événements</h1>
            <p className="text-muted-foreground">Gérez vos différents festivals et rassemblements.</p>
          </div>
          <CreateEventDialog />
        </div>

        {events.length === 0 ? (
          <Card className="flex flex-col items-center justify-center p-12 text-center border-dashed rounded-[2rem] bg-muted/10">
            <div className="p-4 rounded-full bg-primary/10 mb-4">
               <Calendar className="h-12 w-12 text-primary opacity-50" />
            </div>
            <CardTitle className="text-2xl">Aucun événement trouvé</CardTitle>
            <CardDescription className="mt-2 max-w-sm">
              Vous n'avez pas encore créé d'événement. Commencez par en créer un pour organiser vos points d'intérêt.
            </CardDescription>
            <div className="mt-8">
              <CreateEventDialog />
            </div>
          </Card>
        ) : (
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {events.map((e) => (
              <Card key={e.id} className="group hover:shadow-xl transition-all overflow-hidden border-muted rounded-[2rem]">
                <CardHeader className="bg-muted/30 pb-6">
                  <div className="flex items-center justify-between">
                     <CardTitle className="text-xl font-bold">{e.name}</CardTitle>
                     <span className={cn(
                        "text-[10px] uppercase font-bold px-2 py-0.5 rounded-full",
                        e.status === 'published' ? "bg-green-500/10 text-green-600" : "bg-primary/10 text-primary"
                     )}>
                        {e.status === 'published' ? 'Publié' : 'Brouillon'}
                     </span>
                  </div>
                  <CardDescription className="font-mono text-xs opacity-60">/{e.slug}</CardDescription>
                </CardHeader>
                <CardContent className="pt-6 space-y-4">
                  <div className="flex gap-2">
                    <Button variant="default" size="sm" asChild className="flex-1 rounded-xl h-12 gap-2 font-bold shadow-md">
                       <Link href={`/${e.slug}/dashboard`}>
                          <LayoutDashboard className="h-4 w-4" />
                          Dashboard
                       </Link>
                    </Button>
                    <Button variant="secondary" size="icon" asChild className="rounded-xl h-12 w-12 shrink-0">
                       <Link href={`/${e.slug}/admin`}>
                          <Settings className="h-4 w-4" />
                       </Link>
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </AppLayout>
  );
}