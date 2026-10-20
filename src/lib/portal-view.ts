import type { AppConfig } from './types';

export type PortalView = 'loading' | 'config-error' | 'landing' | 'portal';

export function selectPortalView(config: AppConfig | null | undefined): PortalView {
  if (config === undefined) return 'loading';
  if (config === null) return 'config-error';
  return config.isLandingPageActive ? 'landing' : 'portal';
}
