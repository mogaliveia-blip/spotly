import { isCalendarDay } from './event-time';
import type { DiscoveryWhen, DiscoveryArea } from '../../functions/src/discovery-search-contract';
import type { DiscoverySession } from './discovery-geography';

export const DISCOVERY_WHEN_SESSION_KEY = 'discovery:when:v1';
export const DEFAULT_DISCOVERY_WHEN: DiscoveryWhen = { kind: 'today' };

/** Session storage is untrusted; keep its temporal choice separate from D2 geography. */
export function parseDiscoveryWhenSession(raw: string | null): DiscoveryWhen {
  if (!raw) return DEFAULT_DISCOVERY_WHEN;
  try {
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== 'object' || Array.isArray(value)) return DEFAULT_DISCOVERY_WHEN;
    const input = value as Record<string, unknown>;
    const keys = Object.keys(input);
    if (input.kind === 'date' && keys.length === 2 && keys.includes('kind') && keys.includes('day') && isCalendarDay(input.day)) {
      return { kind: 'date', day: input.day };
    }
    if (keys.length === 1 && keys[0] === 'kind' &&
        (input.kind === 'today' || input.kind === 'tomorrow' || input.kind === 'weekend')) {
      return { kind: input.kind };
    }
  } catch { /* A damaged session falls back to Today. */ }
  return DEFAULT_DISCOVERY_WHEN;
}

/** A temporal change searches the validated area, never unconfirmed map bounds. */
export function searchAreaForWhenChange(session: DiscoverySession): DiscoveryArea | null {
  return session.context?.area ?? null;
}
