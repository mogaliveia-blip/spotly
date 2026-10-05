// Stable IDs are independent of labels. Event types are separate from future Place types.
export const eventDiscoveryTypes = [
  { id: 'festival', label: 'Festival' },
  { id: 'concert', label: 'Concert' },
  { id: 'market', label: 'Marché' },
  { id: 'trail', label: 'Trail' },
  { id: 'other', label: 'Autre' },
] as const;

export const discoveryCategories = [
  { id: 'music', label: 'Musique' },
  { id: 'culture', label: 'Culture' },
  { id: 'gastronomy', label: 'Gastronomie' },
  { id: 'sport', label: 'Sport' },
  { id: 'nature', label: 'Nature' },
  { id: 'other', label: 'Autre' },
] as const;

export const discoveryTags = [
  { id: 'family', label: 'En famille' },
  { id: 'outdoor', label: 'Plein air' },
  { id: 'free', label: 'Gratuit' },
] as const;

export type EventDiscoveryTypeId = typeof eventDiscoveryTypes[number]['id'];
export type DiscoveryCategoryId = typeof discoveryCategories[number]['id'];
export type DiscoveryTagId = typeof discoveryTags[number]['id'];
export interface DiscoveryPosition { lat: number; lng: number }

export interface EventDiscoverySettings {
  discoveryPosition?: DiscoveryPosition;
  typeId?: EventDiscoveryTypeId;
  categoryId?: DiscoveryCategoryId;
  tags?: DiscoveryTagId[];
}

/** Omitted fields are preserved; null explicitly removes a field. */
export type EventDiscoverySettingsPatch = {
  [K in keyof EventDiscoverySettings]?: EventDiscoverySettings[K] | null;
};

export function isDiscoveryPosition(value: unknown): value is DiscoveryPosition {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const position = value as Record<string, unknown>;
  return Object.keys(position).length === 2 &&
    typeof position.lat === 'number' && Number.isFinite(position.lat) &&
    position.lat >= -90 && position.lat <= 90 &&
    typeof position.lng === 'number' && Number.isFinite(position.lng) &&
    position.lng >= -180 && position.lng <= 180;
}

export function isCatalogId<T extends string>(
  catalog: readonly { id: T }[], value: unknown
): value is T {
  return typeof value === 'string' && catalog.some((entry) => entry.id === value);
}
