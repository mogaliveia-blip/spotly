'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DISCOVERY_RETURN_PARAM, DISCOVERY_RETURN_SESSION_KEY, hasDiscoveryReturnOrigin } from '@/lib/discovery-return';

export function DiscoveryReturnLink({ eventSlug }: { eventSlug: string }) {
  const token = useSearchParams().get(DISCOVERY_RETURN_PARAM);
  const [checked, setChecked] = useState<{ slug: string; token: string | null; valid: boolean } | null>(null);

  useEffect(() => {
    let raw: string | null = null;
    try { raw = window.sessionStorage.getItem(DISCOVERY_RETURN_SESSION_KEY); } catch { /* No contextual return without storage. */ }
    setChecked({ slug: eventSlug, token, valid: hasDiscoveryReturnOrigin(raw, eventSlug, token) });
  }, [eventSlug, token]);

  if (!checked?.valid || checked.slug !== eventSlug || checked.token !== token) return null;

  return (
    <nav aria-label="Navigation de retour" className="shrink-0 border-b bg-background px-3 py-1 sm:px-6">
      <Button asChild variant="ghost" size="sm" className="min-h-11">
        <Link href="/discovery" onClick={() => {
          try { window.sessionStorage.removeItem(DISCOVERY_RETURN_SESSION_KEY); } catch { /* The link remains usable. */ }
        }}>
          <ArrowLeft aria-hidden="true" className="h-4 w-4" /> Retour à la découverte
        </Link>
      </Button>
    </nav>
  );
}
