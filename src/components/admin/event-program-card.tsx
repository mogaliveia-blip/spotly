'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { Loader2, Plus, Trash2 } from 'lucide-react'
import {
  createProgramItem, deleteProgramItem, fetchPois, fetchProgramItemsForAdmin,
  fetchOwnEventMemberRole, removeProgramItemPhoto, replaceProgramItemPhoto,
  setProgramItemPublished, updateProgramItem,
} from '@/lib/data'
import {
  programDraftFromItem, programFormError, programPatchFromDraft,
  type ProgramItemDraft,
} from '@/lib/event-program-form'
import { PROGRAM_DESCRIPTION_MAX_LENGTH, PROGRAM_NAME_MAX_LENGTH, PROGRAM_SORT_ORDER_MAX } from '@/lib/event-program'
import { validateProgramPhotoFile } from '@/lib/program-photo'
import type { EventProgramItem, POI } from '@/lib/types'
import { useAuth } from '@/hooks/use-auth-user'
import { ProgramPhoto } from '@/components/event/program-photo'
import { useToast } from '@/hooks/use-toast'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'

function sortedItems(items: EventProgramItem[]): EventProgramItem[] {
  return [...items].sort((a, b) => a.sortOrder - b.sortOrder ||
    (a.day ?? '9999').localeCompare(b.day ?? '9999') ||
    (a.startTime ?? '99:99').localeCompare(b.startTime ?? '99:99') ||
    a.name.localeCompare(b.name, 'fr'))
}

export function EventProgramCard({ eventId, timezone, photoEventPublic }: {
  eventId: string; timezone?: string; photoEventPublic: boolean
}) {
  const { toast } = useToast()
  const { user } = useAuth()
  const [items, setItems] = useState<EventProgramItem[]>([])
  const [pois, setPois] = useState<POI[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)
  const [busy, setBusy] = useState(false)
  const [newName, setNewName] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [draft, setDraft] = useState<ProgramItemDraft | null>(null)
  const [formError, setFormError] = useState('')
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [deleteError, setDeleteError] = useState('')
  const [photoAdmin, setPhotoAdmin] = useState(false)
  const [photoAccessLoading, setPhotoAccessLoading] = useState(true)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [filePreview, setFilePreview] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const selected = items.find((item) => item.id === selectedId)
  const deleteTarget = items.find((item) => item.id === deleteId)
  const orderedItems = useMemo(() => sortedItems(items), [items])
  const dirty = (() => {
    if (!selected || !draft) return false
    try { return Object.keys(programPatchFromDraft(selected, draft, eventId)).length > 0 }
    catch { return true }
  })()

  useEffect(() => {
    let active = true
    setLoading(true)
    setLoadError(false)
    setItems([])
    setPois([])
    setSelectedId(null)
    setDraft(null)
    setSelectedFile(null)
    void Promise.all([fetchProgramItemsForAdmin(eventId), fetchPois(eventId, { throwOnReadError: true })])
      .then(([programItems, eventPois]) => {
        if (!active) return
        setItems(programItems)
        setPois(eventPois.sort((a, b) => a.title.localeCompare(b.title, 'fr')))
      })
      .catch(() => { if (active) setLoadError(true) })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [eventId])

  useEffect(() => {
    let active = true
    setPhotoAdmin(false)
    setPhotoAccessLoading(!!user?.uid)
    if (user?.uid) {
      void fetchOwnEventMemberRole(eventId, user.uid)
        .then((role) => { if (active) setPhotoAdmin(role === 'admin') })
        .catch(() => { if (active) setPhotoAdmin(false) })
        .finally(() => { if (active) setPhotoAccessLoading(false) })
    }
    return () => { active = false }
  }, [eventId, user?.uid])

  useEffect(() => {
    if (!selectedFile) { setFilePreview(null); return }
    const url = URL.createObjectURL(selectedFile)
    setFilePreview(url)
    return () => URL.revokeObjectURL(url)
  }, [selectedFile])

  function clearPhotoSelection() {
    setSelectedFile(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  async function reload() {
    setLoading(true)
    setLoadError(false)
    try {
      const [programItems, eventPois] = await Promise.all([
        fetchProgramItemsForAdmin(eventId), fetchPois(eventId, { throwOnReadError: true }),
      ])
      setItems(programItems)
      setPois(eventPois.sort((a, b) => a.title.localeCompare(b.title, 'fr')))
      setSelectedId(null)
      setDraft(null)
    } catch {
      setLoadError(true)
    } finally {
      setLoading(false)
    }
  }

  async function addItem(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const name = newName.trim()
    if (!name || busy) return
    setBusy(true)
    setFormError('')
    try {
      const id = await createProgramItem(eventId, { name })
      const created: EventProgramItem = { id, name, published: false, sortOrder: 0 }
      setItems((current) => [...current, created])
      setSelectedId(id)
      setDraft(programDraftFromItem(created))
      setNewName('')
      toast({ title: 'Prestation enregistrée en brouillon' })
    } catch {
      setFormError('Création impossible. Vérifiez vos droits ou votre connexion, puis réessayez.')
    } finally {
      setBusy(false)
    }
  }

  function chooseItem(item: EventProgramItem) {
    if (busy || (dirty && !window.confirm('Abandonner les modifications non enregistrées ?'))) return
    setSelectedId(item.id)
    setDraft(programDraftFromItem(item))
    setFormError('')
    clearPhotoSelection()
  }

  async function saveItem(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!selected || !draft || busy) return
    const explanation = programFormError(draft)
    if (explanation) { setFormError(explanation); return }
    let patch: ReturnType<typeof programPatchFromDraft>
    try {
      patch = programPatchFromDraft(selected, draft, eventId)
    } catch (error) {
      setFormError((error as Error).message === 'PROGRAM_INVALID_SORT_ORDER'
        ? 'L’ordre doit être un nombre entier.'
        : 'Vérifiez le nom, les dates, les horaires et les limites des champs.')
      return
    }
    if (!Object.keys(patch).length) return
    setBusy(true)
    setFormError('')
    try {
      await updateProgramItem(eventId, selected.id, patch)
      const updated = { ...selected, ...patch } as EventProgramItem
      for (const key of ['description', 'day', 'startTime', 'endTime', 'poiId'] as const) {
        if (patch[key] === null) delete updated[key]
      }
      setItems((current) => current.map((item) => item.id === selected.id ? updated : item))
      setDraft(programDraftFromItem(updated))
      toast({ title: 'Prestation enregistrée' })
    } catch {
      setFormError('Enregistrement impossible. La prestation n’a pas été modifiée. Réessayez.')
    } finally {
      setBusy(false)
    }
  }

  async function togglePublished(item: EventProgramItem) {
    if (busy || (item.id === selectedId && dirty)) return
    setBusy(true)
    setFormError('')
    try {
      await setProgramItemPublished(eventId, item.id, !item.published)
      setItems((current) => current.map((entry) => entry.id === item.id
        ? { ...entry, published: !item.published } : entry))
      if (item.published && selectedId === item.id) clearPhotoSelection()
      toast({ title: item.published ? 'Prestation dépubliée' : 'Prestation publiée' })
    } catch {
      setFormError('Changement de publication impossible. Vérifiez vos droits ou votre connexion.')
    } finally {
      setBusy(false)
    }
  }

  async function removeItem() {
    if (!deleteId || busy) return
    const id = deleteId
    setBusy(true)
    setDeleteError('')
    try {
      const result = await deleteProgramItem(eventId, id)
      setItems((current) => current.filter((item) => item.id !== id))
      if (selectedId === id) { setSelectedId(null); setDraft(null); clearPhotoSelection() }
      setDeleteId(null)
      toast(result.cleanupComplete
        ? { title: 'Prestation supprimée' }
        : { title: 'Prestation supprimée, nettoyage de la photo incomplet',
            description: 'Le fichier restant n’est plus lisible depuis le programme. Signalez ce nettoyage incomplet.', variant: 'destructive' })
    } catch {
      setDeleteError('Suppression impossible. La prestation est conservée. Réessayez.')
    } finally {
      setBusy(false)
    }
  }

  async function savePhoto() {
    if (!selected || !selectedFile || !photoEventPublic || !photoAdmin || busy) return
    setBusy(true)
    setFormError('')
    try {
      const result = await replaceProgramItemPhoto(eventId, selected, selectedFile)
      setItems((current) => current.map((item) => item.id === selected.id
        ? { ...item, photoPath: result.photoPath } : item))
      clearPhotoSelection()
      toast(result.cleanupComplete
        ? { title: 'Photo enregistrée' }
        : { title: 'Photo enregistrée, ancien fichier non nettoyé', variant: 'destructive' })
    } catch (error) {
      setFormError((error as Error).message === 'PROGRAM_PHOTO_UNLINKED_UPLOAD'
        ? 'Photo non associée à la prestation ; le nettoyage du transfert a échoué. Signalez cet incident.'
        : 'Photo non enregistrée. Vérifiez la publication, vos droits ou votre connexion, puis réessayez.')
    } finally {
      setBusy(false)
    }
  }

  async function removePhoto() {
    if (!selected?.photoPath || !photoEventPublic || !photoAdmin || busy) return
    setBusy(true)
    setFormError('')
    try {
      const result = await removeProgramItemPhoto(eventId, selected)
      setItems((current) => current.map((item) => item.id === selected.id
        ? { ...item, photoPath: undefined } : item))
      clearPhotoSelection()
      toast(result.cleanupComplete
        ? { title: 'Photo retirée' }
        : { title: 'Photo retirée, fichier non nettoyé',
            description: 'Le fichier n’est plus lisible depuis le programme. Signalez ce nettoyage incomplet.', variant: 'destructive' })
    } catch {
      setFormError('Retrait impossible. La photo reste associée à la prestation.')
    } finally {
      setBusy(false)
    }
  }

  function field<K extends keyof ProgramItemDraft>(key: K, value: ProgramItemDraft[K]) {
    setDraft((current) => current ? { ...current, [key]: value } : current)
    setFormError('')
  }

  if (loading) return <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Chargement du programme…</p>
  if (loadError) return <div className="space-y-3">
    <p role="alert" className="text-sm text-destructive">Le programme n’a pas pu être chargé. Vérifiez vos droits ou votre connexion.</p>
    <Button type="button" variant="outline" onClick={() => void reload()}>Réessayer</Button>
  </div>

  return <div className="space-y-6">
    <form onSubmit={(event) => void addItem(event)} className="flex flex-col gap-3 rounded-xl border bg-muted/20 p-4 sm:flex-row sm:items-end">
      <div className="min-w-0 flex-1 space-y-2">
        <Label htmlFor="program-new-name">Ajouter une prestation</Label>
        <Input id="program-new-name" value={newName} onChange={(event) => setNewName(event.target.value)}
          placeholder="Nom de l’artiste ou de la prestation" maxLength={PROGRAM_NAME_MAX_LENGTH} disabled={busy} />
      </div>
      <Button type="submit" disabled={busy || !newName.trim()}><Plus className="mr-2 h-4 w-4" />Créer un brouillon</Button>
    </form>

    {formError && <p role="alert" className="text-sm text-destructive">{formError}</p>}

    {items.length === 0 ? <div className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">
      Aucune prestation pour le moment. Ajoutez un nom pour créer votre premier brouillon.
    </div> : <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
      <div className="min-w-0 space-y-2" aria-label="Prestations du programme">
        {orderedItems.map((item) => {
          const poi = pois.find((point) => point.id === item.poiId)
          return <div key={item.id} className={`rounded-xl border p-4 ${selectedId === item.id ? 'border-primary bg-primary/5' : ''}`}>
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="break-words font-medium">{item.name}</p>
                <p className="text-sm text-muted-foreground">
                  {item.day ?? 'Programmation à préciser'}{item.startTime ? ` · ${item.startTime}${item.endTime ? `–${item.endTime}` : ''}` : item.day ? ' · Horaire à venir' : ''}
                </p>
                {item.poiId && <p className="text-xs text-muted-foreground">{poi?.title ?? 'Point associé supprimé'}</p>}
              </div>
              <Badge variant={item.published ? 'default' : 'secondary'}>{item.published ? 'Publiée' : 'Brouillon'}</Badge>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => chooseItem(item)}>Modifier</Button>
              <Button type="button" size="sm" variant="outline" disabled={busy || (selectedId === item.id && dirty)}
                onClick={() => void togglePublished(item)}>{item.published ? 'Dépublier' : 'Publier'}</Button>
              <Button type="button" size="sm" variant="ghost" disabled={busy} aria-label={`Supprimer ${item.name}`}
                onClick={() => { setDeleteId(item.id); setDeleteError('') }}><Trash2 className="h-4 w-4" /></Button>
            </div>
          </div>
        })}
      </div>

      {selected && draft && <form onSubmit={(event) => void saveItem(event)} className="min-w-0 space-y-4 rounded-xl border p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="font-semibold">Modifier la prestation</h3>
          <Badge variant={selected.published ? 'default' : 'secondary'}>{selected.published ? 'Publiée' : 'Brouillon'}</Badge>
        </div>
        <div className="space-y-2"><Label htmlFor="program-name">Nom *</Label>
          <Input id="program-name" value={draft.name} onChange={(event) => field('name', event.target.value)} maxLength={PROGRAM_NAME_MAX_LENGTH} disabled={busy} required />
        </div>
        <div className="space-y-2"><Label htmlFor="program-description">Description</Label>
          <Textarea id="program-description" value={draft.description} onChange={(event) => field('description', event.target.value)}
            maxLength={PROGRAM_DESCRIPTION_MAX_LENGTH} rows={3} disabled={busy} />
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="space-y-2"><Label htmlFor="program-day">Jour</Label>
            <Input id="program-day" type="date" value={draft.day} onChange={(event) => field('day', event.target.value)} disabled={busy} />
          </div>
          <div className="space-y-2"><Label htmlFor="program-start">Début</Label>
            <Input id="program-start" type="time" value={draft.startTime} onChange={(event) => field('startTime', event.target.value)} disabled={busy} />
          </div>
          <div className="space-y-2"><Label htmlFor="program-end">Fin</Label>
            <Input id="program-end" type="time" value={draft.endTime} onChange={(event) => field('endTime', event.target.value)} disabled={busy} />
          </div>
        </div>
        <p className="text-xs text-muted-foreground">Horaires locaux de l’événement{timezone ? ` (${timezone})` : ''}. Laissez les champs vides si la programmation reste à préciser.</p>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2"><Label htmlFor="program-poi">Point sur la carte (facultatif)</Label>
            <Select value={draft.poiId || '__none__'} onValueChange={(value) => field('poiId', value === '__none__' ? '' : value)} disabled={busy}>
              <SelectTrigger id="program-poi"><SelectValue placeholder="Aucun point" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">Aucun point</SelectItem>
                {draft.poiId && !pois.some((poi) => poi.id === draft.poiId) &&
                  <SelectItem value={draft.poiId}>Point associé supprimé</SelectItem>}
                {pois.map((poi) => <SelectItem key={poi.id} value={poi.id}>{poi.title}</SelectItem>)}
              </SelectContent>
            </Select>
            {draft.poiId && !pois.some((poi) => poi.id === draft.poiId) &&
              <p className="text-xs text-amber-700">Ce point n’existe plus. Vous pouvez retirer ou remplacer l’association.</p>}
          </div>
          <div className="space-y-2"><Label htmlFor="program-order">Ordre d’affichage</Label>
            <Input id="program-order" type="number" step="1" min={-PROGRAM_SORT_ORDER_MAX} max={PROGRAM_SORT_ORDER_MAX}
              value={draft.sortOrder} onChange={(event) => field('sortOrder', event.target.value)} disabled={busy} />
          </div>
        </div>
        {photoEventPublic && selected.published && photoAdmin ? <div className="space-y-3 rounded-xl border p-4">
          <Label htmlFor="program-photo">Photo de la prestation (facultative)</Label>
          <div className="flex flex-wrap items-start gap-4">
            {selectedFile && filePreview
              ? <div className="h-24 w-24 overflow-hidden rounded-xl bg-muted"><img src={filePreview} alt="Aperçu de la photo choisie" className="h-full w-full object-cover" /></div>
              : <ProgramPhoto eventId={eventId} itemId={selected.id} path={selected.photoPath}
                  alt={`Photo de ${selected.name}`} className="h-24 w-24" />}
            <div className="min-w-0 flex-1 space-y-2">
              <Input ref={fileInputRef} id="program-photo" type="file" accept="image/jpeg,image/png,image/webp"
                disabled={busy} onChange={(event) => {
                  const file = event.target.files?.[0] ?? null
                  if (!file) { clearPhotoSelection(); return }
                  try { validateProgramPhotoFile(file); setSelectedFile(file); setFormError('') }
                  catch {
                    clearPhotoSelection()
                    setFormError('Choisissez une image JPEG, PNG ou WebP de 2 Mo maximum.')
                  }
                }} />
              <p className="text-xs text-muted-foreground">JPEG, PNG ou WebP · 2 Mo maximum. La photo peut être ajoutée après publication.</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="button" size="sm" disabled={busy || !selectedFile} onClick={() => void savePhoto()}>
              {busy ? 'Transfert…' : selected.photoPath ? 'Remplacer la photo' : 'Ajouter la photo'}
            </Button>
            {selected.photoPath && <Button type="button" size="sm" variant="outline" disabled={busy}
              onClick={() => void removePhoto()}>Retirer la photo</Button>}
          </div>
        </div> : <p className="text-xs text-muted-foreground">
          {!photoEventPublic ? 'Les photos du programme sont réservées aux événements publics.'
            : !selected.published ? 'Publiez la prestation avant d’ajouter une photo.'
              : photoAccessLoading ? 'Vérification des droits photo…'
                : 'La gestion des photos est réservée aux administrateurs membres de cet événement.'}
        </p>}
        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" disabled={busy || !dirty}>{busy ? 'Enregistrement…' : 'Enregistrer'}</Button>
          {dirty && <span className="text-xs text-muted-foreground">Enregistrez avant de publier.</span>}
        </div>
      </form>}
    </div>}

    <AlertDialog open={!!deleteId} onOpenChange={(open) => { if (!open && !busy) setDeleteId(null) }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Supprimer cette prestation ?</AlertDialogTitle>
          <AlertDialogDescription>« {deleteTarget?.name} » sera supprimée du programme. Cette action est définitive.</AlertDialogDescription>
        </AlertDialogHeader>
        {deleteError && <p role="alert" className="text-sm text-destructive">{deleteError}</p>}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy}>Annuler</AlertDialogCancel>
          <AlertDialogAction disabled={busy} onClick={(event) => { event.preventDefault(); void removeItem() }}>
            {busy ? 'Suppression…' : 'Supprimer'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </div>
}
