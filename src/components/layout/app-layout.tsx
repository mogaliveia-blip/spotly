'use client';

import { SidebarProvider, Sidebar, SidebarInset } from '@/components/ui/sidebar';
import { Header } from './header';
import { SidebarNav } from './sidebar-nav';
import { useAuth } from '@/hooks/use-auth-user';

export function AppLayout({ children }: { children: React.ReactNode }) {
  const { loading } = useAuth();
  
  // We no longer redirect here. The layout now supports both authenticated and unauthenticated users.
  // The loading check can be useful to avoid flashing content.
  if (loading) {
    return null; // Or a global loading spinner
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
