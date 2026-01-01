import { fetchPoiById, fetchReviewsByPoiId } from '@/lib/data';
import { notFound } from 'next/navigation';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { ChevronLeft } from 'lucide-react';
import { POIDetailHeader } from '@/components/poi/poi-detail-header';
import { POIGallery } from '@/components/poi/poi-gallery';
import { POIReviews } from '@/components/poi/poi-reviews';
import { AppLayout } from '@/components/layout/app-layout';

export default async function PoiDetailPage({ params }: { params: { id: string } }) {
  const poi = await fetchPoiById(params.id);
  
  if (!poi) {
    notFound();
  }
  
  // fetchReviewsByPoiId is called within POIReviews now to make it a client component
  const reviews = await fetchReviewsByPoiId(params.id);

  return (
    <AppLayout>
      <div className="space-y-8">
        <div className="flex items-center justify-between">
            <h1 className="text-3xl font-bold tracking-tight">{poi.title}</h1>
            <Button asChild variant="outline">
            <Link href="/dashboard">
                <ChevronLeft className="mr-2 h-4 w-4" />
                Retour au tableau de bord
            </Link>
            </Button>
        </div>

        <POIDetailHeader poi={poi} />

        <POIGallery poi={poi} />

        <POIReviews poiId={poi.id} initialReviews={reviews} />
      </div>
    </AppLayout>
  );
}
