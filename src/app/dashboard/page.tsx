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
    // 1. Filtrer par catégorie (logique existante)
    const filteredByCategory = pois.filter(p => categoryFilter === 'all' || p.mainCategory === categoryFilter);

    // 2. Définir la logique pour un sponsor actif
    const isSponsorActive = (poi: POI): boolean => {
      if (!poi.sponsor || !poi.sponsor.enabled) {
        return false;
      }
      const now = new Date();
      
      const getJsDate = (date: any): Date | null => {
        if (!date) return null;
        if (date.toDate) return date.toDate(); // Convertit un Timestamp Firestore
        if (date instanceof Date) return date; // Déjà une Date JS
        return null; // Type inconnu, on l'ignore
      };
      
      const startDate = getJsDate(poi.sponsor.startDate);
      const endDate = getJsDate(poi.sponsor.endDate);
      
      if (!startDate && !endDate) {
        return true; // Sponsor actif si pas de dates
      }
      
      // Gère les intervalles ouverts (si une seule date est définie)
      const isAfterStart = startDate ? now >= startDate : true;
      const isBeforeEnd = endDate ? now <= endDate : true;

      return isAfterStart && isBeforeEnd;
    };
    
    // 3. Séparer les POIs sponsorisés actifs des autres
    const activeSponsors: POI[] = [];
    const otherPois: POI[] = [];
    
    for (const poi of filteredByCategory) {
      if (isSponsorActive(poi)) {
        activeSponsors.push(poi);
      } else {
        otherPois.push(poi);
      }
    }
    
    // 4. Trier les sponsors actifs par priorité (décroissante)
    activeSponsors.sort((a, b) => b.sponsor!.priority - a.sponsor!.priority);
    
    // 5. Concaténer les listes
    const sortedPois = [...activeSponsors, ...otherPois];

    // 6. Appliquer la logique "freemium" pour les visiteurs
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
    <div className="h-full w-full flex flex-col">
      <div className="border-b bg-background z-10">
        <CategoryFilter 
          selectedCategory={categoryFilter as MainCategory | 'all'}
          onSelectCategory={handleCategorySelect}
        />
      </div>
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
