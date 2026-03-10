'use client';

import { useEffect, useRef } from 'react';
import type { POI, POILite } from '@/lib/types';
import { POIDetails } from './poi-details';
import { useIsMobile } from '@/hooks/use-mobile';
import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

type POIAny = POILite | POI;

interface MobilePOIBottomSheetProps {
  poi: POIAny | null;
  onOpenChange: (open: boolean) => void;
  forceShow?: boolean;
}

export function MobilePOIBottomSheet({
  poi,
  onOpenChange,
  forceShow = false,
}: MobilePOIBottomSheetProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const isMobile = useIsMobile();
  
  // Le panneau s'affiche si on a un POI ET qu'on est sur mobile OU que la carte est en panne (forceShow)
  const isOpen = !!poi && (isMobile || forceShow);

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
      <div
        className="fixed inset-0 bg-black/20 z-[55] backdrop-blur-[2px]"
        onClick={() => onOpenChange(false)}
      />

      <div
        className={cn(
          "fixed bottom-6 left-1/2 -translate-x-1/2 z-[60]",
          "w-[90%] md:w-[60%] max-w-2xl",
          "bg-background/95 backdrop-blur-md",
          "rounded-[2.5rem] shadow-2xl border border-white/20",
          "flex flex-col overflow-hidden transition-all duration-300 animate-in slide-in-from-bottom-10"
        )}
        style={{
          maxHeight: '70vh',
        }}
      >
        <div className="relative flex items-center justify-center py-3 shrink-0">
          <div className="w-10 h-1 bg-muted rounded-full opacity-50" />

          <Button
            size="icon"
            variant="ghost"
            className="absolute right-4 rounded-full h-8 w-8 hover:bg-muted/50"
            onClick={() => onOpenChange(false)}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div ref={containerRef} className="overflow-y-auto flex-1 px-6 pb-8">
          <POIDetails poi={poi} />
        </div>
      </div>
    </>
  );
}
