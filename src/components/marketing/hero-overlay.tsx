'use client';

import type { MarketingConfig } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import Image from 'next/image';
import { AuthDialog } from '@/components/auth/auth-dialog';
import { X } from 'lucide-react';

interface HeroOverlayProps {
  config: MarketingConfig;
  onClose?: () => void;
}

function CtaButton({
  config,
  onClose
}: {
  config: MarketingConfig;
  onClose?: () => void;
}) {
  if (config.heroCtaMode === 'none' || !config.heroCtaText) {
    return null;
  }

  if (config.heroCtaMode === 'auth') {
    return (
      <AuthDialog
        trigger={<Button className="mt-4 rounded-full px-8 h-12 font-bold shadow-lg text-base">{config.heroCtaText}</Button>}
      />
    );
  }

  if (config.heroCtaMode === 'external' && config.heroCtaLink) {
    return (
      <Button className="mt-4 rounded-full px-8 h-12 font-bold shadow-lg text-base" asChild>
        <a
          href={config.heroCtaLink}
          target="_blank"
          rel="noopener noreferrer"
        >
          {config.heroCtaText}
        </a>
      </Button>
    );
  }

  if (config.heroCtaMode === 'close') {
    return (
      <Button className="mt-4 rounded-full px-8 h-12 font-bold shadow-lg text-base" onClick={onClose}>
        {config.heroCtaText}
      </Button>
    );
  }

  return null;
}

export function HeroOverlay({ config, onClose }: HeroOverlayProps) {
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm animate-in fade-in duration-500">
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
            <h2 className="text-4xl md:text-6xl font-bold text-white tracking-tight">
              {config.heroTitle}
            </h2>
            <p className="text-lg md:text-xl text-white/90 max-w-2xl font-medium leading-relaxed">
              {config.heroSubtitle}
            </p>
            
            {/* CTA */}
            <div className="pt-4">
              <CtaButton config={config} onClose={onClose} />
            </div>
          </div>

        </Card>
      </div>
    </div>
  );
}
