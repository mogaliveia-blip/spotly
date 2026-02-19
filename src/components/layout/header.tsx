'use client';

import { useSidebar } from '@/components/ui/sidebar';
import { UserNav } from './user-nav';
import { Mountain, PanelLeft } from 'lucide-react';
import { useAuth } from '@/hooks/use-auth-user';
import Link from 'next/link';
import { Button } from '@/components/ui/button';

export function Header() {
  const { user } = useAuth();
  const { toggleSidebar } = useSidebar();

  return (
    <header className="sticky top-0 z-10 flex h-16 items-center gap-4 border-b bg-background px-4 md:px-6">
      
      <div className="flex items-center gap-3">
        
        {/* Mobile uniquement : Bouton avec zone de clic étendue et design dynamique */}
        <Button 
          variant="outline" 
          size="sm" 
          onClick={toggleSidebar}
          className="flex md:hidden items-center gap-2 h-9 px-3 rounded-full border-primary/20 bg-background hover:bg-primary/5 active:scale-95 transition-all shadow-sm"
        >
          <PanelLeft className="h-4 w-4 text-primary" />
          <span className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Événements</span>
        </Button>

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
