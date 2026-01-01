'use client';

import {
  SidebarHeader,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarContent,
  SidebarFooter,
} from '@/components/ui/sidebar';
import { useAuth } from '@/hooks/use-auth-user';
import {
  LayoutDashboard,
  MapPin,
  Users,
  Mountain,
  LogOut,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Button } from '../ui/button';
import { signOut } from 'firebase/auth';
import { auth } from '@/lib/firebase';
import { useRouter } from 'next/navigation';

export function SidebarNav() {
  const { role } = useAuth();
  const pathname = usePathname();
  const router = useRouter();

  const handleSignOut = async () => {
    await signOut(auth);
    router.push('/login');
  };

  const navItems = [
    {
      href: '/dashboard',
      icon: LayoutDashboard,
      label: 'Dashboard',
      roles: ['user', 'editor', 'admin'],
    },
    {
      href: '/pois',
      icon: MapPin,
      label: 'POI Management',
      roles: ['editor', 'admin'],
    },
    {
      href: '/admin',
      icon: Users,
      label: 'Admin',
      roles: ['admin'],
    },
  ];

  const filteredNavItems = navItems.filter((item) =>
    role ? item.roles.includes(role) : false
  );

  return (
    <>
      <SidebarHeader>
        <div className="flex items-center gap-2">
          <Mountain className="h-8 w-8 text-primary" />
          <div className="flex flex-col">
            <h2 className="text-lg font-semibold tracking-tight">
              Eventide Guide
            </h2>
            <p className="text-sm text-muted-foreground">Welcome!</p>
          </div>
        </div>
      </SidebarHeader>
      <SidebarContent>
        <SidebarMenu>
          {filteredNavItems.map((item) => (
            <SidebarMenuItem key={item.href}>
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
      </SidebarContent>
      <SidebarFooter>
        <Button variant="ghost" className="w-full justify-start gap-2" onClick={handleSignOut}>
          <LogOut />
          <span>Log Out</span>
        </Button>
      </SidebarFooter>
    </>
  );
}
