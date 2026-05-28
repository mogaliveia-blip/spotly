'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { ChevronLeft, ChevronRight, Minus, Plus, RotateCcw, X } from 'lucide-react';

interface ImageViewerProps {
  images: string[];
  selectedIndex: number;
  onSelect: (index: number) => void;
  onClose: () => void;
}

const MIN_SCALE = 1;
const MAX_SCALE = 6;
const ZOOM_STEP = 0.5;

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function getDistance(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export function ImageViewer({ images, selectedIndex, onSelect, onClose }: ImageViewerProps) {
  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const lastPanPoint = useRef<{ x: number; y: number } | null>(null);
  const pinchStart = useRef<{ distance: number; scale: number } | null>(null);

  const canNavigate = images.length > 1;
  const imageSrc = images[selectedIndex];

  const zoomLabel = useMemo(() => `${Math.round(scale * 100)}%`, [scale]);

  const resetView = () => {
    setScale(1);
    setOffset({ x: 0, y: 0 });
    setIsDragging(false);
    pointers.current.clear();
    lastPanPoint.current = null;
    pinchStart.current = null;
  };

  const zoomBy = (delta: number) => {
    setScale((current) => {
      const next = clamp(current + delta, MIN_SCALE, MAX_SCALE);
      if (next === MIN_SCALE) setOffset({ x: 0, y: 0 });
      return next;
    });
  };

  const goTo = (index: number) => {
    resetView();
    onSelect((index + images.length) % images.length);
  };

  useEffect(() => {
    resetView();
  }, [selectedIndex]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
      if (event.key === 'ArrowLeft' && canNavigate) goTo(selectedIndex - 1);
      if (event.key === 'ArrowRight' && canNavigate) goTo(selectedIndex + 1);
      if ((event.key === '+' || event.key === '=') && !event.metaKey && !event.ctrlKey) zoomBy(ZOOM_STEP);
      if (event.key === '-' && !event.metaKey && !event.ctrlKey) zoomBy(-ZOOM_STEP);
      if (event.key === '0') resetView();
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [canNavigate, selectedIndex, images.length]);

  const handleWheel = (event: React.WheelEvent) => {
    event.preventDefault();
    zoomBy(event.deltaY > 0 ? -0.25 : 0.25);
  };

  const handleDoubleClick = (event: React.MouseEvent) => {
    event.stopPropagation();
    if (scale > 1) {
      resetView();
    } else {
      setScale(2.5);
    }
  };

  const handlePointerDown = (event: React.PointerEvent) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });

    if (pointers.current.size === 1) {
      lastPanPoint.current = { x: event.clientX, y: event.clientY };
      setIsDragging(scale > 1);
    }

    if (pointers.current.size === 2) {
      const [first, second] = Array.from(pointers.current.values());
      pinchStart.current = { distance: getDistance(first, second), scale };
      lastPanPoint.current = null;
      setIsDragging(false);
    }
  };

  const handlePointerMove = (event: React.PointerEvent) => {
    if (!pointers.current.has(event.pointerId)) return;
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });

    if (pointers.current.size === 2 && pinchStart.current) {
      const [first, second] = Array.from(pointers.current.values());
      const nextDistance = getDistance(first, second);
      const nextScale = clamp((nextDistance / pinchStart.current.distance) * pinchStart.current.scale, MIN_SCALE, MAX_SCALE);
      setScale(nextScale);
      if (nextScale === MIN_SCALE) setOffset({ x: 0, y: 0 });
      return;
    }

    if (scale <= 1 || !lastPanPoint.current) return;

    const dx = event.clientX - lastPanPoint.current.x;
    const dy = event.clientY - lastPanPoint.current.y;
    lastPanPoint.current = { x: event.clientX, y: event.clientY };
    setOffset((current) => ({ x: current.x + dx, y: current.y + dy }));
  };

  const handlePointerUp = (event: React.PointerEvent) => {
    pointers.current.delete(event.pointerId);
    pinchStart.current = null;
    setIsDragging(false);

    if (pointers.current.size === 1) {
      const [remaining] = Array.from(pointers.current.values());
      lastPanPoint.current = remaining;
    } else {
      lastPanPoint.current = null;
    }
  };

  return (
    <div
      className="fixed inset-0 z-[999] bg-black/95 backdrop-blur-md animate-in fade-in duration-300"
      role="dialog"
      aria-modal="true"
      aria-label="Aperçu image"
      onClick={onClose}
    >
      <div className="absolute left-1/2 top-4 z-[1002] flex -translate-x-1/2 items-center gap-2 rounded-full border border-white/15 bg-black/60 p-1 text-white shadow-2xl backdrop-blur-sm">
        <Button type="button" variant="ghost" size="icon" className="h-9 w-9 rounded-full text-white hover:bg-white/10 hover:text-white" onClick={(event) => { event.stopPropagation(); zoomBy(-ZOOM_STEP); }} disabled={scale <= MIN_SCALE} aria-label="Réduire le zoom">
          <Minus className="h-4 w-4" />
        </Button>
        <span className="min-w-14 text-center text-xs font-bold tabular-nums">{zoomLabel}</span>
        <Button type="button" variant="ghost" size="icon" className="h-9 w-9 rounded-full text-white hover:bg-white/10 hover:text-white" onClick={(event) => { event.stopPropagation(); zoomBy(ZOOM_STEP); }} disabled={scale >= MAX_SCALE} aria-label="Augmenter le zoom">
          <Plus className="h-4 w-4" />
        </Button>
        <Button type="button" variant="ghost" size="icon" className="h-9 w-9 rounded-full text-white hover:bg-white/10 hover:text-white" onClick={(event) => { event.stopPropagation(); resetView(); }} aria-label="Réinitialiser le zoom">
          <RotateCcw className="h-4 w-4" />
        </Button>
      </div>

      <button
        className="absolute z-[1002] rounded-full border border-white/20 bg-black/60 p-3 text-white shadow-2xl backdrop-blur-sm transition-all hover:bg-black/80 active:scale-95"
        onClick={onClose}
        aria-label="Fermer l'aperçu"
        style={{
          top: 'calc(1rem + env(safe-area-inset-top, 0px))',
          right: 'calc(1rem + env(safe-area-inset-right, 0px))'
        }}
      >
        <X className="h-6 w-6" />
      </button>

      {canNavigate && scale === 1 && (
        <>
          <button
            className="absolute top-1/2 z-[1001] flex -translate-y-1/2 rounded-full border border-white/10 bg-black/50 p-3 text-white shadow-2xl backdrop-blur-sm transition-all hover:bg-black/70 active:scale-90 md:p-4"
            onClick={(event) => { event.stopPropagation(); goTo(selectedIndex - 1); }}
            aria-label="Image précédente"
            style={{ left: 'calc(1rem + env(safe-area-inset-left, 0px))' }}
          >
            <ChevronLeft className="h-6 w-6 md:h-8 md:w-8" />
          </button>
          <button
            className="absolute top-1/2 z-[1001] flex -translate-y-1/2 rounded-full border border-white/10 bg-black/50 p-3 text-white shadow-2xl backdrop-blur-sm transition-all hover:bg-black/70 active:scale-90 md:p-4"
            onClick={(event) => { event.stopPropagation(); goTo(selectedIndex + 1); }}
            aria-label="Image suivante"
            style={{ right: 'calc(1rem + env(safe-area-inset-right, 0px))' }}
          >
            <ChevronRight className="h-6 w-6 md:h-8 md:w-8" />
          </button>
        </>
      )}

      <div
        className="flex h-full w-full touch-none select-none items-center justify-center overflow-hidden px-3 py-20 md:px-14"
        onClick={(event) => event.stopPropagation()}
        onWheel={handleWheel}
        onDoubleClick={handleDoubleClick}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
      >
        <img
          src={imageSrc}
          alt={`Aperçu ${selectedIndex + 1}`}
          className="max-h-[calc(100vh-10rem)] max-w-full rounded-2xl object-contain shadow-2xl will-change-transform"
          draggable={false}
          style={{
            transform: `translate3d(${offset.x}px, ${offset.y}px, 0) scale(${scale})`,
            cursor: scale > 1 ? (isDragging ? 'grabbing' : 'grab') : 'zoom-in',
            transition: isDragging || pointers.current.size > 0 ? 'none' : 'transform 120ms ease-out'
          }}
        />
      </div>

      <div className="pointer-events-none absolute bottom-8 left-1/2 z-[1002] -translate-x-1/2 rounded-full bg-black/50 px-4 py-1.5 text-sm font-medium text-white backdrop-blur-sm">
        {selectedIndex + 1} / {images.length}
      </div>
    </div>
  );
}
