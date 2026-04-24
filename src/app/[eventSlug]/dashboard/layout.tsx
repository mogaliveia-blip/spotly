'use client';

import { AppLayout } from "@/components/layout/app-layout";
import { useAuth } from '@/hooks/use-auth-user';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { fetchAppConfig } from '@/lib/data';
import type { AppConfig } from '@/lib/types';
import { Mountain, Loader2 } from 'lucide-react';
import { VerifyEmailPage } from '@/components/auth/verify-email-page';
import { useEvent } from '@/providers/event-provider';

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { role, user, loading: authLoading, isApproved } = useAuth();
  const { eventId, loading: eventLoading } = useEvent();
  const router = useRouter();
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [configLoading, setConfigLoading] = useState(true);

  useEffect(() => {
    if (eventLoading) return;

    fetchAppConfig(eventId).then(appConfig => {
      setConfig(appConfig);
      setConfigLoading(false);
    }).catch(() => {
      setConfig({ isLandingPageActive: false });
      setConfigLoading(false);
    });
  }, [eventId, eventLoading]);
  
  const isLoading = authLoading || configLoading || eventLoading;

  useEffect(() => {
    if (isLoading) return;

    // ✅ Blocage si non approuvé
    if (user && !isApproved) {
        router.replace('/access-pending');
        return;
    }

    if (role === 'user' && config?.isLandingPageActive) {
        router.replace('/');
    }

  }, [role, config, isLoading, router, user, isApproved]);


  if (isLoading) {
    return (
       <div className="flex h-screen w-full items-center justify-center bg-background">
        <Mountain className="h-12 w-12 animate-pulse text-primary" />
      </div>
    );
  }

  // ✅ Redirection si non approuvé (double sécurité)
  if (user && !isApproved) {
     return null; 
  }

  if (user && !user.emailVerified) {
    return <VerifyEmailPage />;
  }

  const isBlocked = role === 'user' && config?.isLandingPageActive;

  if (isBlocked) {
    return (
       <div className="flex h-screen w-full items-center justify-center bg-background">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
      </div>
    );
  }

  return <AppLayout>{children}</AppLayout>;
}
