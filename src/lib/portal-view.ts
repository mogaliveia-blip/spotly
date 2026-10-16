import type { AppConfig } from './types';

export type PortalView = 'loading' | 'config-error' | 'events-error' | 'landing' | 'portal';

export function selectPortalView(
  config: AppConfig | null | undefined,
  initialEventsResolved: boolean,
  eventsCount: number,
  eventsStatus: 'loading' | 'refreshing' | 'success' | 'error',
  hasSuccessfulEventsLoad: boolean,
): PortalView {
  if (config === undefined) return 'loading';
  if (config === null) return 'config-error';
  if (!config.isLandingPageActive) return 'portal';
  if (!initialEventsResolved) return 'loading';
  if (eventsCount === 0 && !hasSuccessfulEventsLoad) {
    return eventsStatus === 'error' ? 'events-error' : 'loading';
  }
  return eventsCount === 0 ? 'landing' : 'portal';
}
