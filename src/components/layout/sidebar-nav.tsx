'use client';

import {
  SidebarHeader,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarContent,
  SidebarFooter,
  SidebarSeparator,
} from '@/components/ui/sidebar';
import { useAuth } from '@/hooks/use-auth-user';
import {
  LayoutDashboard,
  MapPin,
  Users,
  Mountain,
  PlusCircle,
  Navigation,
  Unlock,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Button } from '../ui/button';
import { useEffect, useState, useMemo } from 'react';
import type { POI, MainCategory } from '@/lib/types';
import { categoriesMap } from '@/lib/types';
import { fetchPois } from '@/lib/data';
import { useGeolocation } from '@/providers/geolocation-provider';
import { getDistance } from '@/lib/utils';
import { Skeleton } from '../ui/skeleton';
import { cn } from '@/lib/utils';
import { ScrollArea } from '../ui/scroll-area';
import { Card, CardDescription } from '../ui/card';
import { AuthDialog } from '../auth/auth-dialog';

function POISidebarList() {
    const [pois, setPois] = useState<POI[]>([]);
    const [loading, setLoading] = useState(true);
    const { userLocation, loading: geoLoading } = useGeolocation();
    const router = useRouter();
    const pathname = usePathname();
    const searchParams = useSearchParams();
    const selectedPoiId = searchParams.get('poi');
    const categoryFilter = (searchParams.get('category') as MainCategory) || 'all';
    const { user } = useAuth();

    useEffect(() => {
        async function getPois() {
            try {
                const poiData = await fetchPois();
                setPois(poiData);
            } catch (error) {
                console.error("Impossible de récupérer les POIs", error);
            } finally {
                setLoading(false);
            }
        }
        getPois();
    }, []);

    const handleSelectPoi = (poi: POI) => {
        const params = new URLSearchParams(searchParams.toString());
        params.set('poi', poi.id);
        router.push(`${pathname}?${params.toString()}`);
    };
    
    const sortedPois = useMemo(() => {
      if (!userLocation) return pois;
      return [...pois].sort((a, b) => {
          const distA = getDistance(userLocation.lat, userLocation.lng, a.location.lat, a.location.lng);
          const distB = getDistance(userLocation.lat, userLocation.lng, b.location.lat, b.location.lng);
          return distA - distB;
      });
    }, [pois, userLocation]);

    const visiblePois = useMemo(() => {
      const filtered = sortedPois.filter(poi => 
        categoryFilter === 'all' || poi.mainCategory === categoryFilter
      );
    
      if (user) {
        return filtered;
      }
      return filtered.slice(0, 2);
    }, [sortedPois, user, categoryFilter]);
    
    if (loading) {
        return (
            <div className="px-2 space-y-2">
                {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
            </div>
        )
    }

    return (
      <>
        <div className="flex flex-col gap-1 px-2 mt-2">
            {visiblePois.map((poi) => (
                <button
                    key={poi.id}
                    onClick={() => handleSelectPoi(poi)}
                    className={cn(
                        'w-full text-left p-2 rounded-md transition-colors text-sm flex flex-col',
                        selectedPoiId === poi.id
                            ? 'bg-sidebar-accent text-sidebar-accent-foreground'
                            : 'hover:bg-sidebar-accent/50'
                    )}
                >
                    <span className="font-medium">{poi.title}</span>
                     {userLocation ? (
                        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                            <Navigation className="h-3 w-3" />
                            <span>
                                {`${getDistance(userLocation.lat, userLocation.lng, poi.location.lat, poi.location.lng).toFixed(2)} km`}
                            </span>
                        </div>
                    ) : geoLoading ? (
                        <Skeleton className="h-3 w-16 mt-1" />
                    ) : null}
                </button>
            ))}
        </div>
        {!user && pois.length > 2 && (
          <div className="p-2">
            <Card className="p-3 text-center bg-sidebar-accent/50 border-sidebar-border">
              <CardDescription className="text-xs">
                Connectez-vous pour découvrir tous les points d'intérêt.
              </CardDescription>
              <AuthDialog trigger={
                <Button size="sm" className="mt-3 w-full">
                  <Unlock className="mr-2 h-4 w-4" />
                  Découvrir
                </Button>
              }/>
            </Card>
          </div>
        )}
      </>
    )
}


export function SidebarNav() {
  const { user, role } = useAuth();
  const pathname = usePathname();

  const navItems = [
    {
      href: '/dashboard',
      icon: LayoutDashboard,
      label: 'Tableau de bord',
      auth: true, // Visible to all, but we may want to distinguish later
    },
    {
      href: '/pois',
      icon: MapPin,
      label: 'Gérer les POIs',
      roles: ['editor', 'admin'],
      auth: true,
    },
    {
      href: '/admin',
      icon: Users,
      label: 'Admin',
      roles: ['admin'],
      auth: true,
    },
  ];

  const canAddPoi = role === 'admin' || role === 'editor';

  const filteredNavItems = navItems.filter(item => {
      if (!item.auth) return true; // Public items
      if (!user) return false; // Auth-only items for logged-out users
      if (item.roles) return role && item.roles.includes(role); // Role-based items
      return true; // For auth items without specific roles
  });

  const isDashboard = pathname.startsWith('/dashboard');

  return (
    <>
      <SidebarHeader>
        <Link href="/" className="flex items-center gap-2">
          <Mountain className="h-8 w-8 text-primary" />
          <div className="flex flex-col">
            <h2 className="text-lg font-semibold tracking-tight">
              Leu Tempo
            </h2>
            <p className="text-sm text-muted-foreground">
              {user ? `Bienvenue, ${user.displayName?.split(' ')[0] || 'Utilisateur'} !` : 'Bienvenue !'}
            </p>
          </div>
        </Link>
      </SidebarHeader>
      
      <SidebarContent>
        <ScrollArea className="h-full">
            <SidebarMenu className="p-2">
            {filteredNavItems.map((item) => (
                <SidebarMenuItem key={item.href + item.label}>
                <SidebarMenuButton
                    asChild
                    isActive={pathname.startsWith(item.href)}
                >
                    <Link href={item.href}>
                    <item.icon />
                    <span>{item.label}</span>
                    </Link>
                </SidebarMenuButton>
                </SidebarMenuItem>
            ))}
            </SidebarMenu>
            
            {isDashboard && (
                <>
                    <SidebarSeparator />
                    <div className="p-2 space-y-2">
                        <div className="flex items-center justify-between px-2">
                            <h3 className="text-sm font-semibold text-muted-foreground">Explorer</h3>
                             {canAddPoi && (
                                <Button variant="ghost" size="icon" className="h-7 w-7" asChild>
                                    <Link href="/pois/new" title="Ajouter un nouveau POI">
                                        <PlusCircle className="h-4 w-4" />
                                    </Link>
                                </Button>
                            )}
                        </div>
                        <POISidebarList />
                    </div>
                </>
            )}
        </ScrollArea>
      </SidebarContent>

      <SidebarFooter>
        {/* The user nav in the header now handles login/logout */}
      </SidebarFooter>
    </>
  );
}
