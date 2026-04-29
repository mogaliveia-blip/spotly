'use client';

import { POIForm } from '@/components/poi/poi-form';
import { Button } from '@/components/ui/button';
import { ChevronLeft, Loader2, AlertCircle } from 'lucide-react';
import Link from 'next/link';
import { AppLayout } from '@/components/layout/app-layout';
import { useParams } from 'next/navigation';
import { useEvent } from '@/providers/event-provider';

export default function NewPOIPage() {
  const params = useParams();
  const { eventId, loading: eventLoading } = useEvent();
  const eventSlug = params.eventSlug as string;
  const prefix = eventSlug ? `/${eventSlug}` : '';

  if (eventLoading) {
    return (
      <AppLayout>
        <div className="flex h-full w-full items-center justify-center p-12">
          <Loader2 className="h-8 w-8 animate-spin text-primary opacity-50" />
        </div>
      </AppLayout>
    );
  }

  // ✅ Cas où l'événement n'a pas été trouvé (slug invalide)
  if (eventId === 'default-event' && eventSlug) {
    return (
      <AppLayout>
        <div className="h-full flex items-center justify-center p-6">
          <div className="max-w-md w-full bg-destructive/5 border-2 border-destructive/20 rounded-[2rem] p-8 text-center space-y-6">
             <div className="mx-auto h-16 w-16 bg-destructive/10 rounded-full flex items-center justify-center">
                <AlertCircle className="h-8 w-8 text-destructive" />
             </div>
             <div>
                <h1 className="text-2xl font-bold text-destructive">Événement introuvable</h1>
                <p className="text-muted-foreground mt-2">
                  L'identifiant "<strong>{eventSlug}</strong>" ne correspond à aucun événement actif.
                </p>
             </div>
             <Button asChild variant="outline" className="rounded-xl w-full">
                <Link href="/admin/events">Retour à mes événements</Link>
             </Button>
          </div>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="h-full overflow-y-auto p-4 sm:p-6 lg:p-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-3xl font-bold">Nouveau POI</h1>
            <p className="text-muted-foreground text-sm">Ajoutez un lieu à l'événement : <span className="font-bold">{eventSlug}</span></p>
          </div>
          <Button asChild variant="outline" className="rounded-xl">
            <Link href={`${prefix}/pois`}>
              <ChevronLeft className="mr-2 h-4 w-4" />
              Annuler
            </Link>
          </Button>
        </div>
        <POIForm eventId={eventId} eventSlug={eventSlug} />
      </div>
    </AppLayout>
  );
}
