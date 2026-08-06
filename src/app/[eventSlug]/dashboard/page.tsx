'use client'

import { POIMapAdapter } from '@/components/poi/poi-map-adapter'
import type { POI, POILite, MainCategory, MarketingConfig } from '@/lib/types'
import { useSearchParams, usePathname } from 'next/navigation'
import { useEffect, useState, useMemo, useRef, useCallback } from 'react'
import { fetchPoisLite, fetchPublicPoiById, fetchMarketingConfig } from '@/lib/data'
import { useAuth } from '@/hooks/use-auth-user'
import { CategoryFilter } from '@/components/poi/category-filter'
import { HeroOverlay } from '@/components/marketing/hero-overlay'
import { PoiListBottomSheet } from '@/components/poi/poi-list-bottom-sheet'
import { useGeolocation } from '@/providers/geolocation-provider'
import { Button } from '@/components/ui/button'
import { AlertCircle, List, Loader2, RefreshCw } from 'lucide-react'
import { MobilePOIBottomSheet } from '@/components/poi/mobile-poi-bottom-sheet'
import { useEvent } from '@/providers/event-provider'

type AppMode = 'normal' | 'map-fallback'
type PoiLoadStatus = 'loading' | 'success' | 'error'

const defaultMarketingConfig: MarketingConfig = {
  heroEnabled: false,
  heroTitle: 'Découvrez le festival',
  heroSubtitle: "Connectez-vous pour accéder à toutes les fonctionnalités.",
  heroImageUrl: 'https://picsum.photos/seed/marketing/1200/800',
  heroCtaText: '',
  heroCtaMode: 'none',
}

const SECONDARY_CONFIG_TIMEOUT_MS = 3000
const POI_LOAD_TIMEOUT_MS = 8000
const POI_STALE_MS = 30000

const poisMemoryCache = new Map<string, { pois: POILite[]; loadedAt: number }>()

export default function DashboardPage() {
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const { user } = useAuth()
  const { userLocation } = useGeolocation()
  const { eventId, loading: eventLoading } = useEvent()

  const [pois, setPois] = useState<POILite[]>([])
  const [poiLoadStatus, setPoiLoadStatus] = useState<PoiLoadStatus>('loading')
  const [poiLoadError, setPoiLoadError] = useState<string | null>(null)
  const [lastPoiLoadedAt, setLastPoiLoadedAt] = useState<number | null>(null)
  const [marketingConfig, setMarketingConfig] = useState<MarketingConfig | null>(null)
  const [activePoi, setActivePoi] = useState<POILite | POI | null>(null)
  const [heroVisible, setHeroVisible] = useState(false)
  const [appMode, setAppMode] = useState<AppMode>('normal')
  const [isListVisible, setIsListVisible] = useState(true)

  const selectedPoiId = searchParams.get('poi')
  const categoryFilter = searchParams.get('category') || 'all'
  const fullPoiRequestSeqRef = useRef(0)
  const poiRequestSeqRef = useRef(0)
  const activePoiRequestRef = useRef<{ eventId: string; requestId: number } | null>(null)
  const latestEventIdRef = useRef(eventId)

  const updateUrl = useCallback(
    (params: URLSearchParams) => {
      const query = params.toString()
      const newUrl = query ? `${pathname}?${query}` : pathname
      window.history.replaceState(null, '', newUrl)
    },
    [pathname]
  )

  const loadPois = useCallback(async (reason: 'initial' | 'retry' | 'resume' = 'initial') => {
    if (!eventId || eventLoading) return

    const activeRequest = activePoiRequestRef.current
    if (activeRequest?.eventId === eventId) return

    const cached = poisMemoryCache.get(eventId)
    const requestId = ++poiRequestSeqRef.current
    activePoiRequestRef.current = { eventId, requestId }

    if (cached) {
      setPois(cached.pois)
      setLastPoiLoadedAt(cached.loadedAt)
    } else if (latestEventIdRef.current !== eventId || reason === 'initial') {
      setPois([])
      setLastPoiLoadedAt(null)
    }

    setPoiLoadStatus('loading')
    setPoiLoadError(null)

    try {
      const timeout = new Promise<never>((_, reject) => {
        window.setTimeout(() => reject(new Error('POI_LOAD_TIMEOUT')), POI_LOAD_TIMEOUT_MS)
      })
      const poiData = await Promise.race([fetchPoisLite(eventId), timeout])

      if (
        latestEventIdRef.current !== eventId ||
        poiRequestSeqRef.current !== requestId ||
        activePoiRequestRef.current?.eventId !== eventId ||
        activePoiRequestRef.current?.requestId !== requestId
      ) {
        return
      }

      const loadedAt = Date.now()
      poisMemoryCache.set(eventId, { pois: poiData, loadedAt })
      setPois(poiData)
      setLastPoiLoadedAt(loadedAt)
      setPoiLoadStatus('success')
      setPoiLoadError(null)
    } catch (error: any) {
      if (
        latestEventIdRef.current !== eventId ||
        poiRequestSeqRef.current !== requestId ||
        activePoiRequestRef.current?.eventId !== eventId ||
        activePoiRequestRef.current?.requestId !== requestId
      ) {
        return
      }

      setPoiLoadStatus('error')
      setPoiLoadError(
        error?.message === 'POI_LOAD_TIMEOUT'
          ? 'Le chargement des lieux prend trop de temps. Vérifiez votre connexion puis réessayez.'
          : 'Impossible de charger les lieux de cet événement.'
      )
    } finally {
      if (activePoiRequestRef.current?.eventId === eventId && activePoiRequestRef.current?.requestId === requestId) {
        activePoiRequestRef.current = null
      }
    }
  }, [eventId, eventLoading])

  const loadFullPoi = useCallback(async (poiId: string) => {
    const requestSeq = ++fullPoiRequestSeqRef.current
    try {
      const full = await fetchPublicPoiById(poiId, eventId)
      if (!full) return
      if (requestSeq !== fullPoiRequestSeqRef.current) return
      setActivePoi(full)
    } catch {
      // Keep lite if full fetch fails
    }
  }, [eventId])

  const handleSelectPoi = useCallback(
    (poi: POILite | null) => {
      setActivePoi(poi ? { ...poi } : null)
      if (!poi) fullPoiRequestSeqRef.current += 1
      
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
    latestEventIdRef.current = eventId

    if (eventLoading) {
      activePoiRequestRef.current = null
      setPoiLoadStatus('loading')
      setPoiLoadError(null)
      setMarketingConfig(null)
      setHeroVisible(false)
      return
    }

    setActivePoi(null)
    fullPoiRequestSeqRef.current += 1
    void loadPois('initial')
  }, [eventId, eventLoading, loadPois])

  useEffect(() => {
    if (eventLoading) return

    const shouldRefresh = () => {
      if (!eventId) return false
      if (activePoiRequestRef.current?.eventId === eventId) return false
      if (poiLoadStatus === 'error' && pois.length > 0) return true
      if (pois.length === 0) return true
      if (!lastPoiLoadedAt) return true
      return Date.now() - lastPoiLoadedAt > POI_STALE_MS
    }

    const refreshAfterResume = () => {
      if (document.visibilityState !== 'visible') return
      if (shouldRefresh()) void loadPois('resume')
    }

    const handlePageShow = () => refreshAfterResume()
    const handleVisibilityChange = () => refreshAfterResume()

    window.addEventListener('pageshow', handlePageShow)
    document.addEventListener('visibilitychange', handleVisibilityChange)

    return () => {
      window.removeEventListener('pageshow', handlePageShow)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [eventId, eventLoading, lastPoiLoadedAt, loadPois, poiLoadStatus, pois.length])

  useEffect(() => {
    if (eventLoading) return

    let isMounted = true
    let settled = false
    const timeoutId = window.setTimeout(() => {
      if (!isMounted || settled) return
      setMarketingConfig(defaultMarketingConfig)
      console.warn('[Marketing Config] Timeout, fallback applied')
    }, SECONDARY_CONFIG_TIMEOUT_MS)

    fetchMarketingConfig(eventId)
      .then((marketing) => {
        if (!isMounted) return
        settled = true
        window.clearTimeout(timeoutId)
        setMarketingConfig(marketing)
      })
      .catch((error: any) => {
        if (!isMounted) return
        settled = true
        window.clearTimeout(timeoutId)
        setMarketingConfig(defaultMarketingConfig)
        console.warn('[Marketing Config] Read failed, fallback applied', {
          eventId,
          errorCode: error?.code ?? null,
          errorMessage: error?.message ?? null,
        })
      })

    return () => {
      isMounted = false
      window.clearTimeout(timeoutId)
    }
  }, [eventId, eventLoading])

  useEffect(() => {
    if (!marketingConfig?.heroEnabled || eventLoading) return
    const dismissed = sessionStorage.getItem(`heroDismissed_${eventId}`)
    if (!dismissed) setHeroVisible(true)
  }, [marketingConfig, eventId, eventLoading])

  useEffect(() => {
    if (!pois.length || eventLoading) return
  
    const poiFromUrl = selectedPoiId
      ? pois.find((p) => p.id === selectedPoiId)
      : null
  
    setActivePoi(prev => {
      if (!poiFromUrl) return null
      if (prev && prev.id === poiFromUrl.id && 'description' in prev) {
        return prev
      }
      return poiFromUrl
    })
  
    if (poiFromUrl?.id) {
      void loadFullPoi(poiFromUrl.id)
      setIsListVisible(true)
    }
  }, [selectedPoiId, pois, loadFullPoi, eventLoading])

  const handleCategorySelect = (category: MainCategory | 'all') => {
    const params = new URLSearchParams(searchParams.toString())
    if (category === 'all') params.delete('category')
    else params.set('category', category)
    params.delete('poi')
    setActivePoi(null)
    updateUrl(params)
    setIsListVisible(true) 
  }

  const closeMarketingOverlay = useCallback(() => {
    sessionStorage.setItem(`heroDismissed_${eventId}`, 'true')
    setHeroVisible(false)
  }, [eventId])

  const visiblePois = useMemo(() => {
    return pois.filter((p) => categoryFilter === 'all' || p.mainCategory === categoryFilter)
  }, [pois, categoryFilter])

  const showHero = heroVisible && !user && marketingConfig?.heroEnabled
  const showPoiStatusOverlay = poiLoadStatus !== 'success' || visiblePois.length === 0

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
            onClose={closeMarketingOverlay}
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

        {showPoiStatusOverlay && (
          <div className="absolute left-1/2 top-28 z-30 w-[min(92vw,420px)] -translate-x-1/2 rounded-lg border bg-background/95 p-4 text-sm shadow-xl backdrop-blur">
            {poiLoadStatus === 'loading' && (
              <div className="flex items-center gap-3">
                <Loader2 className="h-4 w-4 shrink-0 animate-spin text-primary" />
                <div>
                  <div className="font-semibold">Chargement des lieux</div>
                  {pois.length > 0 && (
                    <div className="mt-1 text-muted-foreground">Les lieux déjà chargés restent affichés pendant l’actualisation.</div>
                  )}
                </div>
              </div>
            )}

            {poiLoadStatus === 'error' && (
              <div className="space-y-3">
                <div className="flex items-start gap-3">
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
                  <div>
                    <div className="font-semibold">Lieux indisponibles</div>
                    <div className="mt-1 text-muted-foreground">{poiLoadError}</div>
                  </div>
                </div>
                <Button type="button" size="sm" onClick={() => void loadPois('retry')} className="gap-2">
                  <RefreshCw className="h-4 w-4" />
                  Réessayer
                </Button>
              </div>
            )}

            {poiLoadStatus === 'success' && visiblePois.length === 0 && (
              <div className="text-center font-medium">
                {pois.length === 0 ? 'Aucun lieu disponible' : 'Aucun résultat pour cette catégorie.'}
              </div>
            )}
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
        isVisible={isListVisible && (poiLoadStatus !== 'loading' || visiblePois.length > 0)}
      />
    </div>
  )
}
