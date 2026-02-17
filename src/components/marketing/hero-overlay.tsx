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

function CtaButton({ config }: { config: MarketingConfig }) {
  if (config.heroCtaMode === 'none' || !config.heroCtaText) return null;

  if (config.heroCtaMode === 'auth') {
    return (
      <AuthDialog trigger={<Button className="mt-4">{config.heroCtaText}</Button>} />
    );
  }

  if (config.heroCtaMode === 'external' && config.heroCtaLink) {
    return (
      <Button className="mt-4" asChild>
        <a href={config.heroCtaLink} target="_blank" rel="noopener noreferrer">
          {config.heroCtaText}
        </a>
      </Button>
    );
  }

  return null;
}

export function HeroOverlay({ config, onClose }: HeroOverlayProps) {
  return (
    <div className="absolute inset-0 z-20 flex items-center justify-center p-4">
      <div className="relative w-full h-full max-w-4xl max-h-[80vh]">
        <Card className="relative h-full w-full overflow-hidden flex flex-col justify-end">
          {onClose && (
            <button
              onClick={onClose}
              className="absolute top-4 right-4 z-30 bg-black/50 hover:bg-black/70 text-white rounded-full p-2"
            >
              <X size={18} />
            </button>
          )}

          {config.heroImageUrl && (
            <Image
              src={config.heroImageUrl}
              alt={config.heroTitle}
              fill
              className="object-cover"
            />
          )}

          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent" />

          <CardHeader className="relative z-10 text-primary-foreground p-6">
            <CardTitle className="text-3xl md:text-4xl font-bold">
              {config.heroTitle}
            </CardTitle>
            <CardDescription className="text-primary-foreground/90 text-base">
              {config.heroSubtitle}
            </CardDescription>
          </CardHeader>

          <CardContent className="relative z-10 p-6 pt-0">
            <CtaButton config={config} />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
