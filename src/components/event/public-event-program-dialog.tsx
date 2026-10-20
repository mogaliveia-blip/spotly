'use client'

import { useMemo, useState } from 'react'
import { ArrowLeft, Clock3, MapPin } from 'lucide-react'
import type { EventProgramItem, POILite } from '@/lib/types'
import { findProgramPoi, groupPublicProgram } from '@/lib/public-event-program'
import { Button } from '@/components/ui/button'
import {
  Dialog, DialogClose, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'

export function PublicEventProgramDialog({
  open, onOpenChange, items, pois, timezone, onSelectPoi,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  items: EventProgramItem[]
  pois: POILite[]
  timezone?: string
  onSelectPoi: (poiId: string) => void
}) {
  const groups = useMemo(() => groupPublicProgram(items), [items])
  const [selectedKey, setSelectedKey] = useState<string | null>(null)
  const activeGroup = groups.find((group) => group.key === selectedKey) ?? groups[0]
  const timed = activeGroup?.items.filter((item) => !!item.startTime) ?? []
  const untimed = activeGroup?.items.filter((item) => !item.startTime) ?? []

  return <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="flex h-[100dvh] max-h-[100dvh] max-w-none flex-col gap-0 overflow-hidden rounded-none p-0 sm:h-[min(90dvh,850px)] sm:max-w-2xl sm:rounded-2xl">
      <DialogHeader className="shrink-0 border-b px-5 pb-4 pt-[max(1.25rem,env(safe-area-inset-top))] pr-14 text-left sm:pt-5">
        <DialogClose asChild>
          <Button type="button" variant="ghost" size="sm" className="mb-3 w-fit gap-2 px-0">
            <ArrowLeft className="h-4 w-4" /> Retour à la carte
          </Button>
        </DialogClose>
        <DialogTitle className="text-2xl">Programme</DialogTitle>
        <DialogDescription>
          {timezone ? `Dates et heures locales de l’événement (${timezone}).` : 'Dates et heures locales de l’événement.'}
        </DialogDescription>
      </DialogHeader>

      {groups.length > 1 && <nav aria-label="Journées du programme" className="shrink-0 overflow-x-auto border-b px-4 py-3">
        <div className="flex w-max gap-2">
          {groups.map((group) => <Button key={group.key} type="button" size="sm"
            variant={activeGroup?.key === group.key ? 'default' : 'outline'}
            aria-pressed={activeGroup?.key === group.key}
            className="h-10 whitespace-nowrap rounded-full px-4"
            onClick={() => setSelectedKey(group.key)}>{group.label}</Button>)}
        </div>
      </nav>}

      <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-5 sm:px-6">
        {activeGroup && <section aria-labelledby="program-active-day" className="space-y-5">
          <h3 id="program-active-day" className="text-xl font-semibold capitalize">{activeGroup.label}</h3>

          {timed.map((item) => <ProgramItemCard key={item.id} item={item} poi={findProgramPoi(item, pois)} onSelectPoi={onSelectPoi} />)}

          {untimed.length > 0 && <div className="space-y-4">
            {activeGroup.key !== 'undated' && <h4 className="flex items-center gap-2 border-t pt-5 text-sm font-semibold text-muted-foreground">
              <Clock3 className="h-4 w-4" /> Horaire à venir
            </h4>}
            {untimed.map((item) => <ProgramItemCard key={item.id} item={item} poi={findProgramPoi(item, pois)} onSelectPoi={onSelectPoi} />)}
          </div>}
        </section>}
      </div>
    </DialogContent>
  </Dialog>
}

function ProgramItemCard({
  item, poi, onSelectPoi,
}: {
  item: EventProgramItem
  poi?: POILite
  onSelectPoi: (poiId: string) => void
}) {
  return <article className="rounded-2xl border bg-card p-4 shadow-sm sm:p-5">
    {item.startTime && <p className="mb-2 text-sm font-semibold text-primary">
      <time dateTime={item.startTime}>{item.startTime}</time>
      {item.endTime && <> – <time dateTime={item.endTime}>{item.endTime}</time></>}
    </p>}
    <h4 className="break-words text-lg font-semibold">{item.name}</h4>
    {item.description && <p className="mt-2 whitespace-pre-line break-words text-sm leading-relaxed text-muted-foreground">{item.description}</p>}
    {poi && <div className="mt-4 flex flex-wrap items-center gap-3 border-t pt-3 text-sm">
      <span className="flex min-w-0 items-center gap-1.5 text-muted-foreground"><MapPin className="h-4 w-4 shrink-0" /> {poi.title}</span>
      <Button type="button" variant="outline" size="sm" className="h-10 rounded-full" onClick={() => onSelectPoi(poi.id)}>
        Voir sur la carte
      </Button>
    </div>}
  </article>
}
