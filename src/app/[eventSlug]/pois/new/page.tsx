'use client';

import { POIForm } from '@/components/poi/poi-form';
import { Button } from '@/components/ui/button';
import { ChevronLeft, Loader2 } from 'lucide-react';
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
