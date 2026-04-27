'use client';

import { UserNav } from './user-nav';
import { Mountain, LayoutDashboard, MapPin, Users, Monitor, CalendarDays } from 'lucide-react';
import { useAuth } from '@/hooks/use-auth-user';
import { Button } from '@/components/ui/button';
import { usePathname, useParams } from 'next/navigation';
import { cn } from '@/lib/utils';
import { AuthDialog } from '../auth/auth-dialog';
import { EventSwitcher } from './event-switcher';

export function Header() {
  const { user, role } = useAuth();
  const pathname = usePathname();
  const params = useParams();
  
  const eventSlug = params?.eventSlug as string;
  const prefix = eventSlug ? `/${eventSlug}` : '';

  const navItems = [
    { href: `${prefix}/dashboard`, icon: LayoutDashboard, label: 'Carte' },
    { href: `${prefix}/pois`, icon: MapPin, label: 'Gérer les POIs', roles: ['editor', 'admin'] },
    { href: `${prefix}/admin`, icon: Users, label: 'Admin', roles: ['admin'] },
    { href: `${prefix}/admin/monitor`, icon: Monitor, label: 'Supervision', roles: ['admin'] },
  ];
  
  // On ajoute "Mes Événements" si l'utilisateur est connecté
  if (user) {
     navItems.unshift({ href: '/admin/events', icon: CalendarDays, label: 'Mes Événements' });
  }

  const filteredNavItems = navItems.filter((item) => {
    if (!item.roles) return true;
    if (!user) return false;
    return role && item.roles.includes(role);
  });

  return (
    <header className="sticky top-0 z-50 flex h-16 items-center gap-4 border-b bg-background/95 backdrop-blur-sm px-4 md:px-6 shrink-0 shadow-sm">
      <div className="flex items-center gap-3">
        <a href="/" className="flex items-center gap-2 group">
          <div className="p-1.5 rounded-xl bg-primary/10 group-hover:bg-primary/20 transition-colors">
            <Mountain className="h-5 w-5 text-primary" />
          </div>
          <h1 className="text-lg font-bold tracking-tight hidden sm:block text-primary">Spotly</h1>
        </a>
      </div>

      <nav className="flex items-center gap-1 md:gap-2 ml-4">
        {filteredNavItems.map((item) => {
          const Icon = item.icon;
          const isActive = pathname === item.href || (item.href !== '/' && pathname.startsWith(item.href));
          return (
            <Button
              key={item.href}
              variant={isActive ? "secondary" : "ghost"}
              size="sm"
              asChild
              className={cn(
                "h-9 px-3 text-xs md:text-sm font-bold rounded-2xl transition-all",
                isActive ? "text-primary bg-primary/10" : "text-muted-foreground hover:text-foreground"
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
        {user && <EventSwitcher />}
        {!user ? (
          <AuthDialog
            trigger={
              <Button size="sm" className="font-bold shadow-sm rounded-2xl px-5">
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
