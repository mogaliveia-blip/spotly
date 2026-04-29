'use client';

import * as React from 'react';
import { POIForm } from '@/components/poi/poi-form';
import { Button } from '@/components/ui/button';
import { ChevronLeft, Loader2 } from 'lucide-react';
import Link from 'next/link';
import { AppLayout } from '@/components/layout/app-layout';
import { useParams } from 'next/navigation';
import { useEvent } from '@/providers/event-provider';

export default function EditPOIPage({ 
  params: routeParams 
}: { 
  params: Promise<{ id: string }> 
}) {
  const resolvedParams = React.use(routeParams);
  const id = resolvedParams.id;
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
            <h1 className="text-3xl font-bold">Modifier le POI</h1>
            <p className="text-muted-foreground text-sm">Édition dans l'événement : <span className="font-bold">{eventSlug}</span></p>
          </div>
          <Button asChild variant="outline" className="rounded-xl">
            <Link href={`${prefix}/pois`}>
              <ChevronLeft className="mr-2 h-4 w-4" />
              Retour
            </Link>
          </Button>
        </div>
        
        {id ? (
          <POIForm poiId={id} eventId={eventId} eventSlug={eventSlug} />
        ) : (
          <div className="flex items-center justify-center p-12">
            <p className="text-muted-foreground animate-pulse">Chargement de l'éditeur...</p>
          </div>
        )}
      </div>
    </AppLayout>
  );
}
