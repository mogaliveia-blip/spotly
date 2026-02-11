'use client';

import { POIMap } from '@/components/poi/poi-map';
import type { POI } from '@/lib/types';
import { useSearchParams, useRouter, usePathname } from 'next/navigation';
import { useSidebar } from '@/components/ui/sidebar';
import { useEffect, useState, useMemo } from 'react';
import { fetchPois } from '@/lib/data';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/use-auth-user';

export default function DashboardPage() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { setOpen } = useSidebar();
  const { toast } = useToast();
  const { user } = useAuth();
  
  const [pois, setPois] = useState<POI[]>([]);
  const selectedPoiId = searchParams.get('poi');
  const categoryFilter = searchParams.get('category') || 'all';
  
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

  const visiblePois = useMemo(() => {
    const filtered = pois.filter(p => categoryFilter === 'all' || p.mainCategory === categoryFilter);
    if(user) {
        return filtered;
    }
    // For non-logged in users, we show a limited number of POIs.
    // Also ensures the selected POI remains visible if it's outside the limited slice.
    const limitedPois = filtered.slice(0, 2);
    if (selectedPoiId) {
      const selectedPoi = pois.find(p => p.id === selectedPoiId);
      if (selectedPoi && !limitedPois.some(p => p.id === selectedPoiId)) {
        limitedPois.push(selectedPoi);
      }
    }
    return limitedPois;
  }, [pois, categoryFilter, user, selectedPoiId]);

  return (
    <div className="h-full w-full relative">
      <POIMap 
        selectedPoiId={selectedPoiId} 
        onSelectPoi={handleSelectPoi}
        pois={visiblePois}
      />
    </div>
  );
}
