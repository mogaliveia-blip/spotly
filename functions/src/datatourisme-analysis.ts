import { Firestore } from 'firebase-admin/firestore';
import { HttpsError } from 'firebase-functions/v2/https';

const API_URL = 'https://api.datatourisme.fr/v1/entertainmentAndEvent';
const DEPARTMENTS = ['22', '29', '35', '56'] as const;
const PAGE_SIZE = 25;
const MAX_PAGE = 5;
const MAX_RESPONSE_BYTES = 2_000_000;

type Department = typeof DEPARTMENTS[number];
type RecordValue = Record<string, unknown>;
type Quality = 'acceptable' | 'a_verifier' | 'rejete';
type SourceTerm = { key: string | null; label: string | null };

export type AnalysisCandidate = {
  id: string;
  title: string | null;
  description: string | null;
  startDay: string | null;
  endDay: string | null;
  city: string | null;
  department: string | null;
  category: string | null;
  subcategory: string | null;
  sourceTypes: SourceTerm[];
  sourceThemes: SourceTerm[];
  producer: string | null;
  provenance: string | null;
  location: { lat: number; lng: number } | null;
  positionPrecision: 'source_coordinates' | 'address_only' | 'commune_only' | 'unknown';
  updatedAt: string | null;
  sourceUrl: string | null;
  quality: Quality;
  reasons: string[];
  possibleDuplicate: boolean;
};

type AnalysisResult = {
  candidates: AnalysisCandidate[];
  meta: { department: Department; page: number; pageSize: number; examinedCount: number; apiTotal: number; hasNextPage: boolean };
};

function record(value: unknown): RecordValue {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as RecordValue : {};
}

function first(value: unknown): unknown {
  return Array.isArray(value) ? value[0] : value;
}

function string(value: unknown, max = 500): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, max) : null;
}

function label(value: unknown): string | null {
  if (typeof value === 'string') return string(value);
  const data = record(value);
  return string(data['@fr']) ?? string(data.fr) ?? string(data.label) ??
    (data.label && typeof data.label === 'object' ? label(data.label) : null) ??
    Object.values(data).map((item) => string(item)).find((item) => item !== null) ?? null;
}

function frenchLabel(value: unknown): string | null {
  const data = record(value);
  return string(data['@fr']) ?? string(data.fr);
}

function sourceTerms(value: unknown): SourceTerm[] {
  const items = Array.isArray(value) ? value : value == null ? [] : [value];
  const seen = new Set<string>();
  return items.map((item) => {
    const data = record(item);
    const uri = string(data.uri, 500);
    const key = string(data.key, 100) ?? (uri ? string(uri.split(/[\/#]/).pop(), 100) : null);
    return { key, label: label(data.label) ?? (typeof item === 'string' ? label(item) : null) ?? key };
  }).filter((term) => {
    const identity = term.key ?? term.label;
    if (!identity || seen.has(identity)) return false;
    seen.add(identity);
    return true;
  });
}

function departmentOf(address: RecordValue): string | null {
  return string(record(record(address.hasAddressCity).isPartOfDepartment).insee, 3);
}

function day(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const match = /^(\d{4}-\d{2}-\d{2})(?:T|$)/.exec(value);
  if (!match) return null;
  const parsed = new Date(`${match[1]}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === match[1] ? match[1] : null;
}

function httpsUrl(value: unknown): string | null {
  const raw = string(value, 2000);
  if (!raw) return null;
  try {
    const url = new URL(raw);
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.toString() : null;
  } catch {
    return null;
  }
}

function normalizeCandidate(raw: unknown, requestedDepartment: Department, today: string, index: number): AnalysisCandidate {
  const poi = record(raw);
  const places = Array.isArray(poi.isLocatedAt) ? poi.isLocatedAt.map(record) : [];
  const place = places.find((item) => Array.isArray(item.address) && item.address.some((address) => departmentOf(record(address)) === requestedDepartment)) ?? record(first(poi.isLocatedAt));
  const addresses = Array.isArray(place.address) ? place.address.map(record) : [];
  const address = addresses.find((item) => departmentOf(item) === requestedDepartment) ?? record(first(place.address));
  const cityData = record(address.hasAddressCity);
  const department = departmentOf(address);
  const geo = record(place.geo);
  const lat = geo.latitude;
  const lng = geo.longitude;
  const location = typeof lat === 'number' && typeof lng === 'number' &&
    Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180
    ? { lat, lng } : null;
  const city = label(cityData.label) ?? string(address.addressLocality);
  const periods = Array.isArray(poi.takesPlaceAt) ? poi.takesPlaceAt.map(record) : [];
  const validPeriods = periods.map((period) => ({ start: day(period.startDate), end: day(period.endDate), hasEnd: period.endDate !== undefined && period.endDate !== null && period.endDate !== '' }))
    .filter((period) => period.start && (!period.hasEnd || (period.end && period.end >= period.start)))
    .sort((a, b) => a.start!.localeCompare(b.start!));
  const selected = validPeriods.find((period) => period.start! >= today || (period.end && period.end >= today)) ?? validPeriods[0];
  const startDay = selected?.start ?? null;
  const endDay = selected?.end ?? null;
  const descriptions = Array.isArray(poi.hasDescription) ? poi.hasDescription.map(record) : [];
  const description = descriptions.map((item) => frenchLabel(item.shortDescription) ?? frenchLabel(item.description)).find(Boolean) ??
    descriptions.map((item) => label(item.shortDescription) ?? label(item.description)).find(Boolean) ?? null;
  const producerData = record(poi.hasBeenCreatedBy);
  const publisherData = record(first(poi.hasBeenPublishedBy));
  const type = record(first(poi.type));
  const theme = record(first(poi.hasTheme));
  const sourceTypes = sourceTerms(poi.type);
  const sourceThemes = sourceTerms(poi.hasTheme);
  const reasons: string[] = [];
  let quality: Quality = 'acceptable';
  const reject = (reason: string) => { quality = 'rejete'; reasons.push(reason); };
  const review = (reason: string) => { if (quality !== 'rejete') quality = 'a_verifier'; reasons.push(reason); };

  const id = string(poi.uuid, 128);
  const title = label(poi.label);
  const producer = string(producerData.legalName) ?? string(producerData.identifier);
  const category = label(first(poi.type)) ?? label(type.label);
  if (!id) reject('Identifiant source absent.');
  if (!title) reject('Titre absent.');
  if (!startDay) reject('Date de début absente ou incohérente.');
  else if (endDay && endDay < today) reject('Événement terminé.');
  else if (!endDay && startDay < today) reject('Date de début passée sans date de fin connue.');
  if (periods.length && !validPeriods.length) reject('Périodes de l’événement incohérentes.');
  else if (validPeriods.length !== periods.length) review('Certaines périodes sont incohérentes.');
  if (department !== requestedDepartment) reject('Département absent ou différent du périmètre demandé.');
  if (!producer) reject('Producteur non renseigné.');
  if (!description) review('Description absente.');
  if (!category) review('Catégorie non renseignée.');
  if (!city) review('Commune non renseignée.');
  if (!location) review('Coordonnées absentes : emplacement à vérifier.');
  if (validPeriods.length > 1) review('Plusieurs périodes : vérifier les dates avant toute sélection.');

  return {
    id: id ?? `source_sans_identifiant_${index}`,
    title, description, startDay, endDay, city, department,
    category,
    subcategory: label(theme.label) ?? label(first(poi.hasTheme)), producer,
    sourceTypes, sourceThemes,
    provenance: string(publisherData.legalName) ?? string(publisherData.identifier) ?? 'DATAtourisme',
    location,
    positionPrecision: location ? 'source_coordinates' : string(address.streetAddress) ? 'address_only' : city ? 'commune_only' : 'unknown',
    updatedAt: string(poi.lastUpdate, 40) ?? string(poi.lastUpdateDatatourisme, 40),
    sourceUrl: httpsUrl(poi.uri), quality, reasons, possibleDuplicate: false
  };
}

function flagSampleDuplicates(candidates: AnalysisCandidate[]): void {
  const groups = new Map<string, AnalysisCandidate[]>();
  for (const candidate of candidates) {
    if (!candidate.title || !candidate.city || !candidate.startDay) continue;
    const key = [candidate.title, candidate.city, candidate.startDay].join('|').normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9|]/g, '');
    groups.set(key, [...(groups.get(key) ?? []), candidate]);
  }
  for (const group of groups.values()) {
    if (group.length < 2) continue;
    for (const candidate of group) {
      candidate.possibleDuplicate = true;
      if (candidate.quality === 'acceptable') candidate.quality = 'a_verifier';
      candidate.reasons.push('Doublon possible dans les résultats examinés : vérification humaine requise.');
    }
  }
}

export function validateAnalysisRequest(input: unknown): { department: Department; page: number } {
  const data = record(input);
  if (Object.keys(data).some((key) => key !== 'department' && key !== 'page') ||
      !DEPARTMENTS.includes(data.department as Department) ||
      !Number.isInteger(data.page) || (data.page as number) < 1 || (data.page as number) > MAX_PAGE) {
    throw new HttpsError('invalid-argument', 'INVALID_ANALYSIS_REQUEST');
  }
  return { department: data.department as Department, page: data.page as number };
}

async function boundedJson(response: Response): Promise<unknown> {
  const reader = response.body?.getReader();
  if (!reader) throw new HttpsError('unavailable', 'DATATOURISME_UNAVAILABLE');
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_RESPONSE_BYTES) throw new HttpsError('resource-exhausted', 'DATATOURISME_RESPONSE_TOO_LARGE');
      chunks.push(value);
    }
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch (error) {
    if (error instanceof HttpsError) throw error;
    throw new HttpsError('unavailable', 'DATATOURISME_INVALID_RESPONSE');
  } finally {
    await reader.cancel().catch(() => undefined);
  }
}

export async function analyzeDatatourisme(
  db: Pick<Firestore, 'doc'>,
  uid: string | undefined,
  input: unknown,
  apiKey: () => string,
  fetcher: typeof fetch = fetch,
  now = new Date()
): Promise<AnalysisResult> {
  if (!uid) throw new HttpsError('unauthenticated', 'AUTH_REQUIRED');
  const user = await db.doc(`users/${uid}`).get();
  if (user.data()?.role !== 'owner') throw new HttpsError('permission-denied', 'PLATFORM_OWNER_REQUIRED');
  const { department, page } = validateAnalysisRequest(input);
  const key = apiKey();
  if (!key) throw new HttpsError('failed-precondition', 'DATATOURISME_NOT_CONFIGURED');

  const url = new URL(API_URL);
  url.searchParams.set('department', department);
  url.searchParams.set('page', String(page));
  url.searchParams.set('page_size', String(PAGE_SIZE));
  url.searchParams.set('lang', 'fr');
  url.searchParams.set('fields', 'uuid,uri,label,type,hasTheme,takesPlaceAt,isLocatedAt.address,isLocatedAt.geo,hasDescription,hasBeenCreatedBy.legalName,hasBeenCreatedBy.identifier,hasBeenPublishedBy.legalName,hasBeenPublishedBy.identifier,lastUpdate,lastUpdateDatatourisme');

  let response: Response;
  try {
    response = await fetcher(url, { headers: { 'X-API-Key': key }, signal: AbortSignal.timeout(8000), redirect: 'error' });
  } catch {
    throw new HttpsError('unavailable', 'DATATOURISME_UNAVAILABLE');
  }
  if (response.status === 429) throw new HttpsError('resource-exhausted', 'DATATOURISME_QUOTA');
  if (!response.ok) throw new HttpsError('unavailable', 'DATATOURISME_UNAVAILABLE');
  const payload = record(await boundedJson(response));
  const meta = record(payload.meta);
  if (!Array.isArray(payload.objects) || payload.objects.length > PAGE_SIZE ||
      !Number.isSafeInteger(meta.total) || (meta.total as number) < 0 || meta.page !== page) {
    throw new HttpsError('unavailable', 'DATATOURISME_INVALID_RESPONSE');
  }
  const today = now.toISOString().slice(0, 10);
  const candidates = payload.objects.map((item, index) => normalizeCandidate(item, department, today, index));
  flagSampleDuplicates(candidates);
  return {
    candidates,
    meta: {
      department, page, pageSize: PAGE_SIZE, examinedCount: candidates.length,
      apiTotal: meta.total as number,
      hasNextPage: page < MAX_PAGE && (page * PAGE_SIZE < (meta.total as number)) && candidates.length === PAGE_SIZE
    }
  };
}
