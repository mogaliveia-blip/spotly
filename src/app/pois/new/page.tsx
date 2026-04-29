// src/app/pois/new/page.tsx
import { POIForm } from '@/components/poi/poi-form';
import { Button } from '@/components/ui/button';
import { ChevronLeft } from 'lucide-react';
import Link from 'next/link';
import { AppLayout } from '@/components/layout/app-layout';
import { DEFAULT_EVENT_ID } from '@/lib/data';

export default function NewPOIPage() {
  return (
    <AppLayout>
      <div className="h-full overflow-y-auto p-4 sm:p-6 lg:p-8">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-3xl font-bold">Créer un nouveau point d'intérêt</h1>
          <Button asChild variant="outline">
            <Link href="/pois">
              <ChevronLeft className="mr-2 h-4 w-4" />
              Retour à la liste
            </Link>
          </Button>
        </div>
        {/* ✅ Explicitly set to global scope */}
        <POIForm eventId={DEFAULT_EVENT_ID} />
      </div>
    </AppLayout>
  );
}
