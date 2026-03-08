'use client';

import * as React from 'react';
import { POIForm } from '@/components/poi/poi-form';
import { Button } from '@/components/ui/button';
import { ChevronLeft } from 'lucide-react';
import Link from 'next/link';
import { AppLayout } from '@/components/layout/app-layout';

/**
 * Page d'édition d'un point d'intérêt.
 * Utilise React.use() pour désenvelopper les params conformément à Next.js 15.
 */
export default function EditPOIPage({ 
  params 
}: { 
  params: Promise<{ id: string }> 
}) {
  // Désenveloppement synchrone du paramètre de route 'id'
  const resolvedParams = React.use(params);
  const id = resolvedParams.id;

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
        
        {id ? (
          <POIForm poiId={id} />
        ) : (
          <div className="flex items-center justify-center p-12">
            <p className="text-muted-foreground">Préparation de l'éditeur...</p>
          </div>
        )}
      </div>
    </AppLayout>
  );
}
