'use client';

import { POIMap } from '@/components/poi/poi-map';
import type { POI, MainCategory, MarketingConfig, AppConfig } from '@/lib/types';
import { useSearchParams, useRouter, usePathname } from 'next/navigation';
import { useSidebar } from '@/components/ui/sidebar';
import { useEffect, useState, useMemo } from 'react';
import { fetchPois, fetchMarketingConfig, fetchAppConfig } from '@/lib/data';
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
  const [appConfig, setAppConfig] = useState<AppConfig | null>(null);
  const [activePoi, setActivePoi] = useState<POI | null>(null);
  const [heroVisible, setHeroVisible] = useState(true);

  const selectedPoiId = searchParams.get('poi');
  const categoryFilter = searchParams.get('category') || 'all';

  useEffect(() => {
    async function init() {
      try {
        const [poiData, marketing, app] = await Promise.all([
          fetchPois(),
          fetchMarketingConfig(),
          fetchAppConfig()
        ]);
        setPois(poiData);
        setMarketingConfig(marketing);
        setAppConfig(app);
      } catch (error) {
        toast({
          title: "Erreur",
          description: "Impossible de charger les données.",
          variant: "destructive",
        });
      }
    }
    init();
  }, [toast]);

  useEffect(() => {
    if (pois.length > 0) {
      const poiFromUrl = selectedPoiId ? pois.find(p => p.id === selectedPoiId) : null;
      setActivePoi(poiFromUrl || null);
    }
  }, [selectedPoiId, pois]);

  const handleSelectPoi = (poi: POI | null) => {
    setActivePoi(poi);
    const params = new URLSearchParams(searchParams.toString());
    if (poi) params.set('poi', poi.id);
    else params.delete('poi');
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  };

  const handleCategorySelect = (category: MainCategory | 'all') => {
    const params = new URLSearchParams(searchParams.toString());
    if (category === 'all') params.delete('category');
    else params.set('category', category);
    params.delete('poi');
    setActivePoi(null);
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  };

  const visiblePois = useMemo(() => {
    const filtered = pois.filter(
      p => categoryFilter === 'all' || p.mainCategory === categoryFilter
    );

    const activeSponsors: POI[] = [];
    const others: POI[] = [];

    for (const poi of filtered) {
      if (isSponsorActive(poi)) activeSponsors.push(poi);
      else others.push(poi);
    }

    activeSponsors.sort(
      (a, b) => (b.sponsor?.priority ?? 0) - (a.sponsor?.priority ?? 0)
    );

    const sortedPois = [...activeSponsors, ...others];

    if (appConfig?.festivalMode || user) {
      return sortedPois;
    }

    return sortedPois.slice(0, 2);
  }, [pois, categoryFilter, user, appConfig]);

  const showHero = heroVisible && !user && marketingConfig?.heroEnabled;

  return (
    <div className="flex flex-col h-full w-full">
      <div className="relative z-10 bg-background">
        <CategoryFilter
          selectedCategory={categoryFilter as MainCategory | 'all'}
          onSelectCategory={handleCategorySelect}
        />
      </div>
      <div className="flex-1 relative overflow-hidden">
        {showHero && marketingConfig && (
          <HeroOverlay
            config={marketingConfig}
            onClose={() => setHeroVisible(false)}
          />
        )}
        <POIMap
          selectedPoi={activePoi}
          onSelectPoi={handleSelectPoi}
          pois={visiblePois}
        />
      </div>
    </div>
  );
}
