'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { doc, getDocFromServer } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { discoveryCategories } from '@/lib/event-discovery';
import { discoveryDatatourismeHref } from '@/lib/discovery-return';
import { datatourismePeriodLabel, datatourismeSourceUpdatedLabel } from '@/lib/datatourisme-display';
import { externalProjectionResultDto } from '../../../../../functions/src/discovery-search-contract';
import { externalOccurrenceFinished } from '../../../../../functions/src/discovery-time';
import type { ExternalDiscoveryResultDto } from '../../../../../functions/src/discovery-search-contract';

/** Reads only the public projection; no private DATAtourisme source or native Event document. */
export default function DatatourismeDiscoveryDetail() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const [event, setEvent] = useState<ExternalDiscoveryResultDto | null>(null);
  const [status, setStatus] = useState<'loading' | 'unavailable' | 'ready'>('loading');
  const [clock, setClock] = useState(() => new Date());

  useEffect(() => {
    let active = true;
    setStatus('loading');
    setEvent(null);
    try { discoveryDatatourismeHref(id); } catch {
      setStatus('unavailable');
      return;
    }
    void getDocFromServer(doc(db, 'discovery_public', id)).then((snapshot) => {
      if (!active) return;
      if (!snapshot.exists()) { setStatus('unavailable'); return; }
      try {
        const dto = externalProjectionResultDto(id, snapshot.data());
        setClock(new Date());
        setEvent(dto);
        setStatus('ready');
      } catch { setStatus('unavailable'); }
    }).catch(() => { if (active) setStatus('unavailable'); });
    return () => { active = false; };
  }, [id]);

  useEffect(() => {
    if (!event || externalOccurrenceFinished(event, clock)) return;
    const endMillis = event.windowEndAt.seconds * 1000 + Math.floor(event.windowEndAt.nanoseconds / 1_000_000);
    const delay = Math.max(1, Math.min(endMillis - Date.now() + 1, 86_400_000));
    const timer = window.setTimeout(() => setClock(new Date()), delay);
    return () => window.clearTimeout(timer);
  }, [event, clock]);

  const category = event && discoveryCategories.find((item) => item.id === event.categoryId);
  const ended = event && externalOccurrenceFinished(event, clock);
  return <main className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
    <Link href="/discovery" className="text-sm font-medium text-primary underline">Retour à la découverte</Link>
    {status === 'loading' && <p className="mt-8" role="status">Chargement de l’événement…</p>}
    {status === 'unavailable' && <p className="mt-8" role="status">Cette fiche n’est pas disponible publiquement.</p>}
    {status === 'ready' && event && <article className="mt-8 space-y-4">
      {ended && <p className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm font-medium text-amber-950" role="status">
        Cette occurrence est terminée et n’est plus une sortie disponible. Les dates de la source peuvent être actualisées.
      </p>}
      <p className="text-sm font-medium text-teal-800">Événement externe · DATAtourisme</p>
      <h1 className="text-3xl font-bold">{event.title}</h1>
      <p>{category?.label ?? 'Autre'}{event.editorialType ? ` · ${event.editorialType}` : ''}</p>
      <p>{datatourismePeriodLabel(event)}</p>
      <section aria-label="Lieu" className="rounded-xl border bg-card p-4">
        <h2 className="font-semibold">Lieu</h2>
        {event.venueName && <p className="mt-2">{event.venueName}</p>}
        {event.address && <p>Adresse indiquée par DATAtourisme : {event.address}</p>}
        <p>{event.city} ({event.department})</p>
      </section>
      {event.description && <p className="whitespace-pre-line leading-relaxed">{event.description}</p>}
      <p className="text-sm text-muted-foreground">Source : DATAtourisme{event.attribution.producer ? ` · Producteur : ${event.attribution.producer}` : ''}
        {event.attribution.publisher ? ` · Éditeur : ${event.attribution.publisher}` : ''}
        {event.sourceUpdatedAt ? ` · Donnée mise à jour le ${datatourismeSourceUpdatedLabel(event.sourceUpdatedAt)}` : ''}</p>
      {event.sourceUrl && <a href={event.sourceUrl} target="_blank" rel="noopener noreferrer"
        className="inline-block text-sm font-medium text-primary underline">Voir la fiche source</a>}
    </article>}
  </main>;
}
