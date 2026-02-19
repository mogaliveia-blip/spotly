'use client';

import {
  SidebarHeader,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarContent,
  SidebarFooter,
  SidebarSeparator,
  SidebarGroup,
  SidebarGroupLabel,
  useSidebar,
} from '@/components/ui/sidebar';
import { useAuth } from '@/hooks/use-auth-user';
import {
  LayoutDashboard,
  MapPin,
  Users,
  Mountain,
  PlusCircle,
  Navigation,
  Monitor,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Button } from '../ui/button';
import { useEffect, useState, useMemo } from 'react';
import type { POI, MainCategory, AppConfig } from '@/lib/types';
import { fetchPois, fetchAppConfig } from '@/lib/data';
import { useGeolocation } from '@/providers/geolocation-provider';
import { getDistance } from '@/lib/utils';
import { Skeleton } from '../ui/skeleton';
import { cn } from '@/lib/utils';
import { ScrollArea } from '../ui/scroll-area';
import { AuthDialog } from '../auth/auth-dialog';
import { isSponsorActive } from '@/lib/sponsor-utils';
import { SponsorBadge } from '../sponsor/sponsor-badge';
import { categoriesMap } from '@/lib/types';

function POISidebarList() {
  const [pois, setPois] = useState<POI[]>([]);
  const [appConfig, setAppConfig] = useState<AppConfig | null>(null);
  const [loading, setLoading] = useState(true);

  const { userLocation, loading: geoLoading } = useGeolocation();
  const { setOpenMobile, isMobile } = useSidebar();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const selectedPoiId = searchParams.get('poi');
  const categoryFilter = (searchParams.get('category') as MainCategory) || 'all';
  const { user } = useAuth();

  useEffect(() => {
    async function init() {
      try {
        const [poiData, config] = await Promise.all([fetchPois(), fetchAppConfig()]);
        setPois(poiData);
        setAppConfig(config);
      } catch (error) {
        console.error('Impossible de récupérer les données (POIs/config)', error);
      } finally {
        setLoading(false);
      }
    }
    init();
  }, []);

  const handleSelectPoi = (poi: POI) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set('poi', poi.id);
    router.push(`${pathname}?${params.toString()}`);
    
    if (isMobile) {
      setOpenMobile(false);
    }
  };

  const sortedAndFilteredPois = useMemo(() => {
    const filteredByCategory = pois.filter(
      (p) => categoryFilter === 'all' || p.mainCategory === categoryFilter
    );

    const activeSponsors: POI[] = [];
    const otherPois: POI[] = [];

    for (const poi of filteredByCategory) {
      if (isSponsorActive(poi)) {
        activeSponsors.push(poi);
      } else {
        otherPois.push(poi);
      }
    }

    activeSponsors.sort((a, b) => (b.sponsor?.priority ?? 0) - (a.sponsor?.priority ?? 0));

    if (userLocation) {
      otherPois.sort((a, b) => {
        const distA = getDistance(userLocation.lat, userLocation.lng, a.location.lat, a.location.lng);
        const distB = getDistance(userLocation.lat, userLocation.lng, b.location.lat, b.location.lng);
        return distA - distB;
      });
    }

    return [...activeSponsors, ...otherPois];
  }, [pois, categoryFilter, userLocation]);

  const visiblePois = useMemo(() => {
    if (appConfig?.festivalMode || user) {
      return sortedAndFilteredPois;
    }
    return sortedAndFilteredPois.slice(0, 2);
  }, [sortedAndFilteredPois, user, appConfig]);

  if (loading) {
    return (
      <div className="px-3 space-y-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-14 w-full rounded-md" />
        ))}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2 px-3">
      {visiblePois.map((poi) => {
        const categoryData = categoriesMap[poi.mainCategory];
        const CategoryIcon = categoryData?.icon || MapPin;
        const isSelected = selectedPoiId === poi.id;

        return (
          <button
            key={poi.id}
            onClick={() => handleSelectPoi(poi)}
            className={cn(
              'w-full text-left p-3 rounded-md transition-all text-sm flex items-start gap-3 border-l-4',
              isSelected
                ? 'bg-sidebar-accent text-sidebar-accent-foreground border-primary shadow-sm'
                : 'hover:bg-sidebar-accent/50 border-transparent'
            )}
          >
            <div className={cn(
              "p-1.5 rounded-full bg-background/80 shadow-sm shrink-0 mt-0.5",
              categoryData?.color || "text-primary"
            )}>
              <CategoryIcon size={16} />
            </div>
            
            <div className="flex-1 min-w-0">
              <div className="flex items-start justify-between gap-2 mb-1">
                <span className="font-semibold whitespace-normal leading-snug line-clamp-2">
                  {poi.title}
                </span>
                <div className="shrink-0 pt-0.5">
                  <SponsorBadge sponsor={poi.sponsor} />
                </div>
              </div>

              {userLocation ? (
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground mt-1">
                  <Navigation className="h-3 w-3" />
                  <span>
                    {`${getDistance(
                      userLocation.lat,
                      userLocation.lng,
                      poi.location.lat,
                      poi.location.lng
                    ).toFixed(2)} km`}
                  </span>
                </div>
              ) : geoLoading ? (
                <Skeleton className="h-3 w-16 mt-1" />
              ) : null}
            </div>
          </button>
        );
      })}
    </div>
  );
}

export function SidebarNav() {
  const { user, role } = useAuth();
  const pathname = usePathname();

  const navItems = [
    {
      href: '/dashboard',
      icon: LayoutDashboard,
      label: 'Tableau de bord',
      auth: true,
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
      label: 'Administration',
      roles: ['admin'],
      auth: true,
    },
    {
      href: '/admin/monitor',
      icon: Monitor,
      label: 'Supervision',
      roles: ['admin'],
      auth: true,
    },
  ];

  const canAddPoi = role === 'admin' || role === 'editor';

  const filteredNavItems = navItems.filter((item) => {
    if (!item.auth) return true;
    if (!user) return false;
    if (item.roles) return role && item.roles.includes(role);
    return true;
  });

  const isDashboard = pathname.startsWith('/dashboard');

  return (
    <>
      <SidebarHeader className="p-6">
        <Link href="/" className="flex items-center gap-3 group">
          <div className="p-2 rounded-xl bg-primary/10 group-hover:bg-primary/20 transition-colors">
            <Mountain className="h-8 w-8 text-primary" />
          </div>
          <div className="flex flex-col">
            <h2 className="text-xl font-bold tracking-tight text-foreground">Leu Tempo</h2>
            <p className="text-xs text-muted-foreground font-medium">
              {user ? `Salut, ${user.displayName?.split(' ')[0]} !` : 'Bienvenue !'}
            </p>
          </div>
        </Link>
      </SidebarHeader>

      <SidebarContent>
        <ScrollArea className="h-full">
          <SidebarGroup className="py-2">
            <SidebarGroupLabel className="px-6 text-[10px] uppercase tracking-[0.2em] font-bold text-muted-foreground/80 mb-2">
              Menu Principal
            </SidebarGroupLabel>
            <SidebarMenu className="px-3">
              {filteredNavItems.map((item) => (
                <SidebarMenuItem key={item.href + item.label}>
                  <SidebarMenuButton asChild isActive={pathname.startsWith(item.href)} className="px-4 h-10">
                    <Link href={item.href}>
                      <item.icon className="mr-2" />
                      <span className="font-medium">{item.label}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroup>

          {isDashboard && (
            <SidebarGroup className="py-4">
              <SidebarSeparator className="mx-6 mb-6" />
              <div className="flex items-center justify-between px-6 mb-4">
                <SidebarGroupLabel className="p-0 text-[10px] uppercase tracking-[0.2em] font-bold text-muted-foreground/80">
                  Exploration
                </SidebarGroupLabel>
                {canAddPoi && (
                  <Button variant="ghost" size="icon" className="h-6 w-6 rounded-full hover:bg-primary/10 text-primary" asChild>
                    <Link href="/pois/new" title="Ajouter un nouveau POI">
                      <PlusCircle className="h-4 w-4" />
                    </Link>
                  </Button>
                )}
              </div>
              <POISidebarList />
            </SidebarGroup>
          )}
        </ScrollArea>
      </SidebarContent>

      <SidebarFooter>
        {!user && (
          <div className="p-4 border-t bg-sidebar-accent/20 rounded-t-xl">
             <p className="text-[11px] text-muted-foreground mb-3 text-center leading-relaxed">
               Connectez-vous pour laisser des avis et recevoir les dernières infos du festival.
             </p>
             <AuthDialog
               trigger={
                 <Button size="sm" className="w-full shadow-sm font-semibold">
                   Se connecter
                 </Button>
               }
             />
          </div>
        )}
      </SidebarFooter>
    </>
  );
}
