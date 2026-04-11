
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

    // Reset du scroll à l'ouverture ou au changement de POI
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
        className="fixed inset-0 bg-black/40 z-[55] backdrop-blur-[2px] animate-in fade-in duration-300"
        onClick={() => onOpenChange(false)}
      />

      <div
        className={cn(
          "fixed bottom-4 left-1/2 -translate-x-1/2 z-[60]",
          "w-[94%] md:w-[75%] lg:w-[60%] max-w-2xl",
          "bg-background/95 backdrop-blur-md",
          "rounded-[3rem] shadow-[0_20px_50px_rgba(0,0,0,0.3)] border border-white/10",
          "flex flex-col overflow-hidden transition-all duration-300 ease-out animate-in slide-in-from-bottom-10"
        )}
        style={{
          maxHeight: '85vh',
        }}
      >
        <div className="relative flex items-center justify-center py-4 shrink-0 cursor-grab active:cursor-grabbing">
          <div className="w-12 h-1.5 bg-muted rounded-full opacity-30" />

          <Button
            size="icon"
            variant="ghost"
            className="absolute right-6 rounded-full h-10 w-10 hover:bg-muted/50 bg-muted/20"
            onClick={() => onOpenChange(false)}
          >
            <X className="h-5 w-5" />
          </Button>
        </div>

        <div ref={containerRef} className="overflow-y-auto flex-1 px-6 sm:px-8 pb-12 scroll-smooth">
          <POIDetails poi={poi} />
        </div>
      </div>
    </>
  );
}
