'use client';

import { UserNav } from './user-nav';
import { Mountain, LayoutDashboard, MapPin, Users, Monitor } from 'lucide-react';
import { useAuth } from '@/hooks/use-auth-user';
import Link from 'next/navigation';
import { Button } from '@/components/ui/button';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { AuthDialog } from '../auth/auth-dialog';

export function Header() {
  const { user, role } = useAuth();
  const pathname = usePathname();

  const navItems = [
    { href: '/dashboard', icon: LayoutDashboard, label: 'Carte' },
    { href: '/pois', icon: MapPin, label: 'POIs', roles: ['editor', 'admin'] },
    { href: '/admin', icon: Users, label: 'Admin', roles: ['admin'] },
    { href: '/admin/monitor', icon: Monitor, label: 'Stats', roles: ['admin'] },
  ];

  const filteredNavItems = navItems.filter((item) => {
    if (!item.roles) return true;
    if (!user) return false;
    return role && item.roles.includes(role);
  });

  return (
    <header className="sticky top-0 z-50 flex h-16 items-center gap-4 border-b bg-background/95 backdrop-blur-sm px-4 md:px-6 shrink-0 shadow-sm">
      <div className="flex items-center gap-3">
        <a href="/" className="flex items-center gap-2 group">
          <div className="p-1.5 rounded-lg bg-primary/10 group-hover:bg-primary/20 transition-colors">
            <Mountain className="h-5 w-5 text-primary" />
          </div>
          <h1 className="text-lg font-bold tracking-tight hidden sm:block">Leu Tempo</h1>
        </a>
      </div>

      <nav className="flex items-center gap-1 md:gap-2 ml-4">
        {filteredNavItems.map((item) => {
          const Icon = item.icon;
          const isActive = pathname === item.href;
          return (
            <Button
              key={item.href}
              variant={isActive ? "secondary" : "ghost"}
              size="sm"
              asChild
              className={cn(
                "h-9 px-3 text-xs md:text-sm font-medium",
                isActive ? "text-primary" : "text-muted-foreground hover:text-foreground"
              )}
            >
              <a href={item.href}>
                <Icon className="h-4 w-4 md:mr-2" />
                <span className="hidden md:inline">{item.label}</span>
              </a>
            </Button>
          );
        })}
      </nav>

      <div className="ml-auto flex items-center gap-3">
        {!user ? (
          <AuthDialog
            trigger={
              <Button size="sm" className="font-semibold shadow-sm">
                Se connecter
              </Button>
            }
          />
        ) : (
          <UserNav />
        )}
      </div>
    </header>
  );
}
