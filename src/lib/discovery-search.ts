import { httpsCallable } from 'firebase/functions';
import { functions } from './firebase';
import { decodeDiscoverySearchResponse } from './discovery-search-dto';
import type { DiscoverySearchResult, SearchDiscoveryRequest } from './discovery-search-dto';

/** Public callable adapter only. Search context and UI concurrency belong to D2. */
export async function searchDiscovery(request: SearchDiscoveryRequest): Promise<DiscoverySearchResult> {
  const callable = httpsCallable<SearchDiscoveryRequest, unknown>(functions, 'searchDiscovery');
  return decodeDiscoverySearchResponse((await callable(request)).data);
}
