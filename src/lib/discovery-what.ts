import { discoveryCategories, isCatalogId } from './event-discovery';
import type { DiscoveryCategoryId } from './event-discovery';
import type { DiscoveryArea, DiscoveryWhen, SearchDiscoveryRequest } from '../../functions/src/discovery-search-contract';

export type DiscoveryCategorySelection = DiscoveryCategoryId | 'all';
export const DEFAULT_DISCOVERY_CATEGORY: DiscoveryCategorySelection = 'all';
export const DISCOVERY_CATEGORY_SESSION_KEY = 'discovery:category:v1';

/** Session storage is untrusted; removed or unknown catalog IDs mean no filter. */
export function parseDiscoveryCategorySession(raw: string | null): DiscoveryCategorySelection {
  if (!raw) return DEFAULT_DISCOVERY_CATEGORY;
  try {
    const value: unknown = JSON.parse(raw);
    return value === 'all' || isCatalogId(discoveryCategories, value) ? value : DEFAULT_DISCOVERY_CATEGORY;
  } catch {
    return DEFAULT_DISCOVERY_CATEGORY;
  }
}

export function discoverySearchRequest(
  area: DiscoveryArea, when: DiscoveryWhen, category: DiscoveryCategorySelection,
): SearchDiscoveryRequest {
  return category === 'all' ? { area, when } : { area, when, categoryId: category };
}
