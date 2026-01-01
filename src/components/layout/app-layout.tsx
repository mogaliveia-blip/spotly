'use client';

import { SidebarProvider, Sidebar, SidebarInset } from '@/components/ui/sidebar';
import { Header } from './header';
import { SidebarNav } from './sidebar-nav';
import { useAuth } from '@/hooks/use-auth-user';
import { useRouter, usePathname } from 'next/navigation';
import { useEffect } from 'react';

export function AppLayout({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (!loading && !user) {
      router.replace(`/login?redirect=${pathname}`);
    }
  }, [user, loading, router, pathname]);

  if (loading || !user) {
    return null; // Or a loading spinner, handled by AuthProvider already
  }

  return (
    <SidebarProvider>
      <Sidebar>
        <SidebarNav />
      </Sidebar>
      <SidebarInset>
        <div className="flex flex-col h-screen">
          <Header />
          <main className="flex-1 overflow-auto">
            <div className="h-full w-full p-4 sm:p-6 lg:p-8">
                {children}
            </div>
          </main>
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
