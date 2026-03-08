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

type AppMode = 'normal' | 'map-fallback' | 'static-fallback'

export default function DashboardPage() {
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const { toast } = useToast()
  const { user } = useAuth()
  const { userLocation } = useGeolocation()

  const [pois, setPois] = useState<POILite[]>([])
  const [marketingConfig, setMarketingConfig] = useState<MarketingConfig | null>(null)
  const [appConfig, setAppConfig] = useState<AppConfig | null>(null)
  const [activePoi, setActivePoi] = useState<POILite | POI | null>(null)
  const [heroVisible, setHeroVisible] = useState(false)
  const [appMode, setAppMode] = useState<AppMode>('normal')

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
      const full = await fetchPoiById(poiId)
      if (!full) return
      if (requestId !== requestIdRef.current) return
      setActivePoi(full)
    } catch {
      // Keep lite if full fetch fails
    }
  }, [])

  const handleSelectPoi = useCallback(
    (poi: POILite | null) => {
      setActivePoi(poi)
      const params = new URLSearchParams(searchParams.toString())
      if (poi) {
        params.set('poi', poi.id)
      } else {
        params.delete('poi')
      }
      updateUrl(params)
      if (poi) void loadFullPoi(poi.id)
    },
    [loadFullPoi, searchParams, updateUrl]
  )

  useEffect(() => {
    async function init() {
      try {
        const [poiData, marketing, app] = await Promise.all([
          fetchPoisLite(),
          fetchMarketingConfig(),
          fetchAppConfig()
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
  }, [toast])

  useEffect(() => {
    if (!marketingConfig?.heroEnabled) return
    const dismissed = sessionStorage.getItem('heroDismissed')
    if (!dismissed) setHeroVisible(true)
  }, [marketingConfig])

  useEffect(() => {
    if (!pois.length) return
    const poiFromUrl = selectedPoiId ? pois.find((p) => p.id === selectedPoiId) : null
    setActivePoi(poiFromUrl || null)
    if (poiFromUrl?.id) void loadFullPoi(poiFromUrl.id)
  }, [selectedPoiId, pois, loadFullPoi])

  const handleCategorySelect = (category: MainCategory | 'all') => {
    const params = new URLSearchParams(searchParams.toString())
    if (category === 'all') params.delete('category')
    else params.set('category', category)
    params.delete('poi')
    setActivePoi(null)
    updateUrl(params)
  }

  const visiblePois = useMemo(() => {
    const filtered = pois.filter((p) => categoryFilter === 'all' || p.mainCategory === categoryFilter)
    if (appConfig?.festivalMode || user) return filtered
    return filtered.slice(0, 5) // Increased limit for visitors in new UI
  }, [pois, categoryFilter, user, appConfig])

  const showHero = heroVisible && !user && marketingConfig?.heroEnabled

  return (
    <div className="flex flex-col h-full w-full relative">
      {/* Category bar floating or sticky */}
      <div className="absolute top-0 left-0 right-0 z-20 bg-gradient-to-b from-background/90 to-transparent pt-2 pb-6">
        <CategoryFilter
          selectedCategory={categoryFilter as MainCategory | 'all'}
          onSelectCategory={handleCategorySelect}
        />
      </div>

      {/* Main content area */}
      <div className="flex-1 relative">
        {showHero && marketingConfig && (
          <HeroOverlay
            config={marketingConfig}
            onClose={() => {
              sessionStorage.setItem('heroDismissed', 'true')
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
          />
        )}

        {appMode === 'map-fallback' && (
          <div className="flex items-center justify-center h-full bg-muted text-muted-foreground p-8 text-center">
            La carte est momentanément indisponible. Utilisez la liste ci-dessous.
          </div>
        )}
      </div>

      {/* Persistent POI List Bottom Sheet */}
      <PoiListBottomSheet
        pois={visiblePois}
        onSelectPoi={handleSelectPoi}
        selectedPoiId={activePoi?.id || null}
        userLocation={userLocation}
        categoryFilter={categoryFilter as MainCategory | 'all'}
      />
    </div>
  )
}
