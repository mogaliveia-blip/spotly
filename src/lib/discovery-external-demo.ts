import type { DiscoveryResult, DiscoverySearchResult } from './discovery-search-dto';
import type { DiscoveryCategoryId } from './event-discovery';
import type { DiscoveryCategorySelection } from './discovery-what';
import type { DiscoveryArea, DiscoveryWhen } from '../../functions/src/discovery-search-contract';

export type ExternalPositionPrecision = 'source_gps' | 'address_geocoded' | 'commune_center';

export type ExternalDemoEvent = {
  origin: 'external_demo';
  id: string;
  sourceId: string;
  sourceName: string;
  title: string;
  description: string;
  position: { lat: number; lng: number };
  positionPrecision: ExternalPositionPrecision;
  city: string;
  department: '22' | '29' | '35' | '56';
  startDay: string;
  endDay: string;
  categoryId: DiscoveryCategoryId;
  producer: string;
  updatedDay: string;
  sourceUrl?: string;
  sourceLinkKind?: 'direct_event' | 'other';
};

export type DiscoveryDisplayEvent =
  | { origin: 'native'; id: string; title: string; position: { lat: number; lng: number };
      categoryId: DiscoveryCategoryId; native: DiscoveryResult }
  | ExternalDemoEvent;

export type DisplaySearchContext = {
  area: DiscoveryArea;
  when: DiscoveryWhen;
  category: DiscoveryCategorySelection;
};

export function nextResultsCount(visible: number, total: number): number {
  return Math.max(0, Math.min(20, total - visible));
}

const centers = [
  { department: '22', city: 'Saint-Brieuc', lat: 48.514, lng: -2.765 },
  { department: '29', city: 'Brest', lat: 48.39, lng: -4.486 },
  { department: '35', city: 'Rennes', lat: 48.117, lng: -1.678 },
  { department: '56', city: 'Vannes', lat: 47.658, lng: -2.76 },
] as const;
const categories: DiscoveryCategoryId[] = ['music', 'culture', 'gastronomy', 'sport', 'nature'];

export function parisDay(now = new Date()): string {
  const parts = new Intl.DateTimeFormat('en', {
    timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(now);
  const value = (type: string) => parts.find((part) => part.type === type)?.value;
  return `${value('year')}-${value('month')}-${value('day')}`;
}

/** The fixture is local, deterministic and visibly fictional. It never contains a source URL. */
export function createExternalDemoEvents(day: string): ExternalDemoEvent[] {
  let seed = 7101;
  const random = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
  return centers.flatMap(({ department, city, lat, lng }) => Array.from({ length: 25 }, (_, index) => {
    const positionPrecision: ExternalPositionPrecision = index < 5 ? 'commune_center' :
      index < 10 ? 'address_geocoded' : 'source_gps';
    return {
      origin: 'external_demo' as const,
      id: `external_demo_${department}_${index + 1}`,
      sourceId: `demo_${department}_${index + 1}`,
      sourceName: 'Source fictive de démonstration',
      title: `Événement fictif ${department}-${index + 1}`,
      description: `Description fictive pour tester la présentation d’un événement référencé à ${city}.`,
      position: positionPrecision === 'commune_center' ? { lat, lng } : {
        lat: lat + (random() - 0.5) * 0.30,
        lng: lng + (random() - 0.5) * 0.36,
      },
      positionPrecision, city, department, startDay: day, endDay: day,
      categoryId: categories[index % categories.length],
      producer: 'Producteur fictif — démonstration', updatedDay: day,
    };
  }));
}

const shiftDay = (day: string, offset: number) =>
  new Date(Date.parse(`${day}T00:00:00Z`) + offset * 86_400_000).toISOString().slice(0, 10);

function matchesWhen(event: ExternalDemoEvent, when: DiscoveryWhen, today: string): boolean {
  if (when.kind === 'now') return false; // Calendar dates never establish an exact active instant.
  if (when.kind === 'date') return event.startDay <= when.day && when.day <= event.endDay;
  if (when.kind === 'today') return event.startDay <= today && today <= event.endDay;
  if (when.kind === 'tomorrow') {
    const tomorrow = shiftDay(today, 1);
    return event.startDay <= tomorrow && tomorrow <= event.endDay;
  }
  const weekday = new Date(`${today}T00:00:00Z`).getUTCDay();
  const saturday = shiftDay(today, weekday === 0 ? -1 : weekday === 6 ? 0 : 6 - weekday);
  const sunday = shiftDay(saturday, 1);
  return (event.startDay <= saturday && saturday <= event.endDay) ||
    (event.startDay <= sunday && sunday <= event.endDay);
}

function distanceMeters(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const radians = (degrees: number) => degrees * Math.PI / 180;
  const latitude = radians(b.lat - a.lat);
  const longitude = radians(b.lng - a.lng);
  const haversine = Math.sin(latitude / 2) ** 2 +
    Math.cos(radians(a.lat)) * Math.cos(radians(b.lat)) * Math.sin(longitude / 2) ** 2;
  return 12_742_000 * Math.asin(Math.sqrt(Math.min(1, haversine)));
}

function matchesArea(event: ExternalDemoEvent, area: DiscoveryArea): boolean {
  if (area.kind === 'radius') return distanceMeters(event.position, area.center) <= 25_000;
  const { lat, lng } = event.position;
  return lat >= area.south && lat <= area.north &&
    (area.west <= area.east ? lng >= area.west && lng <= area.east : lng >= area.west || lng <= area.east);
}

/** Native results keep their order and all 100 available slots; demo items use only spare slots. */
export function displayDiscoveryEvents(
  nativeResponse: DiscoverySearchResult | null,
  context: DisplaySearchContext | null,
  demoEvents: readonly ExternalDemoEvent[],
  demoEnabled: boolean,
  today: string,
): DiscoveryDisplayEvent[] {
  if (!nativeResponse) return [];
  const native = nativeResponse.results.map((result) => ({
    origin: 'native' as const, id: result.id, title: result.title,
    position: result.position, categoryId: result.categoryId, native: result,
  }));
  if (!demoEnabled || !context || !nativeResponse.meta.complete || native.length >= 100) return native;
  const filtered = demoEvents.filter((event) =>
    (context.category === 'all' || event.categoryId === context.category) &&
    matchesWhen(event, context.when, today) && matchesArea(event, context.area));
  return [...native, ...filtered.slice(0, 100 - native.length)];
}
