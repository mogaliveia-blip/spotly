import {
  geohashForLocation, geohashQueryBounds, geohashQuery, boundingBoxBits, boundingBoxCoordinates, metersToLongitudeDegrees,
  EARTH_EQ_RADIUS, E2, METERS_PER_DEGREE_LATITUDE,
} from 'geofire-common';
import { isDiscoveryPosition } from './event-discovery';
import type { DiscoveryPosition } from './event-discovery';
import type { DiscoveryArea } from './discovery-search-contract';
import { isDataObject } from './discovery-search-contract';

export const DISCOVERY_RADIUS_METERS = 25_000;
export const DISCOVERY_MAX_BOUNDS_DIAGONAL_KM = 200;
export const DISCOVERY_GEOHASH_PRECISION = 10;
export type MapBounds = { north: number; south: number; east: number; west: number };
export type GeohashRange = [string, string];
const EARTH_RADIUS_METERS = 6_371_000;
const radians = (degrees: number) => degrees * Math.PI / 180;

// GeoFire uses N(phi) = a/sqrt(1-e²sin²(phi)) for longitude, rather than our sphere.
// N(phi) <= a/sqrt(1-e²). Scaling only the cover by that maximum/R bounds every
// spherical path in GeoFire's metric. Its latitude scale is bounded here as well.
export const GEOHASH_COVERAGE_FACTOR = Math.max(1,
  EARTH_EQ_RADIUS / Math.sqrt(1 - E2) / EARTH_RADIUS_METERS,
  METERS_PER_DEGREE_LATITUDE / (EARTH_RADIUS_METERS * Math.PI / 180));

export function isLatLng(value: unknown): value is DiscoveryPosition {
  return isDataObject(value, ['lat', 'lng']) && isDiscoveryPosition(value);
}
export function discoveryGeohash(position: DiscoveryPosition): string {
  return geohashForLocation([position.lat, position.lng], DISCOVERY_GEOHASH_PRECISION);
}
/** Spherical great-circle distance, not road distance. */
export function distanceMeters(a: DiscoveryPosition, b: DiscoveryPosition): number {
  const latitudeDelta = radians(b.lat - a.lat);
  const longitudeDelta = radians(b.lng - a.lng);
  const haversine = Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(radians(a.lat)) * Math.cos(radians(b.lat)) * Math.sin(longitudeDelta / 2) ** 2;
  // Floating-point rounding can put antipodal points just above one.
  const bounded = Math.max(0, Math.min(1, haversine));
  return 2 * EARTH_RADIUS_METERS * Math.atan2(Math.sqrt(bounded), Math.sqrt(1 - bounded));
}
export function pointInRadius(point: DiscoveryPosition, center: DiscoveryPosition): boolean {
  return distanceMeters(point, center) <= DISCOVERY_RADIUS_METERS;
}
export function longitudeSpan(bounds: MapBounds): number {
  return bounds.west <= bounds.east ? bounds.east - bounds.west : 360 - bounds.west + bounds.east;
}
export function isMapBounds(value: unknown): value is MapBounds {
  if (!isDataObject(value, ['north', 'south', 'east', 'west'], ['kind'])) return false;
  const b = value as MapBounds;
  return ['north', 'south', 'east', 'west'].every((key) =>
    typeof b[key as keyof MapBounds] === 'number' && Number.isFinite(b[key as keyof MapBounds])) &&
    b.south >= -90 && b.north <= 90 && b.south < b.north &&
    b.west >= -180 && b.west <= 180 && b.east >= -180 && b.east <= 180 && longitudeSpan(b) > 0;
}
function dimensions(bounds: MapBounds): [number, number] {
  const nearestEquator = bounds.south <= 0 && bounds.north >= 0 ? 0 : Math.min(Math.abs(bounds.south), Math.abs(bounds.north));
  return [EARTH_RADIUS_METERS * radians(bounds.north - bounds.south),
    EARTH_RADIUS_METERS * radians(longitudeSpan(bounds)) * Math.cos(radians(nearestEquator))];
}
export function isAllowedBounds(bounds: MapBounds): boolean {
  // Explicit longitude extent prevents world views from masquerading as a short geodesic.
  return isMapBounds(bounds) && longitudeSpan(bounds) < 180 &&
    Math.hypot(...dimensions(bounds)) <= DISCOVERY_MAX_BOUNDS_DIAGONAL_KM * 1000;
}
export function pointInBounds(point: DiscoveryPosition, bounds: MapBounds): boolean {
  const latitudeMatches = point.lat >= bounds.south && point.lat <= bounds.north;
  const containsLongitude = (lng: number) => bounds.west <= bounds.east ? lng >= bounds.west && lng <= bounds.east :
    lng >= bounds.west || lng <= bounds.east;
  // +180 and -180 describe the same meridian, including a rectangle ending there.
  return latitudeMatches && (containsLongitude(point.lng) ||
    (Math.abs(point.lng) === 180 && containsLongitude(-point.lng)));
}
export function splitBounds(bounds: MapBounds): MapBounds[] {
  return bounds.west <= bounds.east ? [bounds] : [
    { ...bounds, east: 180 }, { ...bounds, west: -180 },
  ].filter((part) => longitudeSpan(part) > 0);
}
function circleRanges(center: DiscoveryPosition, radius: number): GeohashRange[] {
  const location: [number, number] = [center.lat, center.lng];
  const coverRadius = Math.max(2, radius * GEOHASH_COVERAGE_FACTOR);
  const coordinates = boundingBoxCoordinates(location, coverRadius);
  const longitudeDelta = Math.max(...coordinates.map(([lat]) => metersToLongitudeDegrees(coverRadius, lat)));
  if (longitudeDelta >= 180) {
    // A box with a half-width >=180 covers all longitudes. GeoFire's +/-360 samples wrap back to
    // the same longitude. Two bits retain the latitude hemisphere when possible.
    const bits = coordinates.every(([lat]) => lat >= 0) || coordinates.every(([lat]) => lat <= 0) ? 2 : 1;
    return coordinates.flatMap(([lat]) => [-180, 0, 180].map((lng) =>
      geohashQuery(geohashForLocation([lat, lng], DISCOVERY_GEOHASH_PRECISION), bits)));
  }
  // GeoFire's latitude cell scale uses C_meridian/360, while its box uses 110574
  // m/degree. At a precision threshold a probe can skip a row. Removing one bit
  // per axis doubles each cell extent; 2*110574 > C_meridian/360, so consecutive
  // box probes cannot skip a parent cell. Longitude cells already bound its delta.
  // Capping precision also encloses viewports smaller than the persisted index.
  const bits = Math.max(1, Math.min(DISCOVERY_GEOHASH_PRECISION * 5,
    boundingBoxBits(location, coverRadius) - 2));
  return geohashQueryBounds(location, coverRadius).map(([lo]) => geohashQuery(lo, bits));
}
export function mergeGeohashRanges(ranges: GeohashRange[]): GeohashRange[] {
  const result: GeohashRange[] = [];
  for (const [lo, hi] of [...ranges].sort((a, b) => a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0)) {
    const last = result[result.length - 1];
    if (last && lo <= last[1]) last[1] = hi > last[1] ? hi : last[1];
    else result.push([lo, hi]);
  }
  return result;
}
export function geographicQueryRanges(area: DiscoveryArea): GeohashRange[] {
  if (area.kind === 'radius') return mergeGeohashRanges(circleRanges(area.center, DISCOVERY_RADIUS_METERS));
  return mergeGeohashRanges(splitBounds(area).flatMap((rectangle) => {
    const center = { lat: (rectangle.north + rectangle.south) / 2, lng: (rectangle.east + rectangle.west) / 2 };
    const [height, width] = dimensions(rectangle);
    // A meridian-then-parallel path bounds the distance to every point of the rectangle,
    // including edge interiors; corner-only distances are not a coverage proof.
    return circleRanges(center, (height + width) / 2);
  }));
}
