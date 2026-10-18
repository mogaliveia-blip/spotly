'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
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
  const pointerStartedOnImage = useRef(false);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

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
    const dialog = dialogRef.current;
    if (!dialog) return;

    const previousFocus = document.activeElement;
    dialog.showModal();
    closeButtonRef.current?.focus();

    return () => {
      if (dialog.open) dialog.close();
      if (previousFocus instanceof HTMLElement && previousFocus.isConnected && previousFocus !== document.body) {
        previousFocus.focus({ preventScroll: true });
      }
    };
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
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
    pointerStartedOnImage.current = event.target instanceof HTMLImageElement;
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

  if (typeof document === 'undefined') return null;

  return createPortal(
    <dialog
      ref={dialogRef}
      className="fixed inset-0 m-0 h-screen h-[100dvh] w-screen max-h-none max-w-none overflow-hidden border-0 bg-[#f7f6fa] p-0 text-slate-900 backdrop:bg-transparent"
      aria-modal="true"
      aria-label="Aperçu image"
      onCancel={(event) => { event.preventDefault(); onClose(); }}
    >
      <div className="absolute left-1/2 z-10 flex -translate-x-1/2 items-center gap-1 rounded-full border border-slate-200 bg-white p-1 text-slate-900 shadow-md" style={{ top: 'calc(1rem + env(safe-area-inset-top, 0px))' }}>
        <Button type="button" variant="ghost" size="icon" className="h-9 w-9 rounded-full hover:bg-slate-100 hover:text-slate-900" onClick={(event) => { event.stopPropagation(); zoomBy(-ZOOM_STEP); }} disabled={scale <= MIN_SCALE} aria-label="Réduire le zoom">
          <Minus className="h-4 w-4" />
        </Button>
        <span className="min-w-12 text-center text-xs font-bold tabular-nums">{zoomLabel}</span>
        <Button type="button" variant="ghost" size="icon" className="h-9 w-9 rounded-full hover:bg-slate-100 hover:text-slate-900" onClick={(event) => { event.stopPropagation(); zoomBy(ZOOM_STEP); }} disabled={scale >= MAX_SCALE} aria-label="Augmenter le zoom">
          <Plus className="h-4 w-4" />
        </Button>
        <Button type="button" variant="ghost" size="icon" className="h-9 w-9 rounded-full hover:bg-slate-100 hover:text-slate-900" onClick={(event) => { event.stopPropagation(); resetView(); }} aria-label="Réinitialiser le zoom">
          <RotateCcw className="h-4 w-4" />
        </Button>
      </div>

      <button
        ref={closeButtonRef}
        type="button"
        className="absolute z-10 rounded-full border border-slate-200 bg-white p-3 text-slate-900 shadow-md hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2"
        onClick={(event) => { event.stopPropagation(); onClose(); }}
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
            type="button"
            className="absolute bottom-[calc(1rem+env(safe-area-inset-bottom,0px))] z-10 flex rounded-full border border-slate-200 bg-white p-3 text-primary shadow-md hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2 md:bottom-auto md:top-1/2 md:-translate-y-1/2 md:p-4"
            onClick={(event) => { event.stopPropagation(); goTo(selectedIndex - 1); }}
            aria-label="Image précédente"
            style={{ left: 'calc(1rem + env(safe-area-inset-left, 0px))' }}
          >
            <ChevronLeft className="h-6 w-6 md:h-8 md:w-8" />
          </button>
          <button
            type="button"
            className="absolute bottom-[calc(1rem+env(safe-area-inset-bottom,0px))] z-10 flex rounded-full border border-slate-200 bg-white p-3 text-primary shadow-md hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2 md:bottom-auto md:top-1/2 md:-translate-y-1/2 md:p-4"
            onClick={(event) => { event.stopPropagation(); goTo(selectedIndex + 1); }}
            aria-label="Image suivante"
            style={{ right: 'calc(1rem + env(safe-area-inset-right, 0px))' }}
          >
            <ChevronRight className="h-6 w-6 md:h-8 md:w-8" />
          </button>
        </>
      )}

      <div
        className="flex h-full w-full touch-none select-none items-center justify-center overflow-hidden px-3 md:px-14"
        style={{ paddingTop: 'calc(5rem + env(safe-area-inset-top, 0px))', paddingBottom: 'calc(5rem + env(safe-area-inset-bottom, 0px))' }}
        onClick={(event) => {
          event.stopPropagation();
          if (event.target === event.currentTarget && !pointerStartedOnImage.current) onClose();
          pointerStartedOnImage.current = false;
        }}
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
          className="max-h-full max-w-full rounded-2xl object-contain shadow-lg will-change-transform"
          draggable={false}
          style={{
            transform: `translate3d(${offset.x}px, ${offset.y}px, 0) scale(${scale})`,
            cursor: scale > 1 ? (isDragging ? 'grabbing' : 'grab') : 'zoom-in',
            transition: isDragging || pointers.current.size > 0 ? 'none' : 'transform 120ms ease-out'
          }}
        />
      </div>

      <div className="pointer-events-none absolute left-1/2 z-10 -translate-x-1/2 rounded-full border border-slate-200 bg-white px-4 py-1.5 text-sm font-medium text-slate-900 shadow-sm" style={{ bottom: 'calc(1rem + env(safe-area-inset-bottom, 0px))' }}>
        {selectedIndex + 1} / {images.length}
      </div>
    </dialog>,
    document.body
  );
}
