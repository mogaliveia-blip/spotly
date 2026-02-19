'use client';

import { SidebarTrigger } from '@/components/ui/sidebar';
import { UserNav } from './user-nav';
import { Mountain } from 'lucide-react';
import { useAuth } from '@/hooks/use-auth-user';
import { Button } from '../ui/button';
import { AuthDialog } from '../auth/auth-dialog';
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
          <Mountain className="h-6 w-6 text-primary" />
          <h1 className="text-lg font-semibold tracking-tight">Leu Tempo</h1>
        </Link>
      </div>

      <div className="ml-auto flex items-center gap-4">
        {user ? (
          <UserNav />
        ) : (
          <AuthDialog trigger={<Button>Se connecter</Button>} />
        )}
      </div>

    </header>
  );
}
