'use client'

import { POIMapAdapter } from '@/components/poi/poi-map-adapter'
import type { POI, POILite, MainCategory, MarketingConfig } from '@/lib/types'
import { useSearchParams, usePathname } from 'next/navigation'
import { useEffect, useState, useMemo, useRef, useCallback } from 'react'
import { DEFAULT_EVENT_ID, fetchPoisLite, fetchPoiById, fetchMarketingConfig } from '@/lib/data'
import { useAuth } from '@/hooks/use-auth-user'
import { CategoryFilter } from '@/components/poi/category-filter'
import { HeroOverlay } from '@/components/marketing/hero-overlay'
import { PoiListBottomSheet } from '@/components/poi/poi-list-bottom-sheet'
import { useGeolocation } from '@/providers/geolocation-provider'
import { Button } from '@/components/ui/button'
import { AlertCircle, List, Loader2, RefreshCw, X } from 'lucide-react'
import { useEvent } from '@/providers/event-provider'
import { POIDetails } from '@/components/poi/poi-details'
import { useToast } from '@/hooks/use-toast'

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
const POI_RETRY_DELAY_MS = 900

const poisMemoryCache = new Map<string, { pois: POILite[]; loadedAt: number }>()
const poiDetailsMemoryCache = new Map<string, POI>()

function isFullPoi(poi: POILite | POI | null): poi is POI {
  return (
    !!poi &&
    typeof (poi as any).description === 'string' &&
    Array.isArray((poi as any).galleryUrls)
  )
}

function poiDetailCacheKey(eventId: string, poiId: string) {
  return `${eventId}:${poiId}`
}

export default function DashboardPage() {
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const { user } = useAuth()
  const { userLocation } = useGeolocation()
  const { eventId, loading: eventLoading } = useEvent()
  const { toast } = useToast()

  const [pois, setPois] = useState<POILite[]>([])
  const [poiLoadStatus, setPoiLoadStatus] = useState<PoiLoadStatus>('loading')
  const [poiLoadError, setPoiLoadError] = useState<string | null>(null)
  const [lastPoiLoadedAt, setLastPoiLoadedAt] = useState<number | null>(null)
  const [marketingConfig, setMarketingConfig] = useState<MarketingConfig | null>(null)
  const [selectedPoiId, setSelectedPoiId] = useState<string | null>(() => searchParams.get('poi'))
  const [poiDetailsById, setPoiDetailsById] = useState<Record<string, POI>>({})
  const [heroVisible, setHeroVisible] = useState(false)
  const [appMode, setAppMode] = useState<AppMode>('normal')
  const [isListVisible, setIsListVisible] = useState(true)

  const categoryFilter = searchParams.get('category') || 'all'
  const fullPoiRequestSeqRef = useRef(0)
  const poiRequestSeqRef = useRef(0)
  const activePoiRequestRef = useRef<{ eventId: string; requestId: number } | null>(null)
  const latestEventIdRef = useRef(eventId)
  const latestPoisRef = useRef<POILite[]>([])
  const lastNonEmptyEventIdRef = useRef<string | null>(null)

  const updateUrl = useCallback(
    (params: URLSearchParams) => {
      const query = params.toString()
      const newUrl = query ? `${pathname}?${query}` : pathname
      window.history.replaceState(null, '', newUrl)
    },
    [pathname]
  )

  const readPoisWithTimeout = useCallback((resolvedEventId: string) => {
    let timeoutId: number | undefined
    const timeout = new Promise<never>((_, reject) => {
      timeoutId = window.setTimeout(() => reject(new Error('POI_LOAD_TIMEOUT')), POI_LOAD_TIMEOUT_MS)
    })

    return Promise.race([fetchPoisLite(resolvedEventId), timeout]).finally(() => {
      if (timeoutId !== undefined) window.clearTimeout(timeoutId)
    })
  }, [])

  const loadPois = useCallback(async (reason: 'initial' | 'retry' | 'resume' = 'initial') => {
    if (!eventId || eventId === DEFAULT_EVENT_ID || eventLoading) {
      setPoiLoadStatus('loading')
      return
    }

    const activeRequest = activePoiRequestRef.current
    if (activeRequest?.eventId === eventId) return

    const cached = poisMemoryCache.get(eventId)
    const cachedPois = cached?.pois ?? []
    const currentPois = latestPoisRef.current
    const hadValidPois = cachedPois.length > 0 || (lastNonEmptyEventIdRef.current === eventId && currentPois.length > 0)
    const requestId = ++poiRequestSeqRef.current
    activePoiRequestRef.current = { eventId, requestId }

    if (cached) {
      setPois(cached.pois)
      setLastPoiLoadedAt(cached.loadedAt)
    } else if (!hadValidPois && (latestEventIdRef.current !== eventId || reason === 'initial')) {
      setPois([])
      setLastPoiLoadedAt(null)
    }

    setPoiLoadStatus('loading')
    setPoiLoadError(null)

    try {
      let poiData: POILite[]

      try {
        poiData = await readPoisWithTimeout(eventId)
      } catch {
        await new Promise((resolve) => window.setTimeout(resolve, POI_RETRY_DELAY_MS))
        poiData = await readPoisWithTimeout(eventId)
      }

      if (poiData.length === 0 && !hadValidPois) {
        await new Promise((resolve) => window.setTimeout(resolve, POI_RETRY_DELAY_MS))
        poiData = await readPoisWithTimeout(eventId)
      }

      if (
        latestEventIdRef.current !== eventId ||
        poiRequestSeqRef.current !== requestId ||
        activePoiRequestRef.current?.eventId !== eventId ||
        activePoiRequestRef.current?.requestId !== requestId
      ) {
        return
      }

      const loadedAt = Date.now()
      if (poiData.length === 0 && hadValidPois) {
        setPois(cachedPois.length > 0 ? cachedPois : currentPois)
        setPoiLoadStatus('error')
        setPoiLoadError('La dernière lecture des lieux est incomplète. Les derniers lieux connus restent affichés.')
        return
      }

      poisMemoryCache.set(eventId, { pois: poiData, loadedAt })
      setPois(poiData)
      setLastPoiLoadedAt(loadedAt)
      setPoiLoadStatus('success')
      setPoiLoadError(null)
      if (poiData.length > 0) lastNonEmptyEventIdRef.current = eventId
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
  }, [eventId, eventLoading, readPoisWithTimeout])

  useEffect(() => {
    latestPoisRef.current = pois
  }, [pois])

  const loadFullPoi = useCallback(async (poiId: string) => {
    const cachedFull = poiDetailsMemoryCache.get(poiDetailCacheKey(eventId, poiId))
    if (cachedFull) {
      setPoiDetailsById((previous) => ({ ...previous, [poiId]: cachedFull }))
    }

    const requestSeq = ++fullPoiRequestSeqRef.current
    try {
      const full = await fetchPoiById(poiId, eventId)
      if (!full || !isFullPoi(full)) return
      if (requestSeq !== fullPoiRequestSeqRef.current) return
      poiDetailsMemoryCache.set(poiDetailCacheKey(eventId, poiId), full)
      setPoiDetailsById((previous) => ({ ...previous, [poiId]: full }))
    } catch {
      // Keep the last valid detail or lite data if the network cannot provide a complete POI.
    }
  }, [eventId])

  const selectPoiId = useCallback(
    (poiId: string | null) => {
      const params = new URLSearchParams(window.location.search)
      if (poiId) {
        params.set('poi', poiId)
      } else {
        params.delete('poi')
        fullPoiRequestSeqRef.current += 1
      }
      setSelectedPoiId(poiId)
      updateUrl(params)
      if (poiId) void loadFullPoi(poiId)
    },
    [loadFullPoi, updateUrl]
  )

  const handleSelectPoi = useCallback(
    (poi: POILite | null) => {
      selectPoiId(poi?.id ?? null)
    },
    [selectPoiId]
  )

  useEffect(() => {
    latestEventIdRef.current = eventId

    if (eventLoading || eventId === DEFAULT_EVENT_ID) {
      activePoiRequestRef.current = null
      setPoiLoadStatus('loading')
      setPoiLoadError(null)
      setMarketingConfig(null)
      setHeroVisible(false)
      return
    }

    const poiIdFromUrl = new URLSearchParams(window.location.search).get('poi')

    setSelectedPoiId(poiIdFromUrl)
    setPoiDetailsById({})
    fullPoiRequestSeqRef.current += 1
    void loadPois('initial')
    if (poiIdFromUrl) void loadFullPoi(poiIdFromUrl)
  }, [eventId, eventLoading, loadFullPoi, loadPois])

  useEffect(() => {
    if (eventLoading) return

    const shouldRefresh = () => {
      if (!eventId || eventId === DEFAULT_EVENT_ID) return false
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
    const syncSelectionFromUrl = () => {
      const params = new URLSearchParams(window.location.search)
      const poiId = params.get('poi')
      setSelectedPoiId(poiId)
      if (poiId) void loadFullPoi(poiId)
    }

    window.addEventListener('popstate', syncSelectionFromUrl)

    return () => {
      window.removeEventListener('popstate', syncSelectionFromUrl)
    }
  }, [loadFullPoi])

  useEffect(() => {
    if (!selectedPoiId || eventLoading) return
    if (!pois.some((poi) => poi.id === selectedPoiId)) return
    void loadFullPoi(selectedPoiId)
  }, [selectedPoiId, pois, loadFullPoi, eventLoading])

  useEffect(() => {
    if (!selectedPoiId || eventLoading || poiLoadStatus !== 'success') return
    if (pois.some((poi) => poi.id === selectedPoiId)) return

    const params = new URLSearchParams(window.location.search)
    if (params.get('poi') === selectedPoiId) {
      params.delete('poi')
      updateUrl(params)
    }

    fullPoiRequestSeqRef.current += 1
    setSelectedPoiId(null)
    toast({ title: 'Ce lieu n’est plus disponible.' })
  }, [eventLoading, poiLoadStatus, pois, selectedPoiId, toast, updateUrl])

  const handleCategorySelect = (category: MainCategory | 'all') => {
    const params = new URLSearchParams(window.location.search)
    if (category === 'all') params.delete('category')
    else params.set('category', category)
    params.delete('poi')
    setSelectedPoiId(null)
    fullPoiRequestSeqRef.current += 1
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

  const selectedPoi = useMemo<POILite | POI | null>(() => {
    if (!selectedPoiId) return null
    return poiDetailsById[selectedPoiId] ?? pois.find((poi) => poi.id === selectedPoiId) ?? null
  }, [selectedPoiId, poiDetailsById, pois])

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
            selectedPoiId={selectedPoiId}
            onSelectPoiId={selectPoiId}
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

        {selectedPoiId && (
          <div className="pointer-events-none fixed inset-x-0 bottom-0 z-50 px-3 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] md:absolute md:inset-x-auto md:bottom-6 md:right-6 md:w-[min(440px,calc(100vw-2rem))] md:px-0 md:pb-0">
            <div className="pointer-events-auto max-h-[72vh] overflow-hidden rounded-2xl border bg-background/95 shadow-2xl backdrop-blur-md md:max-h-[calc(100vh-8rem)]">
              <div className="flex min-h-12 items-center justify-between border-b px-4">
                <div className="h-1.5 w-12 rounded-full bg-muted-foreground/20 md:hidden" />
                <div className="hidden text-sm font-bold md:block">Détail du lieu</div>
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  className="h-11 w-11 rounded-full"
                  aria-label="Fermer le détail du lieu"
                  onClick={() => selectPoiId(null)}
                >
                  <X className="h-5 w-5" />
                </Button>
              </div>
              <div className="max-h-[calc(72vh-3rem)] overflow-y-auto px-4 py-4 md:max-h-[calc(100vh-11rem)]">
                {selectedPoi ? (
                  <POIDetails key={selectedPoi.id} poi={selectedPoi} />
                ) : (
                  <div className="flex min-h-[40vh] flex-col items-center justify-center gap-3 text-center text-sm text-muted-foreground">
                    <Loader2 className="h-6 w-6 animate-spin text-primary" />
                    <div className="font-medium text-foreground">Chargement du lieu</div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {!isListVisible && !selectedPoiId && (
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

      </div>

      <PoiListBottomSheet
        pois={visiblePois}
        onSelectPoi={handleSelectPoi}
        selectedPoiId={selectedPoiId}
        userLocation={userLocation}
        categoryFilter={categoryFilter as MainCategory | 'all'}
        isVisible={isListVisible && (poiLoadStatus !== 'loading' || visiblePois.length > 0)}
      />
    </div>
  )
}
