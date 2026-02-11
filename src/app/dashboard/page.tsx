'use client';

import { POIMap } from '@/components/poi/poi-map';
import type { POI, MainCategory } from '@/lib/types';
import { useSearchParams, useRouter, usePathname } from 'next/navigation';
import { useSidebar } from '@/components/ui/sidebar';
import { useEffect, useState, useMemo } from 'react';
import { fetchPois } from '@/lib/data';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/use-auth-user';
import { CategoryFilter } from '@/components/poi/category-filter';

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
    router.replace(`${pathname}?${params.toString()}`);
  };

  const handleCategorySelect = (category: MainCategory | 'all') => {
    const params = new URLSearchParams(searchParams.toString());
    if (category === 'all') {
      params.delete('category');
    } else {
      params.set('category', category);
    }
    params.delete('poi');
    router.replace(`${pathname}?${params.toString()}`);
  }

  const visiblePois = useMemo(() => {
    const filtered = pois.filter(p => categoryFilter === 'all' || p.mainCategory === categoryFilter);
    if(user) {
        return filtered;
    }
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
    <div className="h-full w-full flex flex-col">
      <div className="border-b bg-background z-10">
        <CategoryFilter 
          selectedCategory={categoryFilter as MainCategory | 'all'}
          onSelectCategory={handleCategorySelect}
        />
      </div>
      <div className="flex-1 relative overflow-hidden">
        <POIMap 
          selectedPoiId={selectedPoiId} 
          onSelectPoi={handleSelectPoi}
          pois={visiblePois}
        />
      </div>
    </div>
  );
}
