'use client';

import { AppLayout } from "@/components/layout/app-layout";
import { useAuth } from '@/hooks/use-auth-user';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { fetchAppConfig } from '@/lib/data';
import type { AppConfig } from '@/lib/types';
import { Mountain } from 'lucide-react';
import { VerifyEmailPage } from '@/components/auth/verify-email-page';

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { role, user, loading: authLoading } = useAuth();
  const router = useRouter();
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchAppConfig().then(appConfig => {
      setConfig(appConfig);
      setLoading(false);
    }).catch(() => {
      // In case of error, assume landing page is off to not block access
      setConfig({ isLandingPageActive: false });
      setLoading(false);
    });
  }, []);
  
  useEffect(() => {
    if (!authLoading && !loading) {
      // If landing page is active, only admin/editor can access the dashboard.
      // Standard users and guests are redirected.
      if (config?.isLandingPageActive && (role !== 'admin' && role !== 'editor')) {
        router.replace('/');
      }
      // If landing page is OFF, but user is not logged in, redirect to landing
      // The login button will be there.
      if (!config?.isLandingPageActive && !user) {
        router.replace('/');
      }
    }
  }, [role, user, authLoading, config, loading, router]);

  const isLoading = authLoading || loading;

  if (isLoading) {
    return (
       <div className="flex h-screen w-full items-center justify-center bg-background">
        <Mountain className="h-12 w-12 animate-pulse text-primary" />
      </div>
    );
  }

  // --- NEW VERIFICATION GATE ---
  // This must come AFTER isLoading, but BEFORE any other logic.
  if (user && !user.emailVerified) {
    return <VerifyEmailPage />;
  }

  const isBlocked = config?.isLandingPageActive && (role !== 'admin' && role !== 'editor');

  if (isLoading || isBlocked) {
    return (
       <div className="flex h-screen w-full items-center justify-center bg-background">
        <Mountain className="h-12 w-12 animate-pulse text-primary" />
      </div>
    );
  }

  return <AppLayout>{children}</AppLayout>;
}
