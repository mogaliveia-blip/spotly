'use client'

import { POIMap } from './poi-map'
import type { POI, POILite } from '@/lib/types'
import { useEffect, useRef, useState } from 'react'
import { mapsConfig } from '@/lib/firebase-config'

export function POIMapAdapter({
  selectedPoi,
  onSelectPoi,
  pois,
  onCrash,
  isListVisible
}: {
  selectedPoi: POILite | POI | null
  onSelectPoi: (poi: POILite | null) => void
  pois: POILite[]
  onCrash?: () => void
  isListVisible: boolean
}) {
  const [canLoadMap, setCanLoadMap] = useState(false)
  const startedAtRef = useRef<number | null>(null)

  useEffect(() => {
    startedAtRef.current = performance.now()
    console.time('[Perf] maps-api')
    const apiKey = mapsConfig.apiKey

    // Si clé absente ou volontairement invalide
    if (!apiKey || apiKey === 'invalid_key') {
      console.timeEnd('[Perf] maps-api')
      onCrash?.()
      return
    }

    setCanLoadMap(true)
  }, [onCrash])

  useEffect(() => {
    if (!canLoadMap || typeof window === 'undefined') return

    let animationFrame = 0
    let pollCount = 0

    const poll = () => {
      pollCount += 1
      if (window.google?.maps) {
        console.timeEnd('[Perf] maps-api')
        console.info('[Perf] maps-api-ready', {
          durationMs: startedAtRef.current ? Math.round(performance.now() - startedAtRef.current) : null,
          pollCount,
        })
        return
      }
      animationFrame = window.requestAnimationFrame(poll)
    }

    animationFrame = window.requestAnimationFrame(poll)
    return () => window.cancelAnimationFrame(animationFrame)
  }, [canLoadMap])

  if (!canLoadMap) {
    return null
  }

  return (
    <div className="w-full h-full min-h-0 relative">
      <POIMap
        selectedPoi={selectedPoi as any}
        onSelectPoi={onSelectPoi as any}
        pois={pois as any}
        isListVisible={isListVisible}
      />
    </div>
  )
}
