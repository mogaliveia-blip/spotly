'use client';

import { POIForm } from '@/components/poi/poi-form';
import { Button } from '@/components/ui/button';
import { ChevronLeft } from 'lucide-react';
import Link from 'next/link';
import { AppLayout } from '@/components/layout/app-layout';
import { useParams } from 'next/navigation';

export default function NewPOIPage() {
  const params = useParams();
  const eventSlug = params.eventSlug as string;
  const prefix = eventSlug ? `/${eventSlug}` : '';

  return (
    <AppLayout>
      <div className="h-full overflow-y-auto p-4 sm:p-6 lg:p-8">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-3xl font-bold">Nouveau POI</h1>
          <Button asChild variant="outline" className="rounded-xl">
            <Link href={`${prefix}/pois`}>
              <ChevronLeft className="mr-2 h-4 w-4" />
              Retour à la liste
            </Link>
          </Button>
        </div>
        <POIForm />
      </div>
    </AppLayout>
  );
}
