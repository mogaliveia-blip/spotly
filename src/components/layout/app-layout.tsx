'use client';

import { Header } from './header';
import { useAuth } from '@/hooks/use-auth-user';
import { usePathname } from 'next/navigation';

export function AppLayout({ children }: { children: React.ReactNode }) {
  const { loading } = useAuth();
  const pathname = usePathname();
  const isPublicEventDashboard = /^\/[^/]+\/dashboard(?:\/)?$/.test(pathname || '');

  if (loading && !isPublicEventDashboard) {
    return null;
  }

  return (
    <div className="flex flex-col min-h-screen h-full bg-background overflow-hidden">
      <Header />
      <main className="flex-1 relative overflow-hidden">
        {children}
      </main>
    </div>
  );
}
