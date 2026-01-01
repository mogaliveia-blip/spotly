'use client';

import { POIMap } from '@/components/poi/poi-map';
import { POIList } from '@/components/poi/poi-list';
import { POIDetailModal } from '@/components/poi/poi-detail-modal';
import type { POI } from '@/lib/types';
import { useSearchParams, useRouter } from 'next/navigation';

export default function DashboardPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const selectedPoiId = searchParams.get('poi');

  const handleSelectPoi = (poi: POI | null) => {
    const params = new URLSearchParams(searchParams);
    if (poi) {
      params.set('poi', poi.id);
    } else {
      params.delete('poi');
    }
    router.replace(`?${params.toString()}`);
  };

  const handleModalClose = () => {
    handleSelectPoi(null);
  }

  return (
    <div className="flex h-[calc(100vh-theme(height.16))] w-full">
      <POIList onSelectPoi={handleSelectPoi} selectedPoiId={selectedPoiId} />
      <div className="flex-1 h-full relative">
        <POIMap selectedPoiId={selectedPoiId} onSelectPoi={handleSelectPoi} />
      </div>
      {selectedPoiId && <POIDetailModal poiId={selectedPoiId} onClose={handleModalClose} />}
    </div>
  );
}
