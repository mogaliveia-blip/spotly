'use client';

import { SidebarTrigger } from '@/components/ui/sidebar';
import { UserNav } from './user-nav';
import { Mountain } from 'lucide-react';
import { useAuth } from '@/hooks/use-auth-user';
import Link from 'next/link';

export function Header() {
  const { user } = useAuth();

  return (
    <header className="sticky top-0 z-10 flex h-16 items-center gap-4 border-b bg-background px-4 md:px-6">
      
      <div className="flex items-center gap-3">
        
        {/* Mobile uniquement */}
        <div className="flex items-center gap-2 md:hidden">
          <SidebarTrigger className="h-9 w-9" />
          <span className="text-sm font-medium">Événements</span>
        </div>

        <Link href="/" className="flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-primary/10">
            <Mountain className="h-5 w-5 text-primary" />
          </div>
          <h1 className="text-lg font-semibold tracking-tight">Leu Tempo</h1>
        </Link>
      </div>

      <div className="ml-auto flex items-center gap-4">
        {user && <UserNav />}
      </div>

    </header>
  );
}
