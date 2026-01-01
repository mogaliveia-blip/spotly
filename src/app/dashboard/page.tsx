'use client';

import { POIMap } from '@/components/poi/poi-map';
import type { POI } from '@/lib/types';
import { useSearchParams, useRouter, usePathname } from 'next/navigation';
import { useSidebar } from '@/components/ui/sidebar';
import { useEffect } from 'react';

export default function DashboardPage() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const selectedPoiId = searchParams.get('poi');
  const { setOpen } = useSidebar();

  // Open sidebar on dashboard by default on desktop
  useEffect(() => {
    // This check is to avoid hydration errors, as useSidebar relies on window.
    if (typeof window !== 'undefined' && window.innerWidth >= 768) {
        setOpen(true);
    }
  }, [setOpen]);


  const handleSelectPoi = (poi: POI | null) => {
    const params = new URLSearchParams(searchParams.toString());
    if (poi) {
      params.set('poi', poi.id);
    } else {
      params.delete('poi');
    }
    // Use router.push to ensure the URL updates and triggers re-renders
    router.push(`${pathname}?${params.toString()}`);
  };

  const handleModalClose = () => {
    handleSelectPoi(null);
  }

  return (
    <div className="h-full w-full">
      <POIMap selectedPoiId={selectedPoiId} onSelectPoi={handleSelectPoi} />
    </div>
  );
}
