'use client';

import type { MarketingConfig } from '@/lib/types';
import { Card } from '@/components/ui/card';
import Image from 'next/image';
import { X } from 'lucide-react';
import { useEffect, useRef } from 'react';

interface HeroOverlayProps {
  config: MarketingConfig;
  onClose?: () => void;
}

export function HeroOverlay({ config, onClose }: HeroOverlayProps) {
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    dialogRef.current?.focus();
  }, []);

  return (
    <div
      ref={dialogRef}
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm animate-in fade-in duration-500"
      role="dialog"
      aria-modal="true"
      aria-labelledby="hero-overlay-title"
      tabIndex={-1}
      onKeyDown={(event) => {
        if (event.key === 'Escape') onClose?.();
      }}
    >
      <div className="relative w-full h-full max-w-4xl max-h-[80vh] animate-in zoom-in-95 duration-500">
        <Card className="relative h-full w-full overflow-hidden flex flex-col justify-end shadow-2xl rounded-[3rem] border-none">

          {/* Bouton croix */}
          {onClose && (
            <button
              onClick={onClose}
              className="absolute top-6 right-6 z-30 bg-black/50 hover:bg-black/70 text-white rounded-full p-2 transition-all active:scale-95 shadow-lg"
              aria-label="Fermer"
            >
              <X size={24} />
            </button>
          )}

          {/* Image de fond */}
          {config.heroImageUrl && (
            <Image
              src={config.heroImageUrl}
              alt={config.heroTitle}
              fill
              className="object-cover"
              priority
            />
          )}

          {/* Dégradé sombre */}
          <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/40 to-transparent" />

          {/* Contenu texte */}
          <div className="relative z-10 p-8 md:p-16 space-y-4">
            <h2 id="hero-overlay-title" className="text-4xl md:text-6xl font-bold text-white tracking-tight">
              {config.heroTitle}
            </h2>
            <p className="text-lg md:text-xl text-white/90 max-w-2xl font-medium leading-relaxed">
              {config.heroSubtitle}
            </p>
          </div>

        </Card>
      </div>
    </div>
  );
}
