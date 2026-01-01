'use client';

import { SidebarProvider, Sidebar, SidebarInset } from '@/components/ui/sidebar';
import { Header } from './header';
import { SidebarNav } from './sidebar-nav';
import { useAuth } from '@/hooks/use-auth-user';
import { useRouter, usePathname } from 'next/navigation';
import { useEffect } from 'react';
import { cn } from '@/lib/utils';

export function AppLayout({ children, variant }: { children: React.ReactNode, variant?: 'default' | 'dashboard' }) {
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
  
  const isDashboard = variant === 'dashboard';

  return (
    <SidebarProvider>
      <Sidebar>
        <SidebarNav />
      </Sidebar>
      <SidebarInset>
        <div className="flex flex-col h-screen">
          <Header />
          <main className={cn(
            "flex-1",
            isDashboard ? "overflow-hidden" : "p-4 sm:p-6 lg:p-8"
          )}>
            {children}
          </main>
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
