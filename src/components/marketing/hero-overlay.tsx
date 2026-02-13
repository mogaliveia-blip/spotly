// src/components/marketing/hero-overlay.tsx
'use client';

import type { MarketingConfig } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import Image from 'next/image';
import { AuthDialog } from '@/components/auth/auth-dialog';

interface HeroOverlayProps {
  config: MarketingConfig;
}

function CtaButton({ config }: { config: MarketingConfig }) {
    if (config.heroCtaMode === 'none' || !config.heroCtaText) {
        return null;
    }

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

export function HeroOverlay({ config }: HeroOverlayProps) {
  return (
    <div className="absolute inset-0 z-20 flex items-center justify-center p-4 pointer-events-none">
      <div className="relative w-full h-full max-w-4xl max-h-[80vh] pointer-events-auto">
        <Card className="relative h-full w-full overflow-hidden flex flex-col justify-end">
          {config.heroImageUrl && (
            <Image
              src={config.heroImageUrl}
              alt={config.heroTitle}
              fill
              className="object-cover"
              sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
            />
          )}
           <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent" />
           <CardHeader className="relative z-10 text-primary-foreground p-6">
              <CardTitle className="text-3xl md:text-4xl font-bold drop-shadow-lg">
                {config.heroTitle}
              </CardTitle>
              <CardDescription className="text-primary-foreground/90 text-base drop-shadow-md">
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
