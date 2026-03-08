'use client';

import { useEffect, useRef } from 'react';
import type { POI, POILite } from '@/lib/types';
import { POIDetails } from './poi-details';
import { useIsMobile } from '@/hooks/use-mobile';
import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';

type POIAny = POILite | POI;

interface MobilePOIBottomSheetProps {
  poi: POIAny | null;
  onOpenChange: (open: boolean) => void;
}

export function MobilePOIBottomSheet({
  poi,
  onOpenChange,
}: MobilePOIBottomSheetProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const isMobile = useIsMobile();
  const isOpen = !!poi && isMobile;

  useEffect(() => {
    if (!isOpen) return;

    const timeout = setTimeout(() => {
      if (containerRef.current) {
        containerRef.current.scrollTo({
          top: 0,
          behavior: 'auto',
        });
      }
    }, 50);

    return () => clearTimeout(timeout);
  }, [isOpen, poi]);

  if (!isOpen || !poi) return null;

  return (
    <>
      {/* Overlay sombre - Z-55 pour être juste en dessous du contenu mais au-dessus du reste */}
      <div
        className="fixed inset-0 bg-black/40 z-[55] backdrop-blur-sm"
        onClick={() => onOpenChange(false)}
      />

      {/* Bottom Sheet - Z-60 pour être au sommet absolu de la pile */}
      <div
        className="
          fixed inset-x-0 bottom-0 z-[60]
          bg-background
          rounded-t-3xl shadow-[0_-10px_40px_rgba(0,0,0,0.2)]
          flex flex-col
        "
        style={{
          height: '70%',
          maxHeight: '70%',
        }}
      >
        {/* Header avec poignée + bouton fermeture */}
        <div className="relative flex items-center justify-center py-4 border-b">
          <div className="w-12 h-1.5 bg-muted rounded-full" />

          <Button
            size="icon"
            variant="ghost"
            className="absolute right-4 rounded-full"
            onClick={() => onOpenChange(false)}
          >
            <X className="h-5 w-5" />
          </Button>
        </div>

        {/* Contenu scrollable */}
        <div ref={containerRef} className="overflow-y-auto flex-1 p-5 pb-10">
          <POIDetails poi={poi} />
        </div>
      </div>
    </>
  );
}