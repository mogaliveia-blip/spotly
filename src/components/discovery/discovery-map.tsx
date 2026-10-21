'use client';

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { AdvancedMarker, Map, useMap } from '@vis.gl/react-google-maps';
import { MapPin } from 'lucide-react';
import type { DiscoveryDisplayEvent } from '@/lib/discovery-external-demo';
import { clusterDiscoveryMarkers, markerClusterTitle } from '@/lib/discovery-marker-clusters';
import type { MarkerViewport } from '@/lib/discovery-marker-clusters';
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

function MarkerLayer({ results, selectedId, onSelect, onClusterSelect }: {
  results: DiscoveryDisplayEvent[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onClusterSelect: (ids: string[]) => void;
}) {
  const map = useMap();
  const [viewport, setViewport] = useState<MarkerViewport | null>(null);
  useEffect(() => {
    if (!map) return;
    const update = () => {
      const center = map.getCenter()?.toJSON();
      const zoom = map.getZoom();
      const div = map.getDiv();
      if (center && zoom !== undefined) setViewport({ center, zoom, width: div.clientWidth, height: div.clientHeight });
    };
    update();
    const idle = map.addListener('idle', update);
    const resize = new ResizeObserver(update);
    resize.observe(map.getDiv());
    return () => { idle.remove(); resize.disconnect(); };
  }, [map]);
  const clusters = viewport ? clusterDiscoveryMarkers(results, viewport) : [];
  return <>{clusters.map((cluster) => {
    const single = cluster.members.length === 1 ? cluster.members[0] : null;
    const selected = !!single && selectedId === single.id;
    return <AdvancedMarker key={cluster.id} position={cluster.position}
      onClick={() => single ? onSelect(single.id) : onClusterSelect(cluster.members.map((member) => member.id))}
      title={markerClusterTitle(cluster)}>
      {single ? <span className={`relative flex items-center justify-center rounded-full border-2 bg-white p-1 shadow-md ${selected ? 'border-accent text-accent' : single.origin === 'native' ? 'border-primary text-primary' : 'border-teal-700 text-teal-800'}`}>
        <MapPin aria-hidden="true" className="h-6 w-6" />
        {cluster.approximateCount > 0 && <span aria-hidden="true" className="absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full border border-white bg-orange-500" />}
      </span> : <span className="relative flex h-10 min-w-10 items-center justify-center rounded-full border-2 border-white bg-primary px-2 text-sm font-bold text-primary-foreground shadow-md">
        {cluster.members.length}
        {cluster.approximateCount > 0 && <span aria-hidden="true" className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full border border-white bg-orange-500" />}
      </span>}
    </AdvancedMarker>;
  })}</>;
}

export function DiscoveryMap({ camera, cameraRequest, searchSequence, results, selectedId, onSelect, onClusterSelect, onManualMoveStart, onManualViewport }: {
  camera: DiscoveryCamera;
  cameraRequest: DiscoveryCamera & { sequence: number };
  searchSequence: number;
  results: DiscoveryDisplayEvent[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onClusterSelect: (ids: string[]) => void;
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
      onPointerMoveCapture={(event) => { if (event.buttons) movement.noteUserInput(); }}
      onPointerUpCapture={() => movement.noteUserRelease()}
      onPointerCancelCapture={() => movement.noteUserRelease()}
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
      <MarkerLayer results={results} selectedId={selectedId} onSelect={onSelect} onClusterSelect={onClusterSelect} />
    </Map>
    </div>
  );
}
