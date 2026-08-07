'use client'

import { POIMap } from './poi-map'
import type { POILite } from '@/lib/types'
import { useEffect, useState } from 'react'
import { mapsConfig } from '@/lib/firebase-config'

export function POIMapAdapter({
  selectedPoiId,
  onSelectPoiId,
  pois,
  onCrash,
  isListVisible
}: {
  selectedPoiId: string | null
  onSelectPoiId: (poiId: string | null) => void
  pois: POILite[]
  onCrash?: () => void
  isListVisible: boolean
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
      <POIMap
        selectedPoiId={selectedPoiId}
        onSelectPoiId={onSelectPoiId}
        pois={pois as any}
        isListVisible={isListVisible}
      />
    </div>
  )
}
