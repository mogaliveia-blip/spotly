'use client';

import { SidebarProvider, Sidebar, SidebarInset } from '@/components/ui/sidebar';
import { Header } from './header';
import { SidebarNav } from './sidebar-nav';
import { useAuth } from '@/hooks/use-auth-user';

export function AppLayout({ children }: { children: React.ReactNode }) {
  const { loading } = useAuth();

  if (loading) {
    return null;
  }

  return (
    <SidebarProvider>
      <Sidebar>
        <SidebarNav />
      </Sidebar>

      <SidebarInset>
        {/* 🔥 min-h-screen pour stabilité mobile + h-full pour géométrie flex */}
        <div className="flex flex-col min-h-screen h-full">
          <Header />
          <main className="flex-1">
            {children}
          </main>
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
