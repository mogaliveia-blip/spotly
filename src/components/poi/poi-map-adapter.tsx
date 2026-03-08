'use client'

import { APIProvider } from '@vis.gl/react-google-maps'
import { POIMap } from './poi-map'
import type { POI, POILite } from '@/lib/types'
import { useEffect, useState } from 'react'
import { mapsConfig } from '@/lib/firebase-config'

export function POIMapAdapter({
  selectedPoi,
  onSelectPoi,
  pois,
  onCrash
}: {
  selectedPoi: POILite | POI | null
  onSelectPoi: (poi: POILite | null) => void
  pois: POILite[]
  onCrash?: () => void
}) {
  const [canLoadMap, setCanLoadMap] = useState(false)

  useEffect(() => {
    const apiKey = mapsConfig.apiKey

    // Si clé absente ou volontairement invalide
    if (!apiKey || apiKey === 'invalid_key') {
      onCrash?.()
      return
    }

    setCanLoadMap(true)
  }, [onCrash])

  if (!canLoadMap) {
    return null
  }

  return (
    <div className="w-full h-full min-h-0 relative">
      <APIProvider apiKey={mapsConfig.apiKey}>
        <POIMap
          selectedPoi={selectedPoi as any}
          onSelectPoi={onSelectPoi as any}
          pois={pois as any}
        />
      </APIProvider>
    </div>
  )
}
