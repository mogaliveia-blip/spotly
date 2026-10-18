export const DISCOVERY_RETURN_SESSION_KEY = 'discovery:return:v1';
export const DISCOVERY_RETURN_PARAM = 'discoveryOrigin';

const RETURN_MAX_AGE_MS = 30 * 60 * 1000;
const TOKEN_PATTERN = /^[0-9a-f]{32}$/;

export function createDiscoveryReturnToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export function discoveryEventHref(slug: string, token: string | null): string {
  const path = `/${encodeURIComponent(slug)}/dashboard`;
  return token ? `${path}?${DISCOVERY_RETURN_PARAM}=${token}` : path;
}

export function discoveryReturnIntent(slug: string, token: string, createdAt = Date.now()): string {
  return JSON.stringify({ slug, token, createdAt });
}

export function hasDiscoveryReturnOrigin(raw: string | null, slug: string, token: string | null, now = Date.now()): boolean {
  if (!raw || !token || !TOKEN_PATTERN.test(token)) return false;
  try {
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
    const intent = value as Record<string, unknown>;
    return Object.keys(intent).length === 3 &&
      intent.slug === slug && intent.token === token &&
      typeof intent.createdAt === 'number' && Number.isFinite(intent.createdAt) &&
      now >= intent.createdAt && now - intent.createdAt <= RETURN_MAX_AGE_MS;
  } catch {
    return false;
  }
}
