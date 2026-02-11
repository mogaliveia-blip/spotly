// src/app/pois/edit/[id]/page.tsx
'use client';

import { POIForm } from '@/components/poi/poi-form';
import { Button } from '@/components/ui/button';
import { ChevronLeft } from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { AppLayout } from '@/components/layout/app-layout';

export default function EditPOIPage() {
  const params = useParams();
  const id = params.id as string;

  return (
    <AppLayout>
      <div className="h-full overflow-y-auto p-4 sm:p-6 lg:p-8">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-3xl font-bold">Modifier le point d'intérêt</h1>
          <Button asChild variant="outline">
            <Link href="/pois">
              <ChevronLeft className="mr-2 h-4 w-4" />
              Retour à la liste
            </Link>
          </Button>
        </div>
        {id ? <POIForm poiId={id} /> : <p>Chargement...</p>}
      </div>
    </AppLayout>
  );
}
