'use client';

import { POIMap } from '@/components/poi/poi-map';
import type { POI } from '@/lib/types';
import { useSearchParams, useRouter, usePathname } from 'next/navigation';
import { useSidebar } from '@/components/ui/sidebar';
import { useEffect, useState } from 'react';
import { fetchPois } from '@/lib/data';
import { useToast } from '@/hooks/use-toast';

export default function DashboardPage() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { setOpen } = useSidebar();
  const { toast } = useToast();
  
  const [pois, setPois] = useState<POI[]>([]);
  const selectedPoiId = searchParams.get('poi');
  
  // Fetch POIs on component mount
  useEffect(() => {
    async function getPois() {
      try {
        const poiData = await fetchPois();
        setPois(poiData);
      } catch (error) {
        console.error("Impossible de récupérer les POIs", error);
        toast({
          title: "Erreur",
          description: "Impossible de charger les points d'intérêt.",
          variant: "destructive",
        });
      }
    }
    getPois();
  }, [toast]);

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
        pois={pois}
        setPois={setPois}
      />
    </div>
  );
}
