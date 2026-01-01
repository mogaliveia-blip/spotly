'use client';

import { POIMap } from '@/components/poi/poi-map';
import type { POI } from '@/lib/types';
import { useSearchParams, useRouter, usePathname } from 'next/navigation';
import { useSidebar } from '@/components/ui/sidebar';
import { useEffect, useState } from 'react';
import { POIDetailModal } from '@/components/poi/poi-detail-modal';


export default function DashboardPage() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const selectedPoiId = searchParams.get('poi');
  const { setOpen } = useSidebar();
  
  // State to control the modal
  const [isModalOpen, setIsModalOpen] = useState(!!selectedPoiId);

  // Open sidebar on dashboard by default on desktop
  useEffect(() => {
    if (typeof window !== 'undefined' && window.innerWidth >= 768) {
      setOpen(true);
    }
  }, [setOpen]);

  // Sync modal state with URL param
  useEffect(() => {
    setIsModalOpen(!!selectedPoiId);
  }, [selectedPoiId]);

  const handleSelectPoi = (poi: POI | null) => {
    const params = new URLSearchParams(searchParams.toString());
    if (poi) {
      params.set('poi', poi.id);
    } else {
      params.delete('poi');
    }
    router.push(`${pathname}?${params.toString()}`);
  };

  const handleModalClose = () => {
    const params = new URLSearchParams(searchParams.toString());
    params.delete('poi');
    router.push(`${pathname}?${params.toString()}`);
  };

  return (
    <div className="h-full w-full relative">
      <POIMap selectedPoiId={selectedPoiId} onSelectPoi={handleSelectPoi} />
      {selectedPoiId && isModalOpen && (
         <POIDetailModal poiId={selectedPoiId} onClose={handleModalClose} />
      )}
    </div>
  );
}
