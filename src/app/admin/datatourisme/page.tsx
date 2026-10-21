'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { DatatourismeAdminPreview } from '@/components/admin/datatourisme-admin-preview';
import { AppLayout } from '@/components/layout/app-layout';
import { useAuth } from '@/hooks/use-auth-user';
import { canAccessPlatformAdmin } from '@/lib/access-control';

export default function DatatourismeAdminPage() {
  const { firebaseUser, role, loading, profileLoading } = useAuth();
  const router = useRouter();
  const authOrProfileLoading = loading || (!!firebaseUser && profileLoading);
  const canAccess = canAccessPlatformAdmin(role);

  useEffect(() => {
    if (!authOrProfileLoading && !canAccess) router.replace('/dashboard');
  }, [authOrProfileLoading, canAccess, router]);

  if (authOrProfileLoading) return <div className="p-12 text-center text-muted-foreground animate-pulse">Chargement de l’administration…</div>;
  if (!canAccess) return null;

  return <AppLayout><DatatourismeAdminPreview /></AppLayout>;
}
