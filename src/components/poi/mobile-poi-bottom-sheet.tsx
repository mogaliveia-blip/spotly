'use client';

import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import type { POI } from '@/lib/types';
import { POIDetails } from './poi-details';

interface MobilePOIBottomSheetProps {
  poi: POI | null;
  onOpenChange: (open: boolean) => void;
}

export function MobilePOIBottomSheet({ poi, onOpenChange }: MobilePOIBottomSheetProps) {
  if (!poi) {
    return null;
  }
  
  return (
    <Sheet open={!!poi} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="h-[60dvh] flex flex-col p-0 sm:max-w-none">
        <SheetHeader className="p-4 border-b">
          <SheetTitle>{poi.title}</SheetTitle>
        </SheetHeader>
        <div className="flex-1 overflow-y-auto">
            <div className="p-4">
                <POIDetails poi={poi} />
            </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
