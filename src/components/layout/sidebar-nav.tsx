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
  Filter,
  CalendarDays
} from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams, useParams } from 'next/navigation';
import { Button } from '../ui/button';
import { useEffect, useState, useMemo } from 'react';
import type { POI, MainCategory } from '@/lib/types';
import { fetchPois, DEFAULT_EVENT_ID } from '@/lib/data';
import { useGeolocation } from '@/providers/geolocation-provider';
import { getDistance } from '@/lib/utils';
import { Skeleton } from '../ui/skeleton';
import { cn } from '@/lib/utils';
import { ScrollArea } from '../ui/scroll-area';
import { AuthDialog } from '../auth/auth-dialog';
import { isSponsorActive } from '@/lib/sponsor-utils';
import { SponsorBadge } from '../sponsor/sponsor-badge';
import { categoriesMap } from '@/lib/types';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../ui/select';
import { useEvent } from '@/providers/event-provider';

function POISidebarList() {
  const [pois, setPois] = useState<POI[]>([]);
  const [loading, setLoading] = useState(true);

  const { userLocation } = useGeolocation();
  const { eventId, loading: eventLoading } = useEvent();
  const { setOpenMobile, isMobile } = useSidebar();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const selectedPoiId = searchParams.get('poi');
  const categoryFilter = (searchParams.get('category') as MainCategory) || 'all';

  useEffect(() => {
    if (eventLoading || eventId === DEFAULT_EVENT_ID) {
        setLoading(false);
        setPois([]);
        return;
    }
    
    async function init() {
      try {
        const poiData = await fetchPois(eventId);
        setPois(poiData);
      } catch (error) {
        console.error('Impossible de récupérer les POIs', error);
      } finally {
        setLoading(false);
      }
    }
    init();
  }, [eventId, eventLoading]);

  const handleSelectPoi = (poi: POI) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set('poi', poi.id);
    router.push(`${pathname}?${params.toString()}`);
    
    if (isMobile) {
      setOpenMobile(false);
    }
  };

  const handleCategoryChange = (val: string) => {
    const params = new URLSearchParams(searchParams.toString());
    if (val === 'all') {
      params.delete('category');
    } else {
      params.set('category', val);
    }
    params.delete('poi');
    router.push(`${pathname}?${params.toString()}`);
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

  if (eventLoading) {
    return (
      <div className="px-3 space-y-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-14 w-full rounded-2xl" />
        ))}
      </div>
    );
  }

  if (eventId === DEFAULT_EVENT_ID) return null;

  return (
    <div className="flex flex-col">
      <div className="flex items-center justify-between px-3 mb-4 mt-1">
        <Select value={categoryFilter} onValueChange={handleCategoryChange}>
          <SelectTrigger className="h-8 w-[160px] text-[10px] bg-sidebar-accent/50 border-none shadow-none focus:ring-0 rounded-full px-3 font-bold uppercase">
            <div className="flex items-center gap-2">
              <Filter className="h-3 w-3 text-muted-foreground" />
              <SelectValue placeholder="Catégorie" />
            </div>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all" className="text-xs">Toutes les catégories</SelectItem>
            {Object.entries(categoriesMap).map(([key, { label }]) => (
              <SelectItem key={key} value={key} className="text-xs">{label}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div className="text-[10px] font-black text-muted-foreground/40 uppercase tracking-widest pr-2">
           {sortedAndFilteredPois.length} POIs
        </div>
      </div>

      <div className="flex flex-col gap-2 px-3">
        {sortedAndFilteredPois.map((poi) => {
          const categoryData = categoriesMap[poi.mainCategory];
          const CategoryIcon = categoryData?.icon || MapPin;
          const isSelected = selectedPoiId === poi.id;

          return (
            <button
              key={poi.id}
              onClick={() => handleSelectPoi(poi)}
              className={cn(
                'w-full text-left p-3 rounded-2xl transition-all text-sm flex items-start gap-3 border',
                isSelected
                    ? 'bg-primary text-primary-foreground border-primary shadow-lg scale-[1.02]'
                    : isSponsorActive(poi)
                        ? 'bg-amber-50/50 border-amber-200 shadow-sm'
                        : 'hover:bg-sidebar-accent/50 border-transparent'
              )}
            >
              <div className={cn(
                "p-1.5 rounded-full shadow-sm shrink-0 mt-0.5",
                isSelected ? "bg-white/20 text-white" : (categoryData?.color || "bg-background text-primary")
              )}>
                <CategoryIcon size={16} />
              </div>
              
              <div className="flex-1 min-w-0">
                <div className="flex flex-col gap-1">
                    {isSponsorActive(poi) && !isSelected && (
                        <SponsorBadge sponsor={poi.sponsor} className="w-fit" />
                    )}

                    <span className="font-bold leading-tight line-clamp-2">
                        {poi.title}
                    </span>
                </div>

                {userLocation && (
                  <div className={cn(
                    "flex items-center gap-1.5 text-[10px] font-bold mt-1",
                    isSelected ? "text-white/70" : "text-muted-foreground"
                  )}>
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
                )}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function SidebarNav() {
  const { user, role } = useAuth();
  const pathname = usePathname();
  const params = useParams();
  
  const eventSlug = params?.eventSlug as string;
  const prefix = eventSlug ? `/${eventSlug}` : '';

  const navItems = [
    {
      href: '/admin/events',
      icon: CalendarDays,
      label: 'Mes Événements',
      auth: true,
    },
    {
      href: `${prefix}/dashboard`,
      icon: LayoutDashboard,
      label: 'Carte',
      auth: true,
    },
    {
      href: `${prefix}/pois`,
      icon: MapPin,
      label: 'Points d\'intérêt',
      roles: ['editor', 'admin'],
      auth: true,
    },
    {
      href: `${prefix}/admin`,
      icon: Users,
      label: 'Administration',
      roles: ['admin'],
      auth: true,
    },
    {
      href: `${prefix}/admin/monitor`,
      icon: Monitor,
      label: 'Supervision',
      roles: ['admin'],
      auth: true,
    },
  ];

  const canAddPoi = (role === 'admin' || role === 'editor') && !!eventSlug;

  const filteredNavItems = navItems.filter((item) => {
    if (!item.auth) return true;
    if (!user) return false;
    if (item.roles) return role && item.roles.includes(role);
    return true;
  });

  const isDashboard = pathname.includes('/dashboard');

  return (
    <>
      <SidebarHeader className="p-6">
        <Link href="/" className="flex items-center gap-3 group">
          <div className="p-2 rounded-xl bg-primary/10 group-hover:bg-primary/20 transition-colors">
            <Mountain className="h-8 w-8 text-primary" />
          </div>
          <div className="flex flex-col">
            <h2 className="text-xl font-black tracking-tight text-foreground">Spotly</h2>
            <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">
              {user ? `Salut, ${user.displayName?.split(' ')[0]} !` : 'Bienvenue !'}
            </p>
          </div>
        </Link>
      </SidebarHeader>

      <SidebarContent>
        <ScrollArea className="h-full">
          <SidebarGroup className="py-2">
            <SidebarGroupLabel className="px-6 text-[10px] uppercase tracking-[0.2em] font-black text-muted-foreground/60 mb-2">
              Navigation
            </SidebarGroupLabel>
            <SidebarMenu className="px-3">
              {filteredNavItems.map((item) => (
                <SidebarMenuItem key={item.href + item.label}>
                  <SidebarMenuButton asChild isActive={pathname === item.href || (item.href !== '/' && pathname.startsWith(item.href))} className="px-4 h-11 rounded-xl">
                    <Link href={item.href}>
                      <item.icon className="mr-2" />
                      <span className="font-bold text-sm">{item.label}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroup>

          {isDashboard && !!eventSlug && (
            <SidebarGroup className="py-4">
              <SidebarSeparator className="mx-6 mb-6" />
              <div className="flex items-center justify-between px-6 mb-4">
                <SidebarGroupLabel className="p-0 text-[10px] uppercase tracking-[0.2em] font-black text-muted-foreground/60">
                  Exploration
                </SidebarGroupLabel>
                {canAddPoi && (
                  <Button variant="ghost" size="icon" className="h-7 w-7 rounded-full hover:bg-primary/10 text-primary" asChild>
                    <Link href={`${prefix}/pois/new`} title="Nouveau POI">
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
          <div className="p-4 border-t bg-sidebar-accent/20 rounded-t-3xl">
             <p className="text-[11px] text-muted-foreground mb-4 text-center leading-relaxed font-medium">
             Connectez-vous pour accéder à toutes les fonctionnalités.
             </p>
             <AuthDialog
               trigger={
                 <Button size="sm" className="w-full shadow-lg font-bold rounded-xl h-10">
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
