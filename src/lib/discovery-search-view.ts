import type { DiscoverySearchResult } from './discovery-search-dto';

export type DiscoverySearchStatus = 'idle' | 'loading' | 'success' | 'error' | 'too-large';
export type DiscoverySearchView = {
  status: DiscoverySearchStatus;
  message: string | null;
  result: DiscoverySearchResult | null;
  selectedId: string | null;
};

export const initialDiscoverySearchView: DiscoverySearchView = {
  status: 'idle', message: null, result: null, selectedId: null,
};

export type DiscoverySearchAction =
  | { type: 'start' }
  | { type: 'success'; result: DiscoverySearchResult }
  | { type: 'failure'; status: 'error' | 'too-large'; message: string }
  | { type: 'interrupt' }
  | { type: 'message'; message: string | null }
  | { type: 'select'; id: string };

/** Keep the last completed search visible until a newer one succeeds. */
export function discoverySearchViewReducer(view: DiscoverySearchView, action: DiscoverySearchAction): DiscoverySearchView {
  switch (action.type) {
    case 'start': return { ...view, status: 'loading', message: null };
    case 'success': return { status: 'success', message: null, result: action.result, selectedId: null };
    case 'failure': return { ...view, status: action.status, message: action.message };
    case 'interrupt': return { ...view, status: 'idle', message: null };
    case 'message': return { ...view, message: action.message };
    case 'select': return { ...view, selectedId: action.id };
  }
}

export function showingPreviousDiscoveryResults(view: DiscoverySearchView, hasPendingBounds: boolean): boolean {
  return view.result !== null && (view.status !== 'success' || hasPendingBounds);
}
