// src/app/dashboard/page.tsx
'use client';

import { POIMap } from '@/components/poi/poi-map';
import type { POI, MainCategory, MarketingConfig } from '@/lib/types';
import { useSearchParams, useRouter, usePathname } from 'next/navigation';
import { useSidebar } from '@/components/ui/sidebar';
import { useEffect, useState, useMemo } from 'react';
import { fetchPois, fetchMarketingConfig } from '@/lib/data';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/use-auth-user';
import { CategoryFilter } from '@/components/poi/category-filter';
import { HeroOverlay } from '@/components/marketing/hero-overlay';
import { isSponsorActive } from '@/lib/sponsor-utils';

export default function DashboardPage() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { setOpen } = useSidebar();
  const { toast } = useToast();
  const { user } = useAuth();
  
  const [pois, setPois] = useState<POI[]>([]);
  const [marketingConfig, setMarketingConfig] = useState<MarketingConfig | null>(null);
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
    async function getMarketingConfig() {
        try {
            const config = await fetchMarketingConfig();
            setMarketingConfig(config);
        } catch (error) {
            console.error("Impossible de charger la configuration marketing", error);
        }
    }

    getPois();
    getMarketingConfig();
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
    // 1. Filter by category
    const filteredByCategory = pois.filter(p => categoryFilter === 'all' || p.mainCategory === categoryFilter);

    // 2. Separate active sponsors from other POIs
    const activeSponsors: POI[] = [];
    const otherPois: POI[] = [];
    
    for (const poi of filteredByCategory) {
      if (isSponsorActive(poi)) {
        activeSponsors.push(poi);
      } else {
        otherPois.push(poi);
      }
    }
    
    // 3. Sort active sponsors by priority (descending)
    activeSponsors.sort((a, b) => (b.sponsor?.priority ?? 0) - (a.sponsor?.priority ?? 0));
    
    // 4. Concatenate the lists
    const sortedPois = [...activeSponsors, ...otherPois];

    // 5. Apply "freemium" logic for visitors
    if (user) {
        return sortedPois;
    }
    
    const limitedPois = sortedPois.slice(0, 2);
    if (selectedPoiId) {
      const selectedPoi = pois.find(p => p.id === selectedPoiId);
      if (selectedPoi && !limitedPois.some(p => p.id === selectedPoiId)) {
        limitedPois.push(selectedPoi);
      }
    }
    return limitedPois;
  }, [pois, categoryFilter, user, selectedPoiId]);

  const showHero = !user && marketingConfig?.heroEnabled;

  return (
    <div className="flex flex-col h-full w-full">
        <CategoryFilter 
          selectedCategory={categoryFilter as MainCategory | 'all'}
          onSelectCategory={handleCategorySelect}
        />
      <div className="flex-1 relative overflow-hidden">
        {showHero && marketingConfig && <HeroOverlay config={marketingConfig} />}
        <POIMap 
          selectedPoiId={selectedPoiId} 
          onSelectPoi={handleSelectPoi}
          pois={visiblePois}
        />
      </div>
    </div>
  );
}
