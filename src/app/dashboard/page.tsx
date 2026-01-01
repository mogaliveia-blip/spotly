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
    // We use router.replace to avoid adding to browser history
    router.replace(`${pathname}?${params.toString()}`);
  };

  return (
    <div className="h-full w-full relative">
      <POIMap 
        selectedPoiId={selectedPoiId} 
        onSelectPoi={handleSelectPoi}
      />
    </div>
  );
}

    