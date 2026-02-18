'use client';

import { POIMapAdapter } from '@/components/poi/poi-map-adapter';
import type { POI, MainCategory, MarketingConfig, AppConfig } from '@/lib/types';
import { useSearchParams, usePathname } from 'next/navigation';
import { useSidebar } from '@/components/ui/sidebar';
import { useEffect, useState, useMemo } from 'react';
import { fetchPois, fetchMarketingConfig, fetchAppConfig } from '@/lib/data';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/use-auth-user';
import { CategoryFilter } from '@/components/poi/category-filter';
import { HeroOverlay } from '@/components/marketing/hero-overlay';
import { isSponsorActive } from '@/lib/sponsor-utils';

type AppMode = "normal" | "map-fallback" | "static-fallback";

export default function DashboardPage() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { setOpen } = useSidebar();
  const { toast } = useToast();
  const { user } = useAuth();

  const [pois, setPois] = useState<POI[]>([]);
  const [marketingConfig, setMarketingConfig] = useState<MarketingConfig | null>(null);
  const [appConfig, setAppConfig] = useState<AppConfig | null>(null);
  const [activePoi, setActivePoi] = useState<POI | null>(null);
  const [heroVisible, setHeroVisible] = useState(false);
  const [appMode, setAppMode] = useState<AppMode>("normal");

  const selectedPoiId = searchParams.get('poi');
  const categoryFilter = searchParams.get('category') || 'all';

  // Chargement initial
  useEffect(() => {
    async function init() {
      try {
        const [poiData, marketing, app] = await Promise.all([
          fetchPois(),
          fetchMarketingConfig(),
          fetchAppConfig(),
        ]);

        setPois(poiData);
        setMarketingConfig(marketing);
        setAppConfig(app);
      } catch (error) {
        setAppMode("static-fallback");
        toast({
          title: 'Erreur',
          description: "Impossible de charger les données.",
          variant: 'destructive',
        });
      }
    }

    init();
  }, [toast]);

  // Affichage une seule fois par session
  useEffect(() => {
    if (!marketingConfig?.heroEnabled) return;

    const dismissed = sessionStorage.getItem('heroDismissed');

    if (!dismissed) {
      setHeroVisible(true);
    }
  }, [marketingConfig]);

  // Synchronisation POI actif via URL
  useEffect(() => {
    if (pois.length > 0) {
      const poiFromUrl = selectedPoiId
        ? pois.find((p) => p.id === selectedPoiId)
        : null;

      setActivePoi(poiFromUrl || null);
    }
  }, [selectedPoiId, pois]);

  // Navigation 100% client
  const updateUrl = (params: URLSearchParams) => {
    const newUrl = `${pathname}?${params.toString()}`;
    window.history.replaceState(null, '', newUrl);
  };

  const handleSelectPoi = (poi: POI | null) => {
    setActivePoi(poi);

    const params = new URLSearchParams(searchParams.toString());
    if (poi) params.set('poi', poi.id);
    else params.delete('poi');

    updateUrl(params);
  };

  const handleCategorySelect = (category: MainCategory | 'all') => {
    const params = new URLSearchParams(searchParams.toString());

    if (category === 'all') params.delete('category');
    else params.set('category', category);

    params.delete('poi');
    setActivePoi(null);

    updateUrl(params);
  };

  const visiblePois = useMemo(() => {
    const filtered = pois.filter(
      (p) => categoryFilter === 'all' || p.mainCategory === categoryFilter
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
    <div className="flex flex-col h-screen w-full overflow-hidden">

      {/* Barre catégories */}
      <div className="relative z-20 bg-background">
        <CategoryFilter
          selectedCategory={categoryFilter as MainCategory | 'all'}
          onSelectCategory={handleCategorySelect}
        />
      </div>

      {/* Contenu principal */}
      <div className="flex-1 relative overflow-hidden min-h-0 flex">

        {showHero && marketingConfig && (
          <HeroOverlay
            config={marketingConfig}
            onClose={() => {
              sessionStorage.setItem('heroDismissed', 'true');
              setHeroVisible(false);
            }}
          />
        )}

        {appMode === "normal" && (
          <POIMapAdapter
            selectedPoi={activePoi}
            onSelectPoi={handleSelectPoi}
            pois={visiblePois}
            onCrash={() => setAppMode("map-fallback")}
          />
        )}

        {appMode === "map-fallback" && (
          <div className="flex flex-col h-full overflow-auto p-4 gap-4">
            <div className="text-sm text-muted-foreground mb-2">
              Carte temporairement indisponible. Utilisez la liste ci-dessous.
            </div>

            {visiblePois.map((poi) => (
              <div
                key={poi.id}
                className="p-4 rounded-lg border bg-background shadow-sm"
              >
                <div className="font-semibold">{poi.title}</div>
                <div className="text-sm text-muted-foreground mb-2">
                  {poi.description}
                </div>

                <a
                  href={`https://www.google.com/maps/dir/?api=1&destination=${poi.location.lat},${poi.location.lng}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary text-sm underline"
                >
                  Itinéraire
                </a>
              </div>
            ))}
          </div>
        )}

        {appMode === "static-fallback" && (
          <div className="flex items-center justify-center h-full bg-muted text-sm text-muted-foreground">
            Mode simplifié activé.
          </div>
        )}

      </div>
    </div>
  );
}
