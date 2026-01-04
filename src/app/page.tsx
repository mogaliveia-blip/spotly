'use client';

import { useAuth } from '@/hooks/use-auth-user';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

// This page now simply redirects everyone to the dashboard.
// The dashboard and its layout will handle logic for authenticated vs. unauthenticated users.
export default function Home() {
  const router = useRouter();

  useEffect(() => {
    router.replace('/dashboard');
  }, [router]);

  // Render nothing as the redirect happens immediately.
  return null;
}
