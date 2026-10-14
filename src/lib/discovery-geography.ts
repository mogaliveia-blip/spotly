import { isDiscoveryPosition } from './event-discovery';
import type { DiscoveryArea } from '../../functions/src/discovery-search-contract';

export type DiscoverySource = 'gps' | 'place' | 'map';
export type DiscoveryCamera = { center: { lat: number; lng: number }; zoom: number };
export type DiscoveryContext = { source: DiscoverySource; area: DiscoveryArea };
export type DiscoverySession = {
  context: DiscoveryContext | null;
  camera: DiscoveryCamera;
  pendingBounds: Extract<DiscoveryArea, { kind: 'bounds' }> | null;
};

export const DISCOVERY_SESSION_KEY = 'discovery:geography:v1';
export const DEFAULT_DISCOVERY_CAMERA: DiscoveryCamera = { center: { lat: 46.6, lng: 2.4 }, zoom: 6 };

export function focusDiscoveryResult(session: DiscoverySession, position: DiscoveryCamera['center']): DiscoverySession {
  return { ...session, camera: { center: { ...position }, zoom: session.camera.zoom } };
}

/** A later PLACE or MAP intent makes an outstanding GPS answer obsolete. */
export class DiscoveryLocationIntent {
  private revision = 0;

  invalidate() {
    this.revision += 1;
  }

  async requestGps(
    requestPosition: () => Promise<DiscoveryCamera['center']>,
    onPosition: (position: DiscoveryCamera['center']) => void,
    onError: (error: unknown) => void,
  ): Promise<boolean> {
    const revision = ++this.revision;
    try {
      const position = await requestPosition();
      if (revision === this.revision) onPosition(position);
    } catch (error) {
      if (revision === this.revision) onError(error);
    }
    return revision === this.revision;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isBounds(value: unknown): value is Extract<DiscoveryArea, { kind: 'bounds' }> {
  if (!isRecord(value) || value.kind !== 'bounds') return false;
  const { north, south, east, west } = value;
  return [north, south, east, west].every((coordinate) => typeof coordinate === 'number' && Number.isFinite(coordinate)) &&
    (south as number) >= -90 && (north as number) <= 90 && (south as number) < (north as number) &&
    (east as number) >= -180 && (east as number) <= 180 &&
    (west as number) >= -180 && (west as number) <= 180 && east !== west;
}

function isArea(value: unknown): value is DiscoveryArea {
  return isBounds(value) || (isRecord(value) && value.kind === 'radius' && isDiscoveryPosition(value.center));
}

/** Session storage is untrusted input; only validated geography reaches the D1 callable. */
export function parseDiscoverySession(raw: string | null): DiscoverySession | null {
  if (!raw) return null;
  try {
    const value: unknown = JSON.parse(raw);
    if (!isRecord(value) || !isRecord(value.camera) ||
        !isDiscoveryPosition(value.camera.center) ||
        typeof value.camera.zoom !== 'number' || !Number.isFinite(value.camera.zoom) ||
        value.camera.zoom < 0 || value.camera.zoom > 22 ||
        (value.pendingBounds !== null && !isBounds(value.pendingBounds))) return null;

    const context = value.context;
    if (context !== null && (!isRecord(context) ||
        !['gps', 'place', 'map'].includes(context.source as string) || !isArea(context.area) ||
        (context.source === 'map') !== (context.area.kind === 'bounds'))) return null;

    const area = context === null ? null : (context as DiscoveryContext).area;
    const normalizedArea: DiscoveryArea | null = area?.kind === 'radius'
      ? { kind: 'radius', center: { lat: area.center.lat, lng: area.center.lng } }
      : area?.kind === 'bounds'
        ? { kind: 'bounds', north: area.north, south: area.south, east: area.east, west: area.west }
        : null;
    const pending = value.pendingBounds as Extract<DiscoveryArea, { kind: 'bounds' }> | null;
    return {
      context: context === null ? null : { source: (context as DiscoveryContext).source, area: normalizedArea! },
      camera: {
        center: { lat: value.camera.center.lat, lng: value.camera.center.lng },
        zoom: value.camera.zoom,
      },
      pendingBounds: pending === null ? null : {
        kind: 'bounds', north: pending.north, south: pending.south, east: pending.east, west: pending.west,
      },
    };
  } catch {
    return null;
  }
}

export function isDiscoveryAreaTooLarge(error: unknown): boolean {
  return isRecord(error) && error.code === 'functions/invalid-argument' &&
    isRecord(error.details) && error.details.reason === 'DISCOVERY_AREA_TOO_LARGE';
}
