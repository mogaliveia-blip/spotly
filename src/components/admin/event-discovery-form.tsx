'use client'

import { useCallback, useEffect, useReducer, useState } from 'react'
import { AdvancedMarker, Map, useMap, useApiLoadingStatus, APILoadingStatus } from '@vis.gl/react-google-maps'
import { MapPin } from 'lucide-react'
import type { AppEvent } from '@/lib/types'
import {
  discoveryCategories, discoveryTags, eventDiscoveryTypes, isCatalogId,
  type DiscoveryPosition, type DiscoveryTagId, type EventDiscoveryTypeId, type DiscoveryCategoryId,
} from '@/lib/event-discovery'
import { updateEventDiscoverySettings } from '@/lib/event-discovery-update'
import { discoveryFormRevisionReducer, initialDiscoveryFormRevision, isDiscoveryFormDirty } from '@/lib/event-discovery-form-revision'
import { mapsConfig } from '@/lib/firebase-config'
import { PoiLocationSearch } from '@/components/poi/poi-location-search'
import { useToast } from '@/hooks/use-toast'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

function PositionCamera({ position }: { position: DiscoveryPosition | null }) {
  const map = useMap()
  useEffect(() => {
    if (map && position) {
      map.panTo(position)
      if ((map.getZoom() ?? 0) < 13) map.setZoom(15)
    }
  }, [map, position])
  return null
}

export function EventDiscoveryForm({ event }: { event: AppEvent }) {
  const { toast } = useToast()
  const apiStatus = useApiLoadingStatus()
  const [position, setPosition] = useState<DiscoveryPosition | null>(event.discoveryPosition ?? null)
  const [typeId, setTypeId] = useState<EventDiscoveryTypeId | ''>(event.typeId ?? '')
  const [categoryId, setCategoryId] = useState<DiscoveryCategoryId | ''>(event.categoryId ?? '')
  const [tags, setTags] = useState<DiscoveryTagId[]>(event.tags ?? [])
  const [revisionState, dispatchRevision] = useReducer(discoveryFormRevisionReducer, initialDiscoveryFormRevision)
  const dirty = isDiscoveryFormDirty(revisionState)
  const [saving, setSaving] = useState(false)

  const markChanged = useCallback(() => dispatchRevision({ type: 'change' }), [])

  useEffect(() => {
    setPosition(event.discoveryPosition ?? null)
    setTypeId(event.typeId ?? '')
    setCategoryId(event.categoryId ?? '')
    setTags(event.tags ?? [])
    dispatchRevision({ type: 'reset' })
  }, [event.id, event.discoveryPosition, event.typeId, event.categoryId, event.tags])

  const selectPosition = useCallback((next: DiscoveryPosition) => {
    setPosition(next)
    markChanged()
  }, [markChanged])

  async function saveSettings() {
    // This revision belongs to the same render as the payload below.
    const submittedRevision = revisionState.revision
    setSaving(true)
    try {
      await updateEventDiscoverySettings(event.id, {
        discoveryPosition: position, typeId: typeId || null, categoryId: categoryId || null, tags,
      })
      dispatchRevision({ type: 'saved', revision: submittedRevision })
      toast({ title: 'Découverte enregistrée' })
    } catch {
      toast({ title: 'Enregistrement impossible', description: 'Les paramètres de découverte n’ont pas été modifiés. Vérifiez vos droits et réessayez.', variant: 'destructive' })
    } finally {
      setSaving(false)
    }
  }

  const mapUnavailable = !mapsConfig.apiKey || mapsConfig.apiKey === 'invalid_key' ||
    apiStatus === APILoadingStatus.FAILED || apiStatus === APILoadingStatus.AUTH_FAILURE

  return <fieldset className="space-y-6 min-w-0" disabled={saving} aria-busy={saving}>
    <div className="space-y-3">
      <Label>Position de découverte</Label>
      <p className="text-sm text-muted-foreground">
        Choisissez l’emplacement de l’Event sur la future Carte Découverte. Cette position représente l’événement et reste indépendante de ses Points internes et du cadrage de sa carte.
      </p>
      {mapUnavailable ? <p className="text-sm text-muted-foreground">
        La carte est indisponible. Vous pouvez modifier la classification ; la position existante sera conservée.
      </p> : <div className="space-y-3" inert={saving}>
        <PoiLocationSearch locationBias={position} onPlaceSelected={selectPosition} />
        <p className="text-sm text-muted-foreground">Recherchez un lieu, puis cliquez sur la carte ou déplacez le marqueur pour préciser l’emplacement.</p>
        <div className="h-72 overflow-hidden rounded-xl border" aria-label="Choisir la position de découverte">
          <Map
            key={event.id}
            defaultCenter={event.discoveryPosition ?? event.defaultMapCenter ?? { lat: 46.6, lng: 2.4 }}
            defaultZoom={event.discoveryPosition || event.defaultMapCenter ? 14 : 5}
            mapId={mapsConfig.mapId}
            onClick={(e) => { if (!saving && e.detail.latLng) selectPosition(e.detail.latLng) }}
          >
            {position && <AdvancedMarker position={position} draggable={!saving} title="Position de découverte de l’événement"
              onDragEnd={(e) => { if (!saving && e.latLng) selectPosition(e.latLng.toJSON()) }}>
              <MapPin className="h-9 w-9 text-primary" />
            </AdvancedMarker>}
            <PositionCamera position={position} />
          </Map>
        </div>
      </div>}
      <p className="text-sm">{position ? 'Position choisie.' : 'Aucune position de découverte.'}</p>
      {position && <Button type="button" variant="outline" onClick={() => { setPosition(null); markChanged() }}>
        Supprimer la position
      </Button>}
      <p className="text-xs text-muted-foreground">Les changements et la suppression prennent effet avec « Enregistrer la découverte ».</p>
    </div>
    <div className="grid gap-4 sm:grid-cols-2">
      <div className="space-y-2">
        <Label htmlFor="discovery-type">Type</Label>
        <Select value={typeId || 'unset'} disabled={saving} onValueChange={(value) => { setTypeId(isCatalogId(eventDiscoveryTypes, value) ? value : ''); markChanged() }}>
          <SelectTrigger id="discovery-type"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="unset">Non renseigné</SelectItem>
            {eventDiscoveryTypes.map((type) => <SelectItem key={type.id} value={type.id}>{type.label}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-2">
        <Label htmlFor="discovery-category">Catégorie</Label>
        <Select value={categoryId || 'unset'} disabled={saving} onValueChange={(value) => { setCategoryId(isCatalogId(discoveryCategories, value) ? value : ''); markChanged() }}>
          <SelectTrigger id="discovery-category"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="unset">Non renseignée</SelectItem>
            {discoveryCategories.map((category) => <SelectItem key={category.id} value={category.id}>{category.label}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
    </div>
    <div className="space-y-3">
      <p className="text-sm font-medium">Caractéristiques</p>
      {discoveryTags.map((tag) => <div key={tag.id} className="flex items-center gap-2">
        <Checkbox id={`discovery-tag-${tag.id}`} checked={tags.includes(tag.id)} disabled={saving}
          onCheckedChange={(checked) => {
            setTags((current) => checked === true ? [...current.filter((id) => id !== tag.id), tag.id] : current.filter((id) => id !== tag.id))
            markChanged()
          }} />
        <Label htmlFor={`discovery-tag-${tag.id}`}>{tag.label}</Label>
      </div>)}
    </div>
    <Button type="button" disabled={saving || !dirty} onClick={() => void saveSettings()}>
      {saving ? 'Enregistrement…' : 'Enregistrer la découverte'}
    </Button>
  </fieldset>
}
