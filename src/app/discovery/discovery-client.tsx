'use client';

import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { APILoadingStatus, useApiLoadingStatus } from '@vis.gl/react-google-maps';
import { fr } from 'date-fns/locale';
import { ArrowLeft, CalendarDays, ChevronDown, Crosshair, Loader2, MapPin, Search } from 'lucide-react';
import { DiscoveryMap } from '@/components/discovery/discovery-map';
import { DiscoveryPlaceSearch } from '@/components/discovery/discovery-place-search';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useGeolocation } from '@/providers/geolocation-provider';
import { mapsConfig } from '@/lib/firebase-config';
import { searchDiscovery } from '@/lib/discovery-search';
import { createDiscoveryReturnToken, discoveryDatatourismeHref, discoveryEventHref, discoveryReturnIntent, DISCOVERY_RETURN_SESSION_KEY } from '@/lib/discovery-return';
import {
  discoverySearchViewReducer, initialDiscoverySearchView, showingPreviousDiscoveryResults,
} from '@/lib/discovery-search-view';
import type { DiscoveryResult } from '@/lib/discovery-search-dto';
import type { DiscoverySearchResult } from '@/lib/discovery-search-dto';
import { createExternalDemoEvents, displayDiscoveryEvents, nextResultsCount, parisDay } from '@/lib/discovery-external-demo';
import type { DiscoveryDisplayEvent, DisplaySearchContext, ExternalDemoEvent } from '@/lib/discovery-external-demo';
import { discoveryCategories, isCatalogId } from '@/lib/event-discovery';
import type { DiscoveryCategoryId } from '@/lib/event-discovery';
import {
  DEFAULT_DISCOVERY_CAMERA, DISCOVERY_SESSION_KEY, DiscoveryLocationIntent, focusDiscoveryResult,
  isDiscoveryAreaTooLarge, parseDiscoverySession,
} from '@/lib/discovery-geography';
import type { DiscoveryCamera, DiscoveryContext, DiscoverySession, DiscoverySource } from '@/lib/discovery-geography';
import {
  DEFAULT_DISCOVERY_WHEN, DISCOVERY_WHEN_SESSION_KEY, parseDiscoveryWhenSession, searchAreaForWhenChange,
} from '@/lib/discovery-when';
import {
  DEFAULT_DISCOVERY_CATEGORY, DISCOVERY_CATEGORY_SESSION_KEY, discoverySearchRequest, parseDiscoveryCategorySession,
} from '@/lib/discovery-what';
import type { DiscoveryCategorySelection } from '@/lib/discovery-what';
import type { DiscoveryArea, DiscoveryWhen } from '../../../functions/src/discovery-search-contract';

type BoundsArea = Extract<DiscoveryArea, { kind: 'bounds' }>;

const initialSession: DiscoverySession = {
  context: null, camera: DEFAULT_DISCOVERY_CAMERA, pendingBounds: null,
};

const sourceLabel: Record<DiscoverySource, string> = {
  gps: 'Autour de ma position', place: 'Autour du lieu recherché', map: 'Dans la zone affichée',
};

const categoryAppearance: Record<DiscoveryCategoryId, { border: string; badge: string; image: string }> = {
  music: { border: 'border-l-violet-500', badge: 'bg-violet-100 text-violet-900 dark:bg-violet-950 dark:text-violet-100', image: 'bg-violet-100 text-violet-700 dark:bg-violet-950 dark:text-violet-200' },
  culture: { border: 'border-l-rose-500', badge: 'bg-rose-100 text-rose-900 dark:bg-rose-950 dark:text-rose-100', image: 'bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-200' },
  gastronomy: { border: 'border-l-amber-500', badge: 'bg-amber-100 text-amber-950 dark:bg-amber-950 dark:text-amber-100', image: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200' },
  sport: { border: 'border-l-sky-500', badge: 'bg-sky-100 text-sky-900 dark:bg-sky-950 dark:text-sky-100', image: 'bg-sky-100 text-sky-700 dark:bg-sky-950 dark:text-sky-200' },
  nature: { border: 'border-l-emerald-500', badge: 'bg-emerald-100 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-100', image: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-200' },
  other: { border: 'border-l-slate-500', badge: 'bg-slate-100 text-slate-900 dark:bg-slate-800 dark:text-slate-100', image: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200' },
};
const unknownCategoryAppearance = {
  border: 'border-l-muted-foreground', badge: 'bg-muted text-foreground', image: 'bg-muted text-muted-foreground',
};

function calendarDate(day: string): Date {
  const [year, month, date] = day.split('-').map(Number);
  const result = new Date(0);
  result.setFullYear(year, month - 1, date);
  result.setHours(12, 0, 0, 0);
  return result;
}

function calendarDay(date: Date): string {
  return `${String(date.getFullYear()).padStart(4, '0')}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function EventResult({ result, selected, onSelect, eventHref, onOpenEvent }: {
  result: Exclude<DiscoveryResult, { origin: 'datatourisme' }>;
  selected: boolean;
  onSelect: () => void;
  eventHref: string;
  onOpenEvent: () => void;
}) {
  const [failedThumbnail, setFailedThumbnail] = useState<string | null>(null);
  const category = discoveryCategories.find((item) => item.id === result.categoryId);
  const appearance = category ? categoryAppearance[category.id] : unknownCategoryAppearance;
  const thumbnail = result.thumbnail?.trim();
  const showThumbnail = !!thumbnail && failedThumbnail !== thumbnail;
  const optimizableThumbnail = !!thumbnail && (
    (thumbnail.startsWith('/') && !thumbnail.startsWith('//')) ||
    thumbnail.startsWith('https://firebasestorage.googleapis.com/')
  );
  return (
    <article className={`flex h-full min-w-0 flex-col overflow-hidden rounded-xl border border-l-4 bg-card shadow-sm ${appearance.border} ${selected ? 'border-primary ring-2 ring-primary' : 'border-border'}`}>
      <button type="button" onClick={onSelect} className="w-full min-w-0 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring" aria-label={`Localiser ${result.title} sur la carte`}>
        <div className={`relative flex h-36 w-full items-center justify-center overflow-hidden ${appearance.image}`}>
          {showThumbnail ? <Image src={thumbnail} alt="" fill unoptimized={!optimizableThumbnail} sizes="(max-width: 639px) calc(100vw - 2rem), (max-width: 1023px) calc(50vw - 2rem), (max-width: 1279px) 320px, 300px"
            className="object-cover" onError={() => setFailedThumbnail(thumbnail)} /> :
            <CalendarDays aria-hidden="true" className="h-12 w-12 opacity-70" />}
        </div>
        <div className="space-y-2 p-3">
          <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${appearance.badge}`}>{category?.label ?? 'Catégorie non renseignée'}</span>
          <h3 className="break-words font-semibold leading-snug">{result.title}</h3>
          {result.distanceMeters !== undefined && <p className="text-sm text-muted-foreground">À {result.distanceMeters < 1000
            ? `${Math.round(result.distanceMeters)} m` : `${new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 1 }).format(result.distanceMeters / 1000)} km`} du centre</p>}
          <span className="inline-flex items-center gap-1 text-sm font-medium text-violet-700 underline-offset-2 hover:underline dark:text-violet-300">
            <MapPin aria-hidden="true" className="h-4 w-4" /> Localiser sur la carte
          </span>
        </div>
      </button>
      <div className="mt-auto px-3 pb-3">
        <Button asChild size="sm" variant="outline" className="w-full">
          <Link href={eventHref} onClick={onOpenEvent} onAuxClick={(event) => { if (event.button === 1) onOpenEvent(); }}
            onContextMenu={onOpenEvent}>Découvrir l’événement</Link>
        </Button>
      </div>
    </article>
  );
}

function DatatourismeResult({ result, selected, onSelect }: {
  result: Extract<DiscoveryResult, { origin: 'datatourisme' }>;
  selected: boolean;
  onSelect: () => void;
}) {
  const category = discoveryCategories.find((item) => item.id === result.categoryId);
  const appearance = category ? categoryAppearance[category.id] : unknownCategoryAppearance;
  const date = result.timePrecision === 'date'
    ? result.startDay === result.endDay ? result.startDay : `${result.startDay} – ${result.endDay}`
    : (() => {
      const format = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium', timeStyle: 'short', timeZone: result.timezone });
      return `${format.format(result.windowStartAt.toDate())} – ${format.format(result.windowEndAt.toDate())}`;
    })();
  return <article className={`flex h-full min-w-0 flex-col overflow-hidden rounded-xl border border-l-4 bg-card shadow-sm ${appearance.border} ${selected ? 'border-primary ring-2 ring-primary' : 'border-border'}`}>
    <button type="button" onClick={onSelect} className="w-full min-w-0 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
      aria-label={`Localiser ${result.title} sur la carte`}>
      <div className={`flex h-20 items-center justify-center ${appearance.image}`}><CalendarDays aria-hidden="true" className="h-9 w-9" /></div>
      <div className="space-y-2 p-3">
        <span className="inline-flex rounded-full bg-teal-100 px-2.5 py-1 text-xs font-semibold text-teal-950">Événement DATAtourisme</span>
        <div><span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${appearance.badge}`}>{category?.label ?? 'Autre'}</span></div>
        <h3 className="break-words font-semibold leading-snug">{result.title}</h3>
        {result.editorialType && <p className="text-sm font-medium">{result.editorialType}</p>}
        <p className="text-sm">{date} · {result.city} ({result.department})</p>
        <p className="line-clamp-3 text-sm text-muted-foreground">{result.description}</p>
        <p className="text-xs text-muted-foreground">Source : DATAtourisme · Producteur : {result.attribution.producer}</p>
        <span className="inline-flex items-center gap-1 text-sm font-medium text-teal-800 underline-offset-2 hover:underline dark:text-teal-300">
          <MapPin aria-hidden="true" className="h-4 w-4" /> Localiser sur la carte
        </span>
      </div>
    </button>
    <div className="mt-auto px-3 pb-3"><Button asChild size="sm" variant="outline" className="w-full">
      <Link href={discoveryDatatourismeHref(result.id)}>Voir le détail</Link>
    </Button></div>
  </article>;
}

function positionLabel(precision: ExternalDemoEvent['positionPrecision']): string {
  if (precision === 'commune_center') return 'Position approximative — centre de commune';
  if (precision === 'address_geocoded') return 'Position géocodée depuis une adresse';
  return 'Coordonnées fournies par la source — précision à vérifier';
}

function ExternalResult({ result, selected, onSelect }: {
  result: ExternalDemoEvent;
  selected: boolean;
  onSelect: () => void;
}) {
  const category = discoveryCategories.find((item) => item.id === result.categoryId);
  const appearance = category ? categoryAppearance[category.id] : unknownCategoryAppearance;
  const date = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })
    .format(new Date(`${result.startDay}T12:00:00Z`));
  return <article className={`flex h-full min-w-0 flex-col overflow-hidden rounded-xl border border-l-4 bg-card shadow-sm ${appearance.border} ${selected ? 'border-primary ring-2 ring-primary' : 'border-border'}`}>
    <button type="button" onClick={onSelect} className="w-full min-w-0 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
      aria-label={`Localiser ${result.title} sur la carte`}>
      <div className={`flex h-20 items-center justify-center ${appearance.image}`}><CalendarDays aria-hidden="true" className="h-9 w-9" /></div>
      <div className="space-y-2 p-3">
        <span className="inline-flex rounded-full bg-orange-100 px-2.5 py-1 text-xs font-semibold text-orange-950">Donnée fictive — démonstration</span>
        <div><span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${appearance.badge}`}>{category?.label ?? 'Autre'}</span></div>
        <h3 className="break-words font-semibold leading-snug">{result.title}</h3>
        <p className="text-sm">{date} · {result.city} ({result.department})</p>
        <p className="text-sm text-muted-foreground">{result.description}</p>
        <p className="text-xs text-muted-foreground">{positionLabel(result.positionPrecision)}</p>
        <p className="text-xs text-muted-foreground">Provenance fictive : {result.sourceName}. Producteur fictif : {result.producer}. Mise à jour fictive : {result.updatedDay}.</p>
        <span className="inline-flex items-center gap-1 text-sm font-medium text-teal-800 underline-offset-2 hover:underline dark:text-teal-300">
          <MapPin aria-hidden="true" className="h-4 w-4" /> Localiser sur la carte
        </span>
      </div>
    </button>
    {result.sourceLinkKind === 'direct_event' && result.sourceUrl?.startsWith('https://') && <div className="mt-auto px-3 pb-3">
      <a href={result.sourceUrl} target="_blank" rel="noopener noreferrer" className="text-sm font-medium text-teal-800 underline dark:text-teal-300">
        Voir l’annonce source
      </a>
    </div>}
  </article>;
}

export function DiscoveryClient() {
  const { userLocation, requestPosition } = useGeolocation();
  const mapsStatus = useApiLoadingStatus();
  const mapUnavailable = !mapsConfig.apiKey || mapsConfig.apiKey === 'invalid_key' ||
    mapsStatus === APILoadingStatus.FAILED || mapsStatus === APILoadingStatus.AUTH_FAILURE;
  const [hydrated, setHydrated] = useState(false);
  const [session, setSession] = useState<DiscoverySession>(initialSession);
  const [when, setWhen] = useState<DiscoveryWhen>(DEFAULT_DISCOVERY_WHEN);
  const [category, setCategory] = useState<DiscoveryCategorySelection>(DEFAULT_DISCOVERY_CATEGORY);
  const [dateOpen, setDateOpen] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [filtersOverflowVisible, setFiltersOverflowVisible] = useState(false);
  const [selectedPlaceLabel, setSelectedPlaceLabel] = useState<string | null>(null);
  const [returnToken, setReturnToken] = useState<string | null>(null);
  const [cameraRequest, setCameraRequest] = useState<DiscoveryCamera & { sequence: number }>({
    ...DEFAULT_DISCOVERY_CAMERA, sequence: 0,
  });
  const [mapSearchSequence, setMapSearchSequence] = useState(0);
  const [searchView, dispatchSearch] = useReducer(discoverySearchViewReducer, initialDiscoverySearchView);
  const { status, message, result: searchResult, selectedId } = searchView;
  const [gpsPending, setGpsPending] = useState(false);
  const [demoEnabled, setDemoEnabled] = useState(false);
  const [demoOffline, setDemoOffline] = useState(false);
  const [demoEvents, setDemoEvents] = useState<ExternalDemoEvent[]>([]);
  const [completedQuery, setCompletedQuery] = useState<DisplaySearchContext | null>(null);
  const [visibleCount, setVisibleCount] = useState(20);
  const [selectedClusterIds, setSelectedClusterIds] = useState<string[]>([]);
  const requestSequenceRef = useRef(0);
  const demoOfflineRef = useRef(false);
  const whenRef = useRef<DiscoveryWhen>(DEFAULT_DISCOVERY_WHEN);
  const categoryRef = useRef<DiscoveryCategorySelection>(DEFAULT_DISCOVERY_CATEGORY);
  const locationIntentRef = useRef<DiscoveryLocationIntent | null>(null);
  locationIntentRef.current ??= new DiscoveryLocationIntent();
  const locationIntent = locationIntentRef.current;
  const mapSectionRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    try { setReturnToken(createDiscoveryReturnToken()); } catch { /* Direct Event navigation still works. */ }
  }, []);

  useEffect(() => {
    if (process.env.NODE_ENV !== 'development' || !['localhost', '127.0.0.1'].includes(window.location.hostname)) return;
    const params = new URLSearchParams(window.location.search);
    if (params.get('d7demo') !== '1') return;
    const offline = params.get('d7offline') === '1';
    demoOfflineRef.current = offline;
    setDemoOffline(offline);
    setDemoEvents(createExternalDemoEvents(parisDay()));
    setDemoEnabled(true);
  }, []);

  const runSearch = useCallback(async (
    area: DiscoveryArea, selectedWhen: DiscoveryWhen = whenRef.current,
    selectedCategory: DiscoveryCategorySelection = categoryRef.current,
  ) => {
    const sequence = ++requestSequenceRef.current;
    dispatchSearch({ type: 'start' });
    try {
      const response: DiscoverySearchResult = demoOfflineRef.current
        ? { results: [], meta: { complete: true, truncated: false, partialFailure: false, returnedCount: 0 } }
        : await searchDiscovery(discoverySearchRequest(area, selectedWhen, selectedCategory));
      if (sequence !== requestSequenceRef.current) return;
      setCompletedQuery({ area, when: selectedWhen, category: selectedCategory });
      setVisibleCount(20);
      setSelectedClusterIds([]);
      dispatchSearch({ type: 'success', result: response });
    } catch (error) {
      if (sequence !== requestSequenceRef.current) return;
      if (isDiscoveryAreaTooLarge(error)) {
        dispatchSearch({ type: 'failure', status: 'too-large',
          message: 'La zone affichée est trop vaste. Rapprochez la carte, puis relancez la recherche.' });
      } else {
        dispatchSearch({ type: 'failure', status: 'error',
          message: 'La recherche est momentanément indisponible. Réessayez.' });
      }
    }
  }, []);

  useEffect(() => {
    let restored: DiscoverySession | null = null;
    let restoredWhen: DiscoveryWhen = DEFAULT_DISCOVERY_WHEN;
    let restoredCategory: DiscoveryCategorySelection = DEFAULT_DISCOVERY_CATEGORY;
    try { restoredWhen = parseDiscoveryWhenSession(window.sessionStorage.getItem(DISCOVERY_WHEN_SESSION_KEY)); } catch { /* Storage may be disabled. */ }
    whenRef.current = restoredWhen;
    setWhen(restoredWhen);
    try { restoredCategory = parseDiscoveryCategorySession(window.sessionStorage.getItem(DISCOVERY_CATEGORY_SESSION_KEY)); } catch { /* Storage may be disabled. */ }
    categoryRef.current = restoredCategory;
    setCategory(restoredCategory);
    try { restored = parseDiscoverySession(window.sessionStorage.getItem(DISCOVERY_SESSION_KEY)); } catch { /* Storage may be disabled. */ }
    if (restored) {
      setSession(restored);
      setCameraRequest({ ...restored.camera, sequence: 0 });
      if (!restored.pendingBounds) {
        const area = searchAreaForWhenChange(restored);
        if (area) void runSearch(area, restoredWhen, restoredCategory);
      }
    }
    setHydrated(true);
  }, [runSearch]);

  useEffect(() => {
    if (!hydrated) return;
    try { window.sessionStorage.setItem(DISCOVERY_SESSION_KEY, JSON.stringify(session)); } catch { /* Memory state still works. */ }
  }, [hydrated, session]);

  useEffect(() => {
    if (!hydrated) return;
    try { window.sessionStorage.setItem(DISCOVERY_WHEN_SESSION_KEY, JSON.stringify(when)); } catch { /* Memory state still works. */ }
  }, [hydrated, when]);

  useEffect(() => {
    if (!hydrated) return;
    try { window.sessionStorage.setItem(DISCOVERY_CATEGORY_SESSION_KEY, JSON.stringify(category)); } catch { /* Memory state still works. */ }
  }, [hydrated, category]);

  const chooseWhen = (next: DiscoveryWhen) => {
    if (when.kind === next.kind && (when.kind !== 'date' || (next.kind === 'date' && when.day === next.day))) return;
    whenRef.current = next;
    setWhen(next);
    const area = searchAreaForWhenChange(session);
    if (area) {
      void runSearch(area, next);
      return;
    }
    requestSequenceRef.current += 1;
    dispatchSearch({ type: 'interrupt' });
  };

  const chooseCategory = (next: DiscoveryCategorySelection) => {
    if (category === next) return;
    categoryRef.current = next;
    setCategory(next);
    const area = searchAreaForWhenChange(session);
    if (area) {
      void runSearch(area, whenRef.current, next);
      return;
    }
    requestSequenceRef.current += 1;
    dispatchSearch({ type: 'interrupt' });
  };

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
    dispatchSearch({ type: 'message', message: null });
    const current = await locationIntent.requestGps(requestPosition,
      (position) => chooseRadius('gps', position),
      (error) => dispatchSearch({ type: 'message', message: (error as { code?: number } | null)?.code === 1
        ? 'La géolocalisation est refusée. Recherchez un lieu ou déplacez la carte.'
        : 'Votre position est indisponible. Recherchez un lieu ou déplacez la carte.' }),
    );
    if (current) setGpsPending(false);
  };

  const choosePlace = (center: DiscoveryCamera['center'], label: string) => {
    locationIntent.invalidate();
    setGpsPending(false);
    setSelectedPlaceLabel(label);
    if (window.matchMedia('(max-width: 1023px)').matches) {
      setDateOpen(false);
      setFiltersOverflowVisible(false);
      setFiltersOpen(false);
    }
    chooseRadius('place', center);
  };

  const showMap = () => {
    const mapSection = mapSectionRef.current;
    if (!mapSection) return;
    mapSection.focus({ preventScroll: true });
    mapSection.scrollIntoView({
      behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
      block: 'center',
    });
  };

  const selectResult = (result: DiscoveryDisplayEvent) => {
    locationIntent.invalidate();
    setGpsPending(false);
    setSelectedClusterIds([]);
    dispatchSearch({ type: 'select', id: result.id });
    const nextSession = focusDiscoveryResult(session, result.position);
    setSession(nextSession);
    setCameraRequest((previous) => ({ ...nextSession.camera, sequence: previous.sequence + 1 }));
    showMap();
  };

  const onManualViewport = useCallback((bounds: BoundsArea, camera: DiscoveryCamera) => {
    setSession((previous) => ({ ...previous, camera, pendingBounds: bounds }));
  }, []);

  const onManualMoveStart = useCallback(() => {
    // A new user intent invalidates a search before its old response can be rendered.
    locationIntent.invalidate();
    setGpsPending(false);
    requestSequenceRef.current += 1;
    dispatchSearch({ type: 'interrupt' });
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

  const recordEventOpen = (slug: string) => {
    if (!returnToken) return;
    try {
      window.sessionStorage.setItem(DISCOVERY_SESSION_KEY, JSON.stringify(session));
      window.sessionStorage.setItem(DISCOVERY_WHEN_SESSION_KEY, JSON.stringify(when));
      window.sessionStorage.setItem(DISCOVERY_CATEGORY_SESSION_KEY, JSON.stringify(category));
      window.sessionStorage.setItem(DISCOVERY_RETURN_SESSION_KEY, discoveryReturnIntent(slug, returnToken));
    } catch { /* Navigation still works when storage is unavailable. */ }
  };

  const results = displayDiscoveryEvents(searchResult, completedQuery, demoEvents, demoEnabled, parisDay());
  const selectedResult = results.find((result) => result.id === selectedId) ?? null;
  const selectedCluster = selectedClusterIds.map((id) => results.find((result) => result.id === id))
    .filter((result): result is DiscoveryDisplayEvent => !!result);
  const selectedDate = when.kind === 'date' ? calendarDate(when.day) : undefined;
  const dateLabel = selectedDate ? new Intl.DateTimeFormat('fr-FR', {
    day: 'numeric', month: 'short', year: 'numeric',
  }).format(selectedDate) : 'Choisir une date';
  const emptyTimeLabel = when.kind === 'today' ? 'aujourd’hui' : when.kind === 'tomorrow' ? 'demain' :
    when.kind === 'weekend' ? 'ce week-end' : `le ${dateLabel}`;
  const whenSummary = when.kind === 'today' ? 'Aujourd’hui' : when.kind === 'tomorrow' ? 'Demain' :
    when.kind === 'weekend' ? 'Ce week-end' : dateLabel;
  const locationSummary = session.context?.source === 'place' && selectedPlaceLabel
    ? selectedPlaceLabel : session.context ? sourceLabel[session.context.source] : 'Choisir un lieu';
  const categorySummary = category === 'all' ? 'Tout découvrir' :
    discoveryCategories.find((item) => item.id === category)?.label ?? 'Tout découvrir';
  const previousResults = showingPreviousDiscoveryResults(searchView, session.pendingBounds !== null);

  return (
    <main className="min-h-screen bg-background">
      <div className="mx-auto max-w-7xl px-4 py-5 sm:px-6 sm:py-8">
        <Link href="/" className="mb-5 inline-flex items-center gap-2 text-sm font-medium text-primary hover:underline">
          <ArrowLeft className="h-4 w-4" /> Retour au portail
        </Link>
        <div className="mb-5">
          <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">Carte Découverte</h1>
          <p className="mt-2 text-muted-foreground">Choisissez où, quand et quoi découvrir.</p>
          {demoEnabled && <div className="mt-3 rounded-xl border border-orange-300 bg-orange-50 p-3 text-sm text-orange-950" role="status">
            Mode de démonstration locale : événements externes entièrement fictifs, sans importation{demoOffline ? ' ni recherche Firebase' : ''}.
            <Button type="button" size="sm" variant="outline" className="ml-0 mt-2 block sm:ml-3 sm:mt-0 sm:inline-flex"
              onClick={() => choosePlace({ lat: 48.117, lng: -1.678 }, 'Rennes — démonstration')}>Tester autour de Rennes</Button>
          </div>}
        </div>

        <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-5 lg:grid-cols-[320px_minmax(0,1fr)]">
          <section className="box-border w-full min-w-0 rounded-2xl border bg-card p-4 shadow-sm sm:p-5 lg:row-span-2 lg:self-start" aria-label="Recherche d’événements">
            <div className="lg:hidden">
              <p className="text-sm font-semibold">Votre recherche</p>
              <p className="mt-1 break-words text-sm text-muted-foreground" aria-live="polite">{locationSummary} · {whenSummary} · {categorySummary}</p>
              <Button type="button" variant="outline" size="sm" className="mt-3 w-full"
                aria-expanded={filtersOpen} aria-controls="discovery-filters" onClick={() => {
                  if (filtersOpen) {
                    setDateOpen(false);
                    setFiltersOverflowVisible(false);
                  }
                  setFiltersOpen((open) => !open);
                }}>
                {filtersOpen ? 'Masquer les filtres' : 'Modifier la recherche'}
                <ChevronDown aria-hidden="true" className={`transition-transform duration-300 motion-reduce:transition-none ${filtersOpen ? 'rotate-180' : ''}`} />
              </Button>
              {session.pendingBounds && (
                <Button type="button" onClick={searchVisibleArea} className="mt-3 w-full">
                  <Search className="h-4 w-4" /> Rechercher dans cette zone
                </Button>
              )}
            </div>
            <div id="discovery-filters" className={`grid min-w-0 grid-rows-[0fr] transition-[grid-template-rows,visibility] duration-300 ease-in-out motion-reduce:transition-none lg:visible lg:block lg:transition-none ${filtersOpen ? 'visible grid-rows-[1fr]' : 'invisible'}`}
              onTransitionEnd={(event) => {
                if (event.target === event.currentTarget && event.propertyName === 'grid-template-rows' && filtersOpen) {
                  setFiltersOverflowVisible(true);
                }
              }}>
              <div className={`min-h-0 min-w-0 ${filtersOpen && filtersOverflowVisible ? 'overflow-visible' : 'overflow-hidden'} ${filtersOpen ? 'motion-reduce:overflow-visible' : ''} lg:overflow-visible`}>
                <div className="mt-4 min-w-0 border-t pt-4 lg:mt-0 lg:border-0 lg:pt-0">
                  <h2 id="where-heading" className="text-xl font-semibold">OÙ ?</h2>
                  <p className="mt-1 text-sm text-muted-foreground">Autour de vous, d’un lieu recherché ou dans la zone de la carte.</p>
                  <Button type="button" onClick={() => void chooseCurrentLocation()} className="mt-5 w-full" disabled={!hydrated || gpsPending}>
                    {gpsPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Crosshair className="h-4 w-4" />}
                    {gpsPending ? 'Recherche de votre position…' : 'Utiliser ma position'}
                  </Button>
                  <div className="mt-5 min-w-0 [&_gmp-place-autocomplete]:max-w-full [&_gmp-place-autocomplete]:min-w-0">
                    <label className="mb-2 block text-sm font-medium">Rechercher un lieu</label>
                    {mapUnavailable ? <p className="text-sm text-muted-foreground">La recherche de lieu et la carte sont indisponibles.</p> :
                      <DiscoveryPlaceSearch locationBias={session.context?.area.kind === 'radius' ? session.context.area.center : null}
                        onPlaceSelected={choosePlace} />}
                  </div>
                  <p className="mt-4 text-sm text-muted-foreground">Vous pouvez aussi déplacer ou zoomer la carte, puis lancer la recherche dans la zone affichée.</p>
                  {session.pendingBounds && (
                    <Button type="button" onClick={searchVisibleArea} className="mt-4 hidden w-full lg:flex">
                      <Search className="h-4 w-4" /> Rechercher dans cette zone
                    </Button>
                  )}
                  <fieldset className="mt-5 min-w-0 border-t pt-4" disabled={!hydrated}>
                    <legend className="font-semibold">QUAND ?</legend>
                    <div className="mt-3 grid grid-cols-2 gap-2">
                      {([
                        { kind: 'today', label: 'Aujourd’hui' },
                        { kind: 'tomorrow', label: 'Demain' },
                        { kind: 'weekend', label: 'Ce week-end' },
                      ] as const).map((choice) => (
                        <Button key={choice.kind} type="button" size="sm" variant={when.kind === choice.kind ? 'default' : 'outline'}
                          aria-pressed={when.kind === choice.kind} onClick={() => chooseWhen({ kind: choice.kind })}>
                          {choice.label}
                        </Button>
                      ))}
                      <Popover open={dateOpen} onOpenChange={setDateOpen}>
                        <PopoverTrigger asChild>
                          <Button type="button" size="sm" variant={when.kind === 'date' ? 'default' : 'outline'}
                            aria-pressed={when.kind === 'date'} aria-label={when.kind === 'date' ? `Date choisie : ${dateLabel}` : 'Choisir une date'}>
                            {dateLabel}
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent align="start" className="w-auto max-w-[calc(100vw-2rem)] p-0">
                          <Calendar mode="single" selected={selectedDate} defaultMonth={selectedDate} locale={fr} onSelect={(date) => {
                            if (!date) return;
                            chooseWhen({ kind: 'date', day: calendarDay(date) });
                            setDateOpen(false);
                          }} />
                        </PopoverContent>
                      </Popover>
                    </div>
                  </fieldset>
                  <div className="mt-5 min-w-0 border-t pt-4">
                    <h2 id="what-heading" className="font-semibold">QUOI ?</h2>
                    <Select value={category} disabled={!hydrated} onValueChange={(value) => {
                      if (value === 'all' || isCatalogId(discoveryCategories, value)) chooseCategory(value);
                    }}>
                      <SelectTrigger aria-labelledby="what-heading" className="mt-3"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Tout découvrir</SelectItem>
                        {discoveryCategories.map((item) => <SelectItem key={item.id} value={item.id}>{item.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  {session.context && !session.pendingBounds && <p className="mt-3 hidden text-sm text-primary lg:block">{sourceLabel[session.context.source]}</p>}
                </div>
              </div>
            </div>
          </section>

          <section className="min-w-0 lg:col-start-2" aria-labelledby="results-heading" aria-live="polite">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 id="results-heading" className="text-xl font-semibold">À découvrir</h2>
              <Button type="button" variant="outline" size="sm" onClick={showMap}>
                <MapPin className="h-4 w-4" /> Voir sur la carte
              </Button>
            </div>
            {session.pendingBounds && <p className="mt-2 text-sm text-muted-foreground">La carte a changé. Lancez « Rechercher dans cette zone » pour actualiser les résultats.</p>}
            {session.pendingBounds && !searchResult && <p className="mt-2 text-sm text-muted-foreground">Les résultats précédents ne sont pas restaurés après navigation. Confirmez cette zone pour afficher les événements.</p>}
            {!session.pendingBounds && status === 'idle' && !searchResult && <p className="mt-2 text-sm text-muted-foreground">Choisissez un lieu ou utilisez votre position pour commencer.</p>}
            {status === 'loading' && <p className="mt-3 flex items-center gap-2 text-sm"><Loader2 className="h-4 w-4 animate-spin" /> Recherche des événements…</p>}
            {message && <p role="alert" className="mt-3 rounded-xl border bg-card p-4 text-sm">{message}</p>}
            {previousResults && <p className="mt-2 text-sm text-muted-foreground">Résultats de la dernière recherche validée.</p>}
            {!session.pendingBounds && status === 'error' && session.context &&
              <Button type="button" variant="outline" onClick={retrySearch} className="mt-3">Réessayer</Button>}
            {results.length === 0 && searchResult?.meta.complete &&
              <p className="mt-3 text-sm text-muted-foreground">{previousResults
                ? 'Aucun événement lors de la dernière recherche.'
                : `Aucun événement trouvé dans cette zone ${emptyTimeLabel}.`}</p>}
            {status === 'success' && searchResult && !searchResult.meta.complete &&
              <p className="mt-3 text-sm text-muted-foreground">Résultats partiels pour cette zone.</p>}
            {status === 'success' && searchResult && !searchResult.meta.complete && session.context &&
              <Button type="button" variant="outline" onClick={retrySearch} className="mt-3">Relancer la recherche</Button>}
            {results.length > 0 && <>
              <p className="mt-3 text-sm text-muted-foreground">{Math.min(visibleCount, results.length)} sur {results.length} résultats chargés affichés dans la liste.</p>
              <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {results.slice(0, visibleCount).map((result) => result.origin === 'native'
                  ? <EventResult key={result.id} result={result.native} selected={selectedId === result.id}
                      onSelect={() => selectResult(result)} eventHref={discoveryEventHref(result.native.slug, returnToken)} onOpenEvent={() => recordEventOpen(result.native.slug)} />
                  : result.origin === 'datatourisme'
                    ? <DatatourismeResult key={result.id} result={result.external} selected={selectedId === result.id}
                        onSelect={() => selectResult(result)} />
                    : <ExternalResult key={result.id} result={result} selected={selectedId === result.id}
                        onSelect={() => selectResult(result)} />)}
              </div>
              {visibleCount < results.length && <Button type="button" variant="outline" className="mt-4 w-full"
                onClick={() => setVisibleCount((count) => Math.min(count + 20, results.length))}>
                Afficher les {nextResultsCount(visibleCount, results.length)} suivants
              </Button>}
            </>}
          </section>

          <section ref={mapSectionRef} tabIndex={-1} aria-label="Carte des événements" className="relative h-[40vh] min-h-[280px] overflow-hidden rounded-2xl border bg-muted shadow-sm sm:h-[560px] lg:col-start-2">
            {!hydrated ? (
              <div className="flex h-full items-center justify-center gap-2 text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin" /> Chargement de la carte…</div>
            ) : mapUnavailable ? (
              <div className="flex h-full items-center justify-center p-6 text-center text-muted-foreground">Carte indisponible. La recherche par position reste possible.</div>
            ) : mapsStatus === APILoadingStatus.LOADING || mapsStatus === APILoadingStatus.NOT_LOADED ? (
              <div className="flex h-full items-center justify-center gap-2 text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin" /> Chargement de la carte…</div>
            ) : (
              <DiscoveryMap camera={session.camera} cameraRequest={cameraRequest} searchSequence={mapSearchSequence} results={results}
                selectedId={selectedId} onSelect={(id) => { setSelectedClusterIds([]); dispatchSearch({ type: 'select', id }); }}
                onClusterSelect={(ids) => { dispatchSearch({ type: 'select', id: '' }); setSelectedClusterIds(ids); }}
                onManualMoveStart={onManualMoveStart}
                onManualViewport={onManualViewport} />
            )}
            {selectedResult && !mapUnavailable && (
              <div className="absolute bottom-3 left-3 right-3 z-10 rounded-xl border bg-card/95 p-3 shadow-lg backdrop-blur-sm sm:right-auto sm:w-72">
                <p className="font-semibold">{selectedResult.title}</p>
                {selectedResult.origin === 'native' ? <Link href={discoveryEventHref(selectedResult.native.slug, returnToken)} onClick={() => recordEventOpen(selectedResult.native.slug)}
                  onAuxClick={(event) => { if (event.button === 1) recordEventOpen(selectedResult.native.slug); }}
                  onContextMenu={() => recordEventOpen(selectedResult.native.slug)}
                  className="mt-2 inline-block text-sm font-medium text-primary underline">Découvrir l’événement</Link>
                  : selectedResult.origin === 'datatourisme'
                    ? <Link href={discoveryDatatourismeHref(selectedResult.id)} className="mt-2 inline-block text-sm font-medium text-teal-800 underline">Voir le détail DATAtourisme</Link>
                    : <p className="mt-1 text-xs text-muted-foreground">Donnée fictive · {selectedResult.city} · {positionLabel(selectedResult.positionPrecision)}</p>}
              </div>
            )}
            {selectedCluster.length > 1 && !mapUnavailable && <div className="absolute bottom-3 left-3 right-3 z-10 max-h-[55%] overflow-y-auto rounded-xl border bg-card/95 p-3 shadow-lg backdrop-blur-sm sm:right-auto sm:w-72"
              role="group" aria-label={`${selectedCluster.length} événements dans ce groupe`}>
              <p className="font-semibold">{selectedCluster.length} événements dans ce groupe</p>
              <p className="text-xs text-muted-foreground">{selectedCluster.filter((item) => item.origin === 'external_demo' && item.positionPrecision !== 'source_gps').length} positions estimées ou approximatives.</p>
              <ul className="mt-2 space-y-1">{selectedCluster.map((item) => <li key={item.id}>
                <button type="button" className="w-full rounded p-1 text-left text-sm hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  onClick={() => selectResult(item)}>{item.title}{item.origin === 'external_demo' ? ' · fictif' : item.origin === 'datatourisme' ? ' · DATAtourisme' : ''}</button>
              </li>)}</ul>
            </div>}
          </section>
        </div>
      </div>
    </main>
  );
}
