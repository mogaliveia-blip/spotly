'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { APILoadingStatus, useApiLoadingStatus } from '@vis.gl/react-google-maps';
import { ArrowLeft, Crosshair, Loader2, MapPin, Search } from 'lucide-react';
import { DiscoveryMap } from '@/components/discovery/discovery-map';
import { PoiLocationSearch } from '@/components/poi/poi-location-search';
import { Button } from '@/components/ui/button';
import { useGeolocation } from '@/providers/geolocation-provider';
import { mapsConfig } from '@/lib/firebase-config';
import { searchDiscovery } from '@/lib/discovery-search';
import type { DiscoveryResult, DiscoverySearchResult } from '@/lib/discovery-search-dto';
import {
  DEFAULT_DISCOVERY_CAMERA, DISCOVERY_SESSION_KEY, DiscoveryLocationIntent, focusDiscoveryResult,
  isDiscoveryAreaTooLarge, parseDiscoverySession,
} from '@/lib/discovery-geography';
import type { DiscoveryCamera, DiscoveryContext, DiscoverySession, DiscoverySource } from '@/lib/discovery-geography';
import type { DiscoveryArea } from '../../../functions/src/discovery-search-contract';

type BoundsArea = Extract<DiscoveryArea, { kind: 'bounds' }>;
type SearchStatus = 'idle' | 'loading' | 'success' | 'error' | 'too-large';

const initialSession: DiscoverySession = {
  context: null, camera: DEFAULT_DISCOVERY_CAMERA, pendingBounds: null,
};

const sourceLabel: Record<DiscoverySource, string> = {
  gps: 'Autour de ma position', place: 'Autour du lieu recherché', map: 'Dans la zone affichée',
};

function EventResult({ result, selected, onSelect }: {
  result: DiscoveryResult;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <article className={`rounded-xl border bg-card p-4 shadow-sm ${selected ? 'border-primary ring-1 ring-primary' : 'border-border'}`}>
      <button type="button" onClick={onSelect} className="w-full text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" aria-label={`Voir ${result.title} sur la carte`}>
        <h3 className="font-semibold leading-snug">{result.title}</h3>
        {result.distanceMeters !== undefined && <p className="mt-1 text-sm text-muted-foreground">À {Math.round(result.distanceMeters / 1000)} km du centre</p>}
      </button>
      <Button asChild size="sm" variant="outline" className="mt-3 w-full">
        <Link href={`/${result.slug}/dashboard`}>Découvrir l’événement</Link>
      </Button>
    </article>
  );
}

export function DiscoveryClient() {
  const { userLocation, requestPosition } = useGeolocation();
  const mapsStatus = useApiLoadingStatus();
  const mapUnavailable = !mapsConfig.apiKey || mapsConfig.apiKey === 'invalid_key' ||
    mapsStatus === APILoadingStatus.FAILED || mapsStatus === APILoadingStatus.AUTH_FAILURE;
  const [hydrated, setHydrated] = useState(false);
  const [session, setSession] = useState<DiscoverySession>(initialSession);
  const [cameraRequest, setCameraRequest] = useState<DiscoveryCamera & { sequence: number }>({
    ...DEFAULT_DISCOVERY_CAMERA, sequence: 0,
  });
  const [mapSearchSequence, setMapSearchSequence] = useState(0);
  const [status, setStatus] = useState<SearchStatus>('idle');
  const [message, setMessage] = useState<string | null>(null);
  const [searchResult, setSearchResult] = useState<DiscoverySearchResult | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [gpsPending, setGpsPending] = useState(false);
  const requestSequenceRef = useRef(0);
  const locationIntentRef = useRef<DiscoveryLocationIntent | null>(null);
  locationIntentRef.current ??= new DiscoveryLocationIntent();
  const locationIntent = locationIntentRef.current;
  const mapSectionRef = useRef<HTMLElement | null>(null);

  const runSearch = useCallback(async (area: DiscoveryArea) => {
    const sequence = ++requestSequenceRef.current;
    setStatus('loading');
    setMessage(null);
    setSearchResult(null);
    setSelectedId(null);
    try {
      // D2 fixes the period to D1's exact "today" variant; later stages own the WHEN controls.
      const response = await searchDiscovery({ area, when: { kind: 'today' } });
      if (sequence !== requestSequenceRef.current) return;
      setSearchResult(response);
      setStatus('success');
    } catch (error) {
      if (sequence !== requestSequenceRef.current) return;
      if (isDiscoveryAreaTooLarge(error)) {
        setStatus('too-large');
        setMessage('La zone affichée est trop vaste. Rapprochez la carte, puis relancez la recherche.');
      } else {
        setStatus('error');
        setMessage('La recherche est momentanément indisponible. Réessayez.');
      }
    }
  }, []);

  useEffect(() => {
    let restored: DiscoverySession | null = null;
    try { restored = parseDiscoverySession(window.sessionStorage.getItem(DISCOVERY_SESSION_KEY)); } catch { /* Storage may be disabled. */ }
    if (restored) {
      setSession(restored);
      setCameraRequest({ ...restored.camera, sequence: 0 });
      if (restored.context && !restored.pendingBounds) void runSearch(restored.context.area);
    }
    setHydrated(true);
  }, [runSearch]);

  useEffect(() => {
    if (!hydrated) return;
    try { window.sessionStorage.setItem(DISCOVERY_SESSION_KEY, JSON.stringify(session)); } catch { /* Memory state still works. */ }
  }, [hydrated, session]);

  const chooseRadius = useCallback((source: 'gps' | 'place', center: { lat: number; lng: number }) => {
    const camera = { center, zoom: 11 };
    const area: DiscoveryArea = { kind: 'radius', center };
    setSession({ context: { source, area }, camera, pendingBounds: null });
    setCameraRequest((previous) => ({ ...camera, sequence: previous.sequence + 1 }));
    void runSearch(area);
  }, [runSearch]);

  const chooseCurrentLocation = async () => {
    if (userLocation) {
      locationIntent.invalidate();
      chooseRadius('gps', userLocation);
      return;
    }
    setGpsPending(true);
    setMessage(null);
    const current = await locationIntent.requestGps(requestPosition,
      (position) => chooseRadius('gps', position),
      (error) => setMessage((error as { code?: number } | null)?.code === 1
        ? 'La géolocalisation est refusée. Recherchez un lieu ou déplacez la carte.'
        : 'Votre position est indisponible. Recherchez un lieu ou déplacez la carte.'),
    );
    if (current) setGpsPending(false);
  };

  const choosePlace = (center: DiscoveryCamera['center']) => {
    locationIntent.invalidate();
    setGpsPending(false);
    chooseRadius('place', center);
  };

  const selectResult = (result: DiscoveryResult) => {
    locationIntent.invalidate();
    setGpsPending(false);
    setSelectedId(result.id);
    const nextSession = focusDiscoveryResult(session, result.position);
    setSession(nextSession);
    setCameraRequest((previous) => ({ ...nextSession.camera, sequence: previous.sequence + 1 }));
    if (window.matchMedia('(max-width: 639px)').matches) {
      mapSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  };

  const onManualViewport = useCallback((bounds: BoundsArea, camera: DiscoveryCamera) => {
    setSession((previous) => ({ ...previous, camera, pendingBounds: bounds }));
  }, []);

  const onManualMoveStart = useCallback(() => {
    // A new user intent invalidates a search before its old response can be rendered.
    locationIntent.invalidate();
    setGpsPending(false);
    requestSequenceRef.current += 1;
    setSearchResult(null);
    setSelectedId(null);
    setStatus('idle');
    setMessage(null);
  }, [locationIntent]);

  const searchVisibleArea = () => {
    if (!session.pendingBounds) return;
    const area = session.pendingBounds;
    const context: DiscoveryContext = { source: 'map', area };
    setMapSearchSequence((previous) => previous + 1);
    setSession((previous) => ({ ...previous, context, pendingBounds: null }));
    void runSearch(area);
  };

  const retrySearch = () => {
    if (session.pendingBounds) searchVisibleArea();
    else if (session.context) void runSearch(session.context.area);
  };

  const results = searchResult?.results ?? [];
  const selectedResult = results.find((result) => result.id === selectedId) ?? null;

  return (
    <main className="min-h-screen bg-background">
      <div className="mx-auto max-w-7xl px-4 py-5 sm:px-6 sm:py-8">
        <Link href="/" className="mb-5 inline-flex items-center gap-2 text-sm font-medium text-primary hover:underline">
          <ArrowLeft className="h-4 w-4" /> Retour au portail
        </Link>
        <div className="mb-5">
          <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">Carte Découverte</h1>
          <p className="mt-2 text-muted-foreground">Choisissez où chercher les événements d’aujourd’hui.</p>
        </div>

        <div className="grid gap-5 lg:grid-cols-[320px_minmax(0,1fr)]">
          <section className="rounded-2xl border bg-card p-4 shadow-sm sm:p-5" aria-labelledby="where-heading">
            <h2 id="where-heading" className="text-xl font-semibold">OÙ ?</h2>
            <p className="mt-1 text-sm text-muted-foreground">Autour de vous, d’un lieu recherché ou dans la zone de la carte.</p>
            <Button type="button" onClick={() => void chooseCurrentLocation()} className="mt-5 w-full" disabled={!hydrated || gpsPending}>
              {gpsPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Crosshair className="h-4 w-4" />}
              {gpsPending ? 'Recherche de votre position…' : 'Utiliser ma position'}
            </Button>
            <div className="mt-5">
              <label className="mb-2 block text-sm font-medium">Rechercher un lieu</label>
              {mapUnavailable ? <p className="text-sm text-muted-foreground">La recherche de lieu et la carte sont indisponibles.</p> :
                <PoiLocationSearch locationBias={session.context?.area.kind === 'radius' ? session.context.area.center : null}
                  onPlaceSelected={choosePlace} />}
            </div>
            <p className="mt-4 text-sm text-muted-foreground">Vous pouvez aussi déplacer ou zoomer la carte, puis lancer la recherche dans la zone affichée.</p>
            {session.pendingBounds && (
              <Button type="button" onClick={searchVisibleArea} className="mt-4 w-full">
                <Search className="h-4 w-4" /> Rechercher dans cette zone
              </Button>
            )}
            <div className="mt-5 border-t pt-4 text-sm">
              <span className="font-medium">QUAND ?</span> Aujourd’hui
            </div>
            {session.context && !session.pendingBounds && <p className="mt-3 text-sm text-primary">{sourceLabel[session.context.source]}</p>}
          </section>

          <section ref={mapSectionRef} aria-label="Carte des événements" className="relative h-[48vh] min-h-[330px] overflow-hidden rounded-2xl border bg-muted shadow-sm sm:h-[560px]">
            {!hydrated ? (
              <div className="flex h-full items-center justify-center gap-2 text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin" /> Chargement de la carte…</div>
            ) : mapUnavailable ? (
              <div className="flex h-full items-center justify-center p-6 text-center text-muted-foreground">Carte indisponible. La recherche par position reste possible.</div>
            ) : mapsStatus === APILoadingStatus.LOADING || mapsStatus === APILoadingStatus.NOT_LOADED ? (
              <div className="flex h-full items-center justify-center gap-2 text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin" /> Chargement de la carte…</div>
            ) : (
              <DiscoveryMap camera={session.camera} cameraRequest={cameraRequest} searchSequence={mapSearchSequence} results={results}
                selectedId={selectedId} onSelect={setSelectedId} onManualMoveStart={onManualMoveStart}
                onManualViewport={onManualViewport} />
            )}
            {selectedResult && !mapUnavailable && (
              <div className="absolute bottom-3 left-3 right-3 rounded-xl border bg-card/95 p-3 shadow-lg backdrop-blur-sm sm:right-auto sm:w-72">
                <p className="font-semibold">{selectedResult.title}</p>
                <Link href={`/${selectedResult.slug}/dashboard`} className="mt-2 inline-block text-sm font-medium text-primary underline">Découvrir l’événement</Link>
              </div>
            )}
          </section>
        </div>

        <section className="mt-6" aria-labelledby="results-heading" aria-live="polite">
          <h2 id="results-heading" className="text-xl font-semibold">Événements</h2>
          {session.pendingBounds && <p className="mt-2 text-sm text-muted-foreground">La carte a changé. Lancez « Rechercher dans cette zone » pour afficher les résultats ici.</p>}
          {!session.pendingBounds && status === 'idle' && <p className="mt-2 text-sm text-muted-foreground">Choisissez un lieu ou utilisez votre position pour commencer.</p>}
          {status === 'loading' && <p className="mt-3 flex items-center gap-2 text-sm"><Loader2 className="h-4 w-4 animate-spin" /> Recherche des événements…</p>}
          {message && <p role="alert" className="mt-3 rounded-xl border bg-card p-4 text-sm">{message}</p>}
          {!session.pendingBounds && status === 'error' && session.context &&
            <Button type="button" variant="outline" onClick={retrySearch} className="mt-3">Réessayer</Button>}
          {status === 'success' && results.length === 0 && searchResult?.meta.complete &&
            <p className="mt-3 text-sm text-muted-foreground">Aucun événement trouvé dans cette zone aujourd’hui.</p>}
          {status === 'success' && searchResult && !searchResult.meta.complete &&
            <p className="mt-3 text-sm text-muted-foreground">Résultats partiels pour cette zone.</p>}
          {status === 'success' && searchResult && !searchResult.meta.complete && session.context &&
            <Button type="button" variant="outline" onClick={retrySearch} className="mt-3">Relancer la recherche</Button>}
          {results.length > 0 && <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {results.map((result) => <EventResult key={result.id} result={result} selected={selectedId === result.id} onSelect={() => selectResult(result)} />)}
          </div>}
        </section>
      </div>
    </main>
  );
}
