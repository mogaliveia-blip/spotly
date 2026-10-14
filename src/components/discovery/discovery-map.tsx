'use client';

import { useCallback, useEffect, useLayoutEffect, useRef } from 'react';
import { AdvancedMarker, Map, useMap } from '@vis.gl/react-google-maps';
import { MapPin } from 'lucide-react';
import type { DiscoveryResult } from '@/lib/discovery-search-dto';
import type { DiscoveryCamera } from '@/lib/discovery-geography';
import type { DiscoveryArea } from '../../../functions/src/discovery-search-contract';
import { mapsConfig } from '@/lib/firebase-config';
import { DiscoveryMapMovement } from './discovery-map-movement';

type BoundsArea = Extract<DiscoveryArea, { kind: 'bounds' }>;

function CameraController({ request, onMoveStart }: {
  request: DiscoveryCamera & { sequence: number };
  onMoveStart: (target: DiscoveryCamera, currentZoom: number | undefined) => void;
}) {
  const map = useMap();
  useEffect(() => {
    if (!map || request.sequence === 0) return;
    const center = map.getCenter();
    if (center && Math.abs(center.lat() - request.center.lat) < 1e-7 &&
        Math.abs(center.lng() - request.center.lng) < 1e-7 && map.getZoom() === request.zoom) return;
    onMoveStart(request, map.getZoom());
    map.panTo(request.center);
    if (map.getZoom() !== request.zoom) map.setZoom(request.zoom);
  }, [map, request, onMoveStart]);
  return null;
}

export function DiscoveryMap({ camera, cameraRequest, searchSequence, results, selectedId, onSelect, onManualMoveStart, onManualViewport }: {
  camera: DiscoveryCamera;
  cameraRequest: DiscoveryCamera & { sequence: number };
  searchSequence: number;
  results: DiscoveryResult[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onManualMoveStart: () => void;
  onManualViewport: (bounds: BoundsArea, camera: DiscoveryCamera) => void;
}) {
  const movementRef = useRef<DiscoveryMapMovement | null>(null);
  movementRef.current ??= new DiscoveryMapMovement();
  const movement = movementRef.current;

  useLayoutEffect(() => {
    if (searchSequence > 0) movement.finishManual();
  }, [movement, searchSequence]);

  const beginProgrammaticMove = useCallback((target: DiscoveryCamera, currentZoom: number | undefined) => {
    movement.beginProgrammatic(target, currentZoom);
  }, [movement]);

  return (
    <div className="h-full w-full" onPointerDownCapture={() => movement.noteUserInput()}
      onWheelCapture={() => movement.noteUserInput()} onKeyDownCapture={() => movement.noteUserInput()}>
    <Map
      defaultCenter={camera.center}
      defaultZoom={camera.zoom}
      mapId={mapsConfig.mapId}
      gestureHandling="cooperative"
      mapTypeControl={false}
      streetViewControl={false}
      fullscreenControl={false}
      className="h-full w-full"
      onDragstart={() => {
        if (movement.onDragstart()) onManualMoveStart();
      }}
      onDragend={() => movement.onDragend()}
      onZoomChanged={(event) => {
        if (movement.onZoomChanged(event.map.getZoom())) onManualMoveStart();
      }}
      onIdle={(event) => {
        const bounds = event.map.getBounds()?.toJSON();
        const center = event.map.getCenter()?.toJSON();
        const zoom = event.map.getZoom();
        if (!center || zoom === undefined) return;
        if (!movement.onIdle({ center, zoom }, !!bounds) || !bounds) return;
        onManualViewport({ kind: 'bounds', ...bounds }, { center, zoom });
      }}
    >
      <CameraController request={cameraRequest} onMoveStart={beginProgrammaticMove} />
      {results.map((result) => (
        <AdvancedMarker key={result.id} position={result.position} onClick={() => onSelect(result.id)} title={result.title}>
          <span className={`flex items-center justify-center rounded-full border-2 bg-white p-1 shadow-md ${selectedId === result.id ? 'border-accent text-accent' : 'border-primary text-primary'}`}>
            <MapPin className="h-6 w-6" />
          </span>
        </AdvancedMarker>
      ))}
    </Map>
    </div>
  );
}
