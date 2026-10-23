/** Inactive server-side detail adapter. A future authorized Function must supply the secret and fetcher. */
import { pilotTemporalIssue } from './datatourisme-periods';

const API_ORIGIN = 'https://api.datatourisme.fr';
const DETAIL_FIELDS = [
  'uuid', 'uri', 'label', 'type', 'hasTheme', 'takesPlaceAt',
  'isLocatedAt.label', 'isLocatedAt.address', 'isLocatedAt.geo', 'hasDescription',
  'hasBeenCreatedBy.legalName', 'hasBeenCreatedBy.identifier',
  'hasBeenPublishedBy.legalName', 'hasBeenPublishedBy.identifier',
  'lastUpdate', 'lastUpdateDatatourisme',
].join(',');
const MAX_BYTES = 2_000_000;
const TIMEOUT_MS = 8_000;
const UUID_PATTERN = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/;

export function canonicalDatatourismeUuid(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const uuid = value.toLowerCase();
  return UUID_PATTERN.test(uuid) ? uuid : null;
}

export type DetailResult =
  | { kind: 'found'; poi: unknown; /** HTTP body parsed; not a proof of occurrence exhaustiveness. */ complete: true }
  | { kind: 'not_found' }
  | { kind: 'error'; reason: 'invalid_uuid' | 'not_configured' | 'quota' | 'unavailable' | 'invalid_response' | 'too_large' };

export type AttestedDetailResult = Exclude<DetailResult, { kind: 'found' }> | {
  kind: 'attested';
  temporal: { httpUsable: true; periodsReceived: number; pilotCompatible: boolean; exhaustive: false; reason: string | null };
};
const attestations = new WeakMap<object, { uuid: string; timezone: string; detail: Extract<DetailResult, { kind: 'found' }>; snapshot: string }>();

async function boundedJson(response: Response): Promise<{ kind: 'ok'; value: unknown } | { kind: 'error'; reason: 'invalid_response' | 'too_large' }> {
  const declared = Number(response.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > MAX_BYTES) return { kind: 'error', reason: 'too_large' };
  const reader = response.body?.getReader();
  if (!reader) return { kind: 'error', reason: 'invalid_response' };
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      size += chunk.value.byteLength;
      if (size > MAX_BYTES) return { kind: 'error', reason: 'too_large' };
      chunks.push(chunk.value);
    }
    return { kind: 'ok', value: JSON.parse(Buffer.concat(chunks).toString('utf8')) };
  } catch {
    return { kind: 'error', reason: 'invalid_response' };
  } finally {
    await reader.cancel().catch(() => undefined);
  }
}

/** No client URL, redirects, raw response body, or secret are included in results or logs. */
export async function fetchDatatourismeDetail(
  requestedUuid: unknown,
  apiKey: () => string,
  fetcher: typeof fetch,
): Promise<DetailResult> {
  const uuid = canonicalDatatourismeUuid(requestedUuid);
  if (!uuid) return { kind: 'error', reason: 'invalid_uuid' };
  let key: string;
  try { key = apiKey(); } catch { return { kind: 'error', reason: 'not_configured' }; }
  if (!key) return { kind: 'error', reason: 'not_configured' };
  const url = new URL(`/v1/catalog/${uuid}`, API_ORIGIN);
  url.searchParams.set('fields', DETAIL_FIELDS);
  url.searchParams.set('lang', 'fr,en');
  let response: Response;
  try {
    response = await fetcher(url, {
      method: 'GET', headers: { 'X-API-Key': key, Accept: 'application/json' },
      signal: AbortSignal.timeout(TIMEOUT_MS), redirect: 'error',
    });
  } catch {
    return { kind: 'error', reason: 'unavailable' };
  }
  if (response.status === 404) return { kind: 'not_found' };
  if (response.status === 429) return { kind: 'error', reason: 'quota' };
  if (!response.ok) return { kind: 'error', reason: 'unavailable' };
  const parsed = await boundedJson(response);
  if (parsed.kind === 'error') return parsed;
  const poi = parsed.value;
  if (!poi || typeof poi !== 'object' || Array.isArray(poi) ||
      canonicalDatatourismeUuid((poi as Record<string, unknown>).uuid) !== uuid) {
    return { kind: 'error', reason: 'invalid_response' };
  }
  return { kind: 'found', poi, complete: true };
}

/** An in-memory capability created only by this server fetch. HTTP success does not prove occurrence exhaustiveness. */
export async function fetchAttestedDatatourismeDetail(
  requestedUuid: unknown, timezone: string, apiKey: () => string, fetcher: typeof fetch = fetch,
): Promise<AttestedDetailResult> {
  const detail = await fetchDatatourismeDetail(requestedUuid, apiKey, fetcher);
  if (detail.kind !== 'found') return detail;
  const uuid = canonicalDatatourismeUuid(requestedUuid)!;
  const periods = (detail.poi as Record<string, unknown>).takesPlaceAt;
  const reason = pilotTemporalIssue(periods, timezone);
  const token: AttestedDetailResult = Object.freeze({
    kind: 'attested',
    temporal: Object.freeze({ httpUsable: true, periodsReceived: Array.isArray(periods) ? periods.length : 0,
      pilotCompatible: reason === null, exhaustive: false, reason }),
  });
  attestations.set(token, { uuid, timezone, detail, snapshot: JSON.stringify(detail.poi) });
  return token;
}

/** Reject JSON, forged objects, cross-UUID reuse and mutation of the verified response at runtime. */
export function verifyAttestedDatatourismeDetail(
  token: unknown, requestedUuid: unknown, timezone: string,
): { detail: Extract<DetailResult, { kind: 'found' }>; temporalIssue: string | null } | null {
  if (!token || typeof token !== 'object') return null;
  const stored = attestations.get(token);
  const uuid = canonicalDatatourismeUuid(requestedUuid);
  if (!stored || !uuid || stored.uuid !== uuid || stored.timezone !== timezone) return null;
  try {
    if (JSON.stringify(stored.detail.poi) !== stored.snapshot) return null;
    const poi = JSON.parse(stored.snapshot) as Record<string, unknown>;
    if (canonicalDatatourismeUuid(poi.uuid) !== uuid) return null;
    const temporalIssue = pilotTemporalIssue(poi.takesPlaceAt, timezone);
    return { detail: { kind: 'found', poi, complete: true }, temporalIssue };
  } catch {
    return null;
  }
}
