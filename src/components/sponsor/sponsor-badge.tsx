// src/components/sponsor/sponsor-badge.tsx
import { Badge } from '@/components/ui/badge';
import { getSponsorLabel, getSponsorVariant } from '@/lib/sponsor-utils';
import type { POISponsor } from '@/lib/types';
import { cn } from '@/lib/utils';

interface SponsorBadgeProps {
  sponsor?: POISponsor;
  className?: string;
}

export function SponsorBadge({ sponsor, className }: SponsorBadgeProps) {
  // isSponsorActive logic is checked by the parent component
  // This component is purely for display if it receives a valid sponsor object
  if (!sponsor || !sponsor.enabled) {
    return null;
  }

  const label = getSponsorLabel(sponsor.level);
  const variant = getSponsorVariant(sponsor.level);

  return (
    <Badge variant={variant} className={cn('text-xs px-2 py-0.5', className)}>
      {label}
    </Badge>
  );
}
