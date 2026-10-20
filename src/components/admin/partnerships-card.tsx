'use client';

import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/hooks/use-auth-user';
import { useToast } from '@/hooks/use-toast';
import { fetchAllEvents, fetchPois, setPoiSponsor } from '@/lib/data';
import { isSponsorActive } from '@/lib/sponsor-utils';
import type { AppEvent, POI, POISponsor } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from '@/components/ui/alert-dialog';

type SponsorDraft = {
  enabled: boolean;
  level: POISponsor['level'];
  priority: string;
  startDate: string;
  endDate: string;
};

const emptyDraft: SponsorDraft = {
  enabled: false, level: 'standard', priority: '0', startDate: '', endDate: '',
};

function dateForInput(value: unknown): string {
  const date = value instanceof Date ? value :
    value && typeof (value as { toDate?: unknown }).toDate === 'function'
      ? (value as { toDate: () => Date }).toDate()
      : null;
  if (!date || Number.isNaN(date.getTime())) return '';
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function draftFromPoi(poi?: POI): SponsorDraft {
  if (!poi?.sponsor) return { ...emptyDraft };
  return {
    enabled: poi.sponsor.enabled,
    level: poi.sponsor.level,
    priority: String(poi.sponsor.priority),
    startDate: dateForInput(poi.sponsor.startDate),
    endDate: dateForInput(poi.sponsor.endDate),
  };
}

function dateFromInput(value: string): Date | undefined {
  return value ? new Date(`${value}T00:00:00`) : undefined;
}

export function PartnershipsCard() {
  const { role } = useAuth();
  const { toast } = useToast();
  const [events, setEvents] = useState<AppEvent[]>([]);
  const [eventId, setEventId] = useState('');
  const [pois, setPois] = useState<POI[]>([]);
  const [poiId, setPoiId] = useState('');
  const [draft, setDraft] = useState<SponsorDraft>(emptyDraft);
  const [loadingEvents, setLoadingEvents] = useState(true);
  const [loadingPois, setLoadingPois] = useState(false);
  const [saving, setSaving] = useState(false);
  const selectedPoi = useMemo(() => pois.find((poi) => poi.id === poiId), [pois, poiId]);

  useEffect(() => {
    if (role !== 'owner') return;
    let active = true;
    void fetchAllEvents().then((items) => {
      if (active) setEvents(items.sort((a, b) => a.name.localeCompare(b.name, 'fr')));
    }).finally(() => {
      if (active) setLoadingEvents(false);
    });
    return () => { active = false; };
  }, [role]);

  useEffect(() => {
    setPoiId('');
    setPois([]);
    if (!eventId || role !== 'owner') return;
    let active = true;
    setLoadingPois(true);
    void fetchPois(eventId).then((items) => {
      if (active) setPois(items.sort((a, b) => a.title.localeCompare(b.title, 'fr')));
    }).finally(() => {
      if (active) setLoadingPois(false);
    });
    return () => { active = false; };
  }, [eventId, role]);

  useEffect(() => {
    setDraft(draftFromPoi(selectedPoi));
  }, [selectedPoi]);

  if (role !== 'owner') return null;

  const save = async () => {
    if (!selectedPoi || !eventId || saving) return;
    const priority = Number(draft.priority);
    const startDate = dateFromInput(draft.startDate);
    const endDate = dateFromInput(draft.endDate);
    if (!draft.priority.trim() || !Number.isFinite(priority) || priority < 0 ||
        (startDate && Number.isNaN(startDate.getTime())) ||
        (endDate && Number.isNaN(endDate.getTime())) ||
        (startDate && endDate && startDate > endDate)) {
      toast({ title: 'Paramètres invalides', description: 'Vérifiez la priorité et les dates du partenariat.', variant: 'destructive' });
      return;
    }

    const sponsor: POISponsor = { enabled: draft.enabled, level: draft.level, priority };
    if (startDate) sponsor.startDate = startDate;
    if (endDate) sponsor.endDate = endDate;

    setSaving(true);
    try {
      await setPoiSponsor(selectedPoi.id, eventId, sponsor);
      setPois((items) => items.map((poi) => poi.id === selectedPoi.id ? { ...poi, sponsor } : poi));
      toast({ title: 'Partenariat enregistré' });
    } catch {
      toast({ title: 'Enregistrement impossible', description: 'Le partenariat n’a pas été modifié.', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!selectedPoi || !eventId || saving) return;
    setSaving(true);
    try {
      await setPoiSponsor(selectedPoi.id, eventId, null);
      setPois((items) => items.map((poi) => {
        if (poi.id !== selectedPoi.id) return poi;
        const { sponsor: _sponsor, ...withoutSponsor } = poi;
        return withoutSponsor;
      }));
      toast({ title: 'Partenariat retiré' });
    } catch {
      toast({ title: 'Retrait impossible', description: 'Le partenariat a été conservé.', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="partnership-event">Événement</Label>
          <Select value={eventId} onValueChange={(value) => {
            setEventId(value);
            setPoiId('');
            setPois([]);
          }} disabled={loadingEvents || saving}>
            <SelectTrigger id="partnership-event"><SelectValue placeholder={loadingEvents ? 'Chargement…' : 'Choisir un événement'} /></SelectTrigger>
            <SelectContent>{events.map((event) => <SelectItem key={event.id} value={event.id}>{event.name}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="partnership-poi">Point</Label>
          <Select value={poiId} onValueChange={(value) => {
            setPoiId(value);
            setDraft(draftFromPoi(pois.find((poi) => poi.id === value)));
          }} disabled={!eventId || loadingPois || saving}>
            <SelectTrigger id="partnership-poi"><SelectValue placeholder={loadingPois ? 'Chargement…' : 'Choisir un Point'} /></SelectTrigger>
            <SelectContent>{pois.map((poi) => <SelectItem key={poi.id} value={poi.id}>{poi.title}</SelectItem>)}</SelectContent>
          </Select>
        </div>
      </div>

      {selectedPoi && (
        <div className="space-y-4 rounded-xl border p-4">
          <p className="text-sm text-muted-foreground">
            {selectedPoi.sponsor
              ? `Partenariat existant · ${isSponsorActive(selectedPoi) ? 'visible actuellement' : 'non visible actuellement'}`
              : 'Aucun partenariat enregistré pour ce Point.'}
          </p>
          <div className="flex items-center justify-between gap-4">
            <Label htmlFor="partnership-enabled">Afficher le partenariat</Label>
            <Switch id="partnership-enabled" checked={draft.enabled} onCheckedChange={(enabled) => setDraft((current) => ({ ...current, enabled }))} disabled={saving} />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="partnership-level">Niveau</Label>
              <Select value={draft.level} onValueChange={(level: POISponsor['level']) => setDraft((current) => ({ ...current, level }))} disabled={saving}>
                <SelectTrigger id="partnership-level"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="standard">Standard</SelectItem>
                  <SelectItem value="premium">Premium</SelectItem>
                  <SelectItem value="official">Officiel</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="partnership-priority">Priorité</Label>
              <Input id="partnership-priority" type="number" min="0" value={draft.priority} onChange={(event) => setDraft((current) => ({ ...current, priority: event.target.value }))} disabled={saving} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="partnership-start">Début (facultatif)</Label>
              <Input id="partnership-start" type="date" value={draft.startDate} onChange={(event) => setDraft((current) => ({ ...current, startDate: event.target.value }))} disabled={saving} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="partnership-end">Fin (facultatif)</Label>
              <Input id="partnership-end" type="date" value={draft.endDate} onChange={(event) => setDraft((current) => ({ ...current, endDate: event.target.value }))} disabled={saving} />
            </div>
          </div>
          <div className="flex flex-wrap gap-3">
            <Button type="button" onClick={() => void save()} disabled={saving}>Enregistrer le partenariat</Button>
            {selectedPoi.sponsor && (
              <AlertDialog>
                <AlertDialogTrigger asChild><Button type="button" variant="outline" disabled={saving}>Retirer définitivement</Button></AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Retirer ce partenariat ?</AlertDialogTitle>
                    <AlertDialogDescription>Le partenariat sera retiré du Point et de sa présentation publique. Le Point restera disponible.</AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Annuler</AlertDialogCancel>
                    <AlertDialogAction onClick={() => void remove()}>Retirer le partenariat</AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
