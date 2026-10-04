'use client'

import { useEffect, useState } from 'react'
import type { AppEvent } from '@/lib/types'
import { formatEventDateRange, getEventTimeState, isCalendarRange, isIanaTimezone } from '@/lib/event-time'
import { updateEventCalendarTime } from '@/lib/event-time-update'
import { useToast } from '@/hooks/use-toast'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

export function EventCalendarTimeForm({ event }: { event: AppEvent }) {
  const { toast } = useToast()
  const [startDay, setStartDay] = useState('')
  const [endDay, setEndDay] = useState('')
  const [timezone, setTimezone] = useState('')
  const [state, setState] = useState(getEventTimeState(event))
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    const nextState = getEventTimeState(event)
    setState(nextState)
    // Historical instants never prefill or implicitly confirm calendar dates.
    setStartDay(nextState === 'date' ? event.startDay! : '')
    setEndDay(nextState === 'date' ? event.endDay! : '')
    setTimezone(event.timezone ?? '')
  }, [event.id, event.timePrecision, event.startDay, event.endDay, event.timezone])

  async function saveTime() {
    if (!isCalendarRange(startDay, endDay) || !isIanaTimezone(timezone.trim())) {
      toast({ title: 'Période invalide', description: 'Vérifiez les deux dates et le fuseau horaire.', variant: 'destructive' })
      return
    }
    setSaving(true)
    try {
      const saved = await updateEventCalendarTime(event.id, {
        timePrecision: 'date', startDay, endDay, timezone: timezone.trim(),
      })
      setTimezone(saved.timezone)
      setState('date')
      toast({ title: 'Période enregistrée', description: 'Les dates de début et de fin sont des jours inclusifs, sans heures précises.' })
    } catch {
      toast({ title: 'Enregistrement impossible', description: 'La période n’a pas été modifiée. Vérifiez vos droits et réessayez.', variant: 'destructive' })
    } finally {
      setSaving(false)
    }
  }

  if (state === 'datetime') {
    return <div className="space-y-2 rounded-xl border p-4">
      <p className="font-medium">{formatEventDateRange(event)}</p>
      <p className="text-sm text-muted-foreground">Les heures précises sont conservées. Leur édition sera disponible dans une prochaine étape.</p>
    </div>
  }

  return <div className="space-y-4 rounded-xl border p-4">
    <p className="font-medium">Période de l’événement</p>
    {state !== 'date' && <p className="text-sm text-amber-700">
      Dates à vérifier : saisissez les jours et confirmez le fuseau. Les anciennes dates restent conservées jusqu’à cet enregistrement explicite.
    </p>}
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <div className="space-y-2">
        <Label htmlFor="event-start-day">Date de début</Label>
        <Input id="event-start-day" type="date" value={startDay} onChange={(e) => setStartDay(e.target.value)} disabled={saving} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="event-end-day">Date de fin (incluse)</Label>
        <Input id="event-end-day" type="date" value={endDay} onChange={(e) => setEndDay(e.target.value)} disabled={saving} />
      </div>
    </div>
    <div className="space-y-2">
      <Label htmlFor="event-timezone">Fuseau horaire</Label>
      <Input id="event-timezone" placeholder="Europe/Paris" value={timezone} onChange={(e) => setTimezone(e.target.value)} disabled={saving} />
    </div>
    <p className="text-sm text-muted-foreground">Cette période est renseignée en jours, sans heures précises.</p>
    <Button type="button" onClick={() => void saveTime()} disabled={saving || !isCalendarRange(startDay, endDay) || !isIanaTimezone(timezone.trim())}>
      {saving ? 'Enregistrement…' : 'Enregistrer la période'}
    </Button>
  </div>
}
