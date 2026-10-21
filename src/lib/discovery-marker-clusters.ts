import type { DiscoveryDisplayEvent } from './discovery-external-demo';

export type MarkerViewport = {
  center: { lat: number; lng: number };
  zoom: number;
  width: number;
  height: number;
};

export type DiscoveryMarkerCluster = {
  id: string;
  position: { lat: number; lng: number };
  members: DiscoveryDisplayEvent[];
  approximateCount: number;
};

const TILE_SIZE = 256;
const CELL_SIZE = 64;

function worldPixel(position: { lat: number; lng: number }, zoom: number) {
  const size = TILE_SIZE * 2 ** zoom;
  const latitude = Math.max(-85.05112878, Math.min(85.05112878, position.lat));
  const sine = Math.sin(latitude * Math.PI / 180);
  return {
    x: (position.lng + 180) / 360 * size,
    y: (0.5 - Math.log((1 + sine) / (1 - sine)) / (4 * Math.PI)) * size,
  };
}

/** Groups only visible results. The marker stays at a real member coordinate. */
export function clusterDiscoveryMarkers(results: readonly DiscoveryDisplayEvent[], viewport: MarkerViewport): DiscoveryMarkerCluster[] {
  if (viewport.width <= 0 || viewport.height <= 0) return [];
  const center = worldPixel(viewport.center, viewport.zoom);
  const cells = new Map<string, DiscoveryMarkerCluster>();
  for (const result of results) {
    const point = worldPixel(result.position, viewport.zoom);
    const x = point.x - center.x + viewport.width / 2;
    const y = point.y - center.y + viewport.height / 2;
    if (x < -CELL_SIZE || x > viewport.width + CELL_SIZE || y < -CELL_SIZE || y > viewport.height + CELL_SIZE) continue;
    const cell = `${Math.floor(x / CELL_SIZE)}:${Math.floor(y / CELL_SIZE)}`;
    let cluster = cells.get(cell);
    if (!cluster) {
      cluster = { id: cell, position: result.position, members: [], approximateCount: 0 };
      cells.set(cell, cluster);
    }
    cluster.members.push(result);
    if (result.origin === 'external_demo' && result.positionPrecision !== 'source_gps') cluster.approximateCount++;
  }
  return [...cells.values()];
}

export function markerClusterTitle(cluster: DiscoveryMarkerCluster): string {
  const count = cluster.members.length;
  if (count === 1) {
    const result = cluster.members[0];
    return result.origin === 'external_demo' && result.positionPrecision === 'commune_center'
      ? `${result.title} — position approximative au centre de la commune`
      : result.origin === 'external_demo' && result.positionPrecision === 'address_geocoded'
        ? `${result.title} — position géocodée depuis une adresse`
        : result.title;
  }
  return `${count} événements${cluster.approximateCount > 0
    ? `, dont ${cluster.approximateCount} à position estimée ou approximative` : ''}`;
}
