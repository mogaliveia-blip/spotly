'use client';

import { UserNav } from './user-nav';
import { Mountain, LayoutDashboard, MapPin, Users, Monitor, CalendarDays, UsersRound, Menu, LogOut } from 'lucide-react';
import { useAuth } from '@/hooks/use-auth-user';
import { Button } from '@/components/ui/button';
import { usePathname, useParams, useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';
import { AuthDialog } from '../auth/auth-dialog';
import { EventSwitcher } from './event-switcher';
import { useEvent } from '@/providers/event-provider';
import { canAccessMyEvents, canAccessPlatformAdmin, canManageEvent } from '@/lib/access-control';
import { fetchUserEvents } from '@/lib/data';
import { Sheet, SheetClose, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import Link from 'next/link';
import { signOut } from 'firebase/auth';
import { auth } from '@/lib/firebase';
import { useEffect, useState } from 'react';

export function Header() {
  const { user, role: globalRole, isApproved } = useAuth();
  const { userRole } = useEvent();
  const pathname = usePathname();
  const params = useParams();
  const router = useRouter();
  const [hasEventMembership, setHasEventMembership] = useState(false);
  
  const eventSlug = params?.eventSlug as string;
  const prefix = eventSlug ? `/${eventSlug}` : '';

  useEffect(() => {
    let isMounted = true;

    if (!user || canAccessPlatformAdmin(globalRole) || isApproved) {
      setHasEventMembership(false);
      return;
    }

    fetchUserEvents(user.uid)
      .then((events) => {
        if (isMounted) setHasEventMembership(events.length > 0);
      })
      .catch(() => {
        if (isMounted) setHasEventMembership(false);
      });

    return () => {
      isMounted = false;
    };
  }, [user, globalRole, isApproved]);

  const canManageCurrentEvent = canManageEvent(globalRole, userRole);
  const showMyEvents = !!user && canAccessMyEvents({
    globalRole,
    isApproved,
    eventRole: userRole,
    hasEventMembership,
  });
  const showPlatformAdmin = canAccessPlatformAdmin(globalRole);

  const navItems = [
    { href: `${prefix}/dashboard`, icon: LayoutDashboard, label: 'Carte' },
    ...(eventSlug && canManageCurrentEvent ? [
        { href: `${prefix}/pois`, icon: MapPin, label: 'Lieux' },
        { href: `${prefix}/admin/members`, icon: UsersRound, label: 'Équipe' },
        { href: `${prefix}/admin`, icon: Users, label: 'Réglages' },
        { href: `${prefix}/admin/monitor`, icon: Monitor, label: 'Supervision' },
    ] : []),
    ...(showPlatformAdmin ? [
        { href: `/admin`, icon: Users, label: 'Administration Plateforme' }
    ] : [])
  ];
  
  if (showMyEvents) {
     navItems.unshift({ href: '/admin/events', icon: CalendarDays, label: 'Mes Événements' });
  }

  // Filtrage intelligent de la navigation
  const filteredNavItems = navItems.filter((item) => {
    if (!item.href.includes(prefix) && prefix !== '') {
       return item.href === '/admin/events' || (item.href === '/admin' && globalRole === 'owner');
    }
    return true;
  });

  const handleSignOut = async () => {
    await signOut(auth);
    router.push('/dashboard');
    router.refresh();
  };

  return (
    <header className="sticky top-0 z-50 flex h-16 items-center gap-3 border-b bg-background/95 backdrop-blur-sm px-3 md:px-6 shrink-0 shadow-sm">
      <div className="flex items-center gap-3">
        <Link href="/" className="flex items-center gap-2 group">
          <div className="p-1.5 rounded-xl bg-primary/10 group-hover:bg-primary/20 transition-colors">
            <Mountain className="h-5 w-5 text-primary" />
          </div>
          <h1 className="text-lg font-bold tracking-tight hidden sm:block text-primary">Spotly</h1>
        </Link>
      </div>

      <nav className="hidden md:flex items-center gap-1 md:gap-2 ml-4">
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
              <Link href={item.href}>
                <Icon className="h-4 w-4 md:mr-2" />
                <span className="hidden md:inline">{item.label}</span>
              </Link>
            </Button>
          );
        })}
      </nav>

      <div className="ml-auto flex items-center gap-2 md:gap-3">
        {user && <div className="hidden sm:block"><EventSwitcher /></div>}
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
        {(user || filteredNavItems.length > 0) && (
          <Sheet>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="md:hidden h-11 w-11 rounded-xl" aria-label="Ouvrir le menu">
                <Menu className="h-5 w-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="right" className="w-[min(88vw,360px)] p-0">
              <SheetHeader className="px-5 pb-3 pt-[calc(env(safe-area-inset-top)+1.25rem)] text-left border-b">
                <SheetTitle className="flex items-center gap-2 text-base">
                  <Mountain className="h-5 w-5 text-primary" />
                  Spotly
                </SheetTitle>
              </SheetHeader>

              <div className="flex h-full flex-col px-3 pb-[calc(env(safe-area-inset-bottom)+1rem)] pt-4">
                {user && (
                  <div className="sm:hidden mb-3">
                    <EventSwitcher />
                  </div>
                )}

                <nav className="flex flex-col gap-1">
                  {filteredNavItems.map((item) => {
                    const Icon = item.icon;
                    const isActive = pathname === item.href || (item.href !== '/' && pathname.startsWith(item.href));
                    return (
                      <SheetClose asChild key={item.href}>
                        <Link
                          href={item.href}
                          className={cn(
                            'flex min-h-11 items-center gap-3 rounded-xl px-3 text-sm font-bold transition-colors',
                            isActive ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                          )}
                        >
                          <Icon className="h-4 w-4 shrink-0" />
                          <span>{item.label}</span>
                        </Link>
                      </SheetClose>
                    );
                  })}
                </nav>

                {user && (
                  <div className="mt-auto border-t pt-3">
                    <SheetClose asChild>
                      <button
                        type="button"
                        onClick={handleSignOut}
                        className="flex min-h-11 w-full items-center gap-3 rounded-xl px-3 text-left text-sm font-bold text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                      >
                        <LogOut className="h-4 w-4 shrink-0" />
                        <span>Déconnexion</span>
                      </button>
                    </SheetClose>
                  </div>
                )}
              </div>
            </SheetContent>
          </Sheet>
        )}
      </div>
    </header>
  );
}
