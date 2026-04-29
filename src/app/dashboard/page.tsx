
'use client'

import { POIMapAdapter } from '@/components/poi/poi-map-adapter'
import type { POI, POILite, MainCategory, MarketingConfig, AppConfig } from '@/lib/types'
import { useSearchParams, usePathname } from 'next/navigation'
import { useEffect, useState, useMemo, useRef, useCallback } from 'react'
import { fetchPoisLite, fetchPoiById, fetchMarketingConfig, fetchAppConfig } from '@/lib/data'
import { useToast } from '@/hooks/use-toast'
import { useAuth } from '@/hooks/use-auth-user'
import { CategoryFilter } from '@/components/poi/category-filter'
import { HeroOverlay } from '@/components/marketing/hero-overlay'
import { PoiListBottomSheet } from '@/components/poi/poi-list-bottom-sheet'
import { useGeolocation } from '@/providers/geolocation-provider'
import { Button } from '@/components/ui/button'
import { List, Loader2 } from 'lucide-react'
import { MobilePOIBottomSheet } from '@/components/poi/mobile-poi-bottom-sheet'
import { useIsMobile } from '@/hooks/use-mobile'
import { useEvent } from '@/providers/event-provider'

type AppMode = 'normal' | 'map-fallback' | 'static-fallback'

export default function DashboardPage() {
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const { toast } = useToast()
  const { user } = useAuth()
  const { userLocation } = useGeolocation()
  const { eventId, loading: eventLoading } = useEvent()
  const isMobile = useIsMobile()

  const [pois, setPois] = useState<POILite[]>([])
  const [marketingConfig, setMarketingConfig] = useState<MarketingConfig | null>(null)
  const [appConfig, setAppConfig] = useState<AppConfig | null>(null)
  const [activePoi, setActivePoi] = useState<POILite | POI | null>(null)
  const [heroVisible, setHeroVisible] = useState(false)
  const [appMode, setAppMode] = useState<AppMode>('normal')
  const [isListVisible, setIsListVisible] = useState(true)

  const selectedPoiId = searchParams.get('poi')
  const categoryFilter = searchParams.get('category') || 'all'
  const requestIdRef = useRef(0)

  const updateUrl = useCallback(
    (params: URLSearchParams) => {
      const newUrl = `${pathname}?${params.toString()}`
      window.history.replaceState(null, '', newUrl)
    },
    [pathname]
  )

  const loadFullPoi = useCallback(async (poiId: string) => {
    const requestId = ++requestIdRef.current
    try {
      const full = await fetchPoiById(poiId, eventId)
      if (!full) return
      if (requestId !== requestIdRef.current) return
      setActivePoi(full)
    } catch {
      // Keep lite if full fetch fails
    }
  }, [eventId])

  const handleSelectPoi = useCallback(
    (poi: POILite | null) => {
      setActivePoi(poi ? { ...poi } : null)
      
      const params = new URLSearchParams(searchParams.toString())
      if (poi) {
        params.set('poi', poi.id)
        setIsListVisible(true) 
      } else {
        params.delete('poi')
        setIsListVisible(false) 
      }
      updateUrl(params)
      if (poi) void loadFullPoi(poi.id)
    },
    [loadFullPoi, searchParams, updateUrl]
  )

  useEffect(() => {
    // 🔥 On attend que le provider d'événement ait fini de résoudre le contexte
    // Cela garantit qu'on ne charge pas les données de l'événement précédent
    // lors d'une navigation ou d'un logout.
    if (eventLoading) return;

    async function init() {
      try {
        console.log(`[Dashboard] Initializing data for eventId: ${eventId}`);
        const [poiData, marketing, app] = await Promise.all([
          fetchPoisLite(eventId),
          fetchMarketingConfig(eventId),
          fetchAppConfig(eventId)
        ])
        setPois(poiData)
        setMarketingConfig(marketing)
        setAppConfig(app)
      } catch (error) {
        setAppMode('static-fallback')
        toast({
          title: 'Erreur',
          description: 'Impossible de charger les données.',
          variant: 'destructive'
        })
      }
    }
    init()
  }, [eventId, eventLoading, toast])

  useEffect(() => {
    if (!marketingConfig?.heroEnabled) return
    const dismissed = sessionStorage.getItem(`heroDismissed_${eventId}`)
    if (!dismissed) setHeroVisible(true)
  }, [marketingConfig, eventId])

  useEffect(() => {
    if (!pois.length) return
  
    const poiFromUrl = selectedPoiId
      ? pois.find((p) => p.id === selectedPoiId)
      : null
  
    setActivePoi(prev => {
      if (!poiFromUrl) return null
  
      // Si on a déjà ce POI et qu'il est complet, on garde la version complète
      if (prev && prev.id === poiFromUrl.id && 'description' in prev) {
        return prev
      }
  
      return poiFromUrl
    })
  
    if (poiFromUrl?.id) {
      void loadFullPoi(poiFromUrl.id)
      setIsListVisible(true)
    }
  }, [selectedPoiId, pois, loadFullPoi])

  const handleCategorySelect = (category: MainCategory | 'all') => {
    const params = new URLSearchParams(searchParams.toString())
    if (category === 'all') params.delete('category')
    else params.set('category', category)
    params.delete('poi')
    setActivePoi(null)
    updateUrl(params)
    setIsListVisible(true) 
  }

  const visiblePois = useMemo(() => {
    return pois.filter((p) => categoryFilter === 'all' || p.mainCategory === categoryFilter)
  }, [pois, categoryFilter])

  const showHero = heroVisible && !user && marketingConfig?.heroEnabled

  if (eventLoading) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-background">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full w-full relative overflow-hidden">
      <div className="absolute top-0 left-0 right-0 z-20 bg-gradient-to-b from-background/90 to-transparent pt-2 pb-6">
        <CategoryFilter
          selectedCategory={categoryFilter as MainCategory | 'all'}
          onSelectCategory={handleCategorySelect}
        />
      </div>

      <div className="flex-1 relative w-full h-full">
        {showHero && marketingConfig && (
          <HeroOverlay
            config={marketingConfig}
            onClose={() => {
              sessionStorage.setItem(`heroDismissed_${eventId}`, 'true')
              setHeroVisible(false)
            }}
          />
        )}

        {appMode === 'normal' && (
          <POIMapAdapter
            selectedPoi={activePoi}
            onSelectPoi={handleSelectPoi}
            pois={visiblePois}
            onCrash={() => setAppMode('map-fallback')}
            isListVisible={isListVisible}
          />
        )}

        {appMode === 'map-fallback' && (
          <div className="flex items-center justify-center h-full bg-muted text-muted-foreground p-8 text-center">
            La carte est momentanément indisponible. Utilisez la liste ci-dessous.
          </div>
        )}

        {!isListVisible && !activePoi && (
          <div className="absolute bottom-24 left-1/2 -translate-x-1/2 z-30 animate-in fade-in slide-in-from-bottom-4 duration-500 pointer-events-auto">
            <Button 
              onClick={() => setIsListVisible(true)}
              className="rounded-full shadow-2xl px-6 h-12 gap-2 bg-primary/90 backdrop-blur-sm hover:bg-primary"
            >
              <List className="h-4 w-4" />
              Afficher la liste
            </Button>
          </div>
        )}

        <MobilePOIBottomSheet
          poi={activePoi}
          onOpenChange={(open) => {
            if (!open) handleSelectPoi(null)
          }}
          forceShow={appMode === 'map-fallback'}
        />
      </div>

      <PoiListBottomSheet
        pois={visiblePois}
        onSelectPoi={handleSelectPoi}
        selectedPoiId={activePoi?.id || null}
        userLocation={userLocation}
        categoryFilter={categoryFilter as MainCategory | 'all'}
        isVisible={isListVisible}
      />
    </div>
  )
}
