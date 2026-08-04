'use client';

import React, { createContext, useContext, useEffect, useState } from 'react';
import { useParams, usePathname } from 'next/navigation';
import { fetchEventBySlug, DEFAULT_EVENT_ID } from '@/lib/data';
import type { AppEvent, EventRole } from '@/lib/types';
import { useAuth } from '@/hooks/use-auth-user';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';

interface EventContextType {
  event: AppEvent | null;
  eventId: string;
  loading: boolean;
  userRole: EventRole | null; // Ajout du rôle local de l'utilisateur
}

const EventContext = createContext<EventContextType>({
  event: null,
  eventId: DEFAULT_EVENT_ID,
  loading: true,
  userRole: null,
});

export function EventProvider({ children }: { children: React.ReactNode }) {
  const params = useParams();
  const pathname = usePathname();
  const { user, role: globalRole, loading: authLoading, authStateKnown } = useAuth();
  const [event, setEvent] = useState<AppEvent | null>(null);
  const [currentEventId, setInternalEventId] = useState<string>(DEFAULT_EVENT_ID);
  const [userRole, setUserRole] = useState<EventRole | null>(null);
  const [loading, setLoading] = useState(true);
  const [resolvedSlug, setResolvedSlug] = useState<string | null>(null);

  const eventSlug = params?.eventSlug as string;
  const isPublicDashboard = /^\/[^/]+\/dashboard(?:\/)?$/.test(pathname || '');

  // Détection immédiate de changement de route
  const isTransitioning = eventSlug !== (resolvedSlug === 'global' ? undefined : resolvedSlug);

  useEffect(() => {
    let isMounted = true;

    async function resolveEvent() {
      const startedAt = performance.now();
      console.time('[Perf] event-provider')
      // Si on est sur une route globale
      if (!eventSlug || ['dashboard', 'admin', 'login', 'signup', 'access-pending'].includes(eventSlug)) {
        if (isMounted) {
          setEvent(null);
          setInternalEventId(DEFAULT_EVENT_ID);
          setResolvedSlug('global');
          setUserRole(null);
          setLoading(false);
          console.info('[Perf] event-provider-ready', {
            durationMs: Math.round(performance.now() - startedAt),
            routeType: 'global',
            eventSlug: eventSlug ?? null,
            eventId: DEFAULT_EVENT_ID,
          });
          console.timeEnd('[Perf] event-provider')
        }
        return;
      }

      if (!isPublicDashboard && authLoading) {
        setLoading(true);
        console.info('[Perf] event-provider-waiting-auth', {
          eventSlug,
          pathname,
          authLoading,
          isPublicDashboard,
        });
        return;
      }

      setLoading(true);
      setInternalEventId(DEFAULT_EVENT_ID);
      setEvent(null);
      setUserRole(null);

      try {
        const publicResolved = await fetchEventBySlug(eventSlug);
        let resolved = publicResolved;
        let resolvedVia: 'public' | 'private-fallback' | 'not-found' = publicResolved ? 'public' : 'not-found';

        if (!publicResolved) {
          const canAttemptPrivateFallback = !!user || globalRole === 'owner';
          const shouldAttemptPrivateFallback = canAttemptPrivateFallback && (!isPublicDashboard || authStateKnown);

          if (shouldAttemptPrivateFallback) {
            const fallbackStartedAt = performance.now();
            resolved = await fetchEventBySlug(eventSlug, {
              uid: user?.uid,
              isOwner: globalRole === 'owner',
              allowPrivateFallback: true,
            });
            resolvedVia = resolved ? 'private-fallback' : 'not-found';
            console.info('[Perf] event-private-fallback', {
              durationMs: Math.round(performance.now() - fallbackStartedAt),
              eventSlug,
              found: !!resolved,
              isPublicDashboard,
              authStateKnown,
            });
          } else {
            console.info('[Perf] event-user-membership-fallback-skipped', {
              eventSlug,
              isPublicDashboard,
              authLoading,
              authStateKnown,
              hasUser: !!user,
              isOwner: globalRole === 'owner',
            });
          }
        }
        
        if (isMounted) {
          if (resolved) {
            setEvent(resolved);
            setInternalEventId(resolved.id);

            if (publicResolved && isPublicDashboard) {
              setResolvedSlug(eventSlug);
              setLoading(false);
              console.info('[Perf] event-provider-ready', {
                durationMs: Math.round(performance.now() - startedAt),
                routeType: 'event',
                eventSlug,
                eventId: resolved.id,
                found: true,
                source: 'public',
                membershipBlocking: false,
              });
              console.timeEnd('[Perf] event-provider')
            }

            if (user) {
              const memberStartedAt = performance.now();
              const memberDoc = await getDoc(doc(db, `events/${resolved.id}/members`, user.uid));
              console.info('[Perf] event-member-role', {
                durationMs: Math.round(performance.now() - memberStartedAt),
                eventId: resolved.id,
                uid: user.uid,
                docsRead: memberDoc.exists() ? 1 : 0,
              });
              if (memberDoc.exists()) {
                setUserRole(memberDoc.data().role as EventRole);
              } else if (globalRole === 'owner') {
                setUserRole('admin'); // Le proprio plateforme est admin partout
              }
            }
          } else {
            setInternalEventId(DEFAULT_EVENT_ID);
            setEvent(null);
          }
          if (!(publicResolved && isPublicDashboard)) {
            setResolvedSlug(eventSlug);
            setLoading(false);
            console.info('[Perf] event-provider-ready', {
              durationMs: Math.round(performance.now() - startedAt),
              routeType: 'event',
              eventSlug,
              eventId: resolved?.id ?? DEFAULT_EVENT_ID,
              found: !!resolved,
              source: resolvedVia,
              authDependent: resolvedVia === 'private-fallback',
              membershipBlocking: resolvedVia === 'private-fallback',
            });
            console.timeEnd('[Perf] event-provider')
          }
        }
      } catch (error) {
        if (isMounted) {
          setInternalEventId(DEFAULT_EVENT_ID);
          setEvent(null);
          setResolvedSlug(eventSlug);
          setLoading(false);
          console.info('[Perf] event-provider-ready', {
            durationMs: Math.round(performance.now() - startedAt),
            routeType: 'event',
            eventSlug,
            eventId: DEFAULT_EVENT_ID,
            found: false,
            source: 'error',
          });
          console.timeEnd('[Perf] event-provider')
        }
      }
    }

    resolveEvent();

    return () => {
      isMounted = false;
    };
  }, [eventSlug, user, globalRole, authLoading, authStateKnown, isPublicDashboard]);

  return (
    <EventContext.Provider value={{ 
      event, 
      eventId: currentEventId, 
      loading: loading || isTransitioning,
      userRole
    }}>
      {children}
    </EventContext.Provider>
  );
}

export const useEvent = () => useContext(EventContext);
