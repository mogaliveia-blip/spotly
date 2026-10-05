// One pure contract for the browser and Functions, within the Functions build root.
export {
  eventDiscoveryTypes, discoveryCategories, discoveryTags, isDiscoveryPosition, isCatalogId,
} from '../../functions/src/event-discovery'
export type {
  DiscoveryPosition, EventDiscoveryTypeId, DiscoveryCategoryId, DiscoveryTagId,
  EventDiscoverySettings, EventDiscoverySettingsPatch,
} from '../../functions/src/event-discovery'
