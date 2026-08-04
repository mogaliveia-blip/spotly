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
      const requestId = typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID()
        : `event-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      console.info('[Perf] event-provider-start', {
        requestId,
        eventSlug: eventSlug ?? null,
        pathname,
        isPublicDashboard,
        authLoading,
        authStateKnown,
        hasUser: !!user,
      });
      // Si on est sur une route globale
      if (!eventSlug || ['dashboard', 'admin', 'login', 'signup', 'access-pending'].includes(eventSlug)) {
        if (isMounted) {
          setEvent(null);
          setInternalEventId(DEFAULT_EVENT_ID);
          setResolvedSlug('global');
          setUserRole(null);
          setLoading(false);
          console.info('[Perf] event-provider-ready', {
            requestId,
            durationMs: Math.round(performance.now() - startedAt),
            routeType: 'global',
            eventSlug: eventSlug ?? null,
            eventId: DEFAULT_EVENT_ID,
          });
        }
        return;
      }

      if (
        isPublicDashboard &&
        resolvedSlug === eventSlug &&
        event?.slug === eventSlug &&
        event.status === 'published'
      ) {
        console.info('[Perf] event-provider-public-resolve-skipped', {
          requestId,
          eventSlug,
          eventId: event.id,
          reason: 'published-event-already-resolved',
          authLoading,
          authStateKnown,
          hasUser: !!user,
        });
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
                requestId,
                durationMs: Math.round(performance.now() - startedAt),
                routeType: 'event',
                eventSlug,
                eventId: resolved.id,
                found: true,
                source: 'public',
                membershipBlocking: false,
              });
            }

          } else {
            setInternalEventId(DEFAULT_EVENT_ID);
            setEvent(null);
          }
          if (!(publicResolved && isPublicDashboard)) {
            setResolvedSlug(eventSlug);
            setLoading(false);
            console.info('[Perf] event-provider-ready', {
              requestId,
              durationMs: Math.round(performance.now() - startedAt),
              routeType: 'event',
              eventSlug,
              eventId: resolved?.id ?? DEFAULT_EVENT_ID,
              found: !!resolved,
              source: resolvedVia,
              authDependent: resolvedVia === 'private-fallback',
              membershipBlocking: resolvedVia === 'private-fallback',
            });
          }
        }
      } catch (error) {
        if (isMounted) {
          setInternalEventId(DEFAULT_EVENT_ID);
          setEvent(null);
          setResolvedSlug(eventSlug);
          setLoading(false);
          console.info('[Perf] event-provider-ready', {
            requestId,
            durationMs: Math.round(performance.now() - startedAt),
            routeType: 'event',
            eventSlug,
            eventId: DEFAULT_EVENT_ID,
            found: false,
            source: 'error',
          });
        }
      }
    }

    resolveEvent();

    return () => {
      isMounted = false;
    };
  }, [eventSlug, user, globalRole, authLoading, authStateKnown, isPublicDashboard, pathname, resolvedSlug, event?.slug, event?.status, event?.id]);

  useEffect(() => {
    let isMounted = true;

    if (!event) {
      setUserRole(null);
      return () => {
        isMounted = false;
      };
    }

    if (!user) {
      setUserRole(null);
      return () => {
        isMounted = false;
      };
    }

    const resolvedEvent = event;
    const resolvedUser = user;

    async function resolveMembershipRole() {
      const memberStartedAt = performance.now();

      try {
        const memberDoc = await getDoc(doc(db, `events/${resolvedEvent.id}/members`, resolvedUser.uid));
        console.info('[Perf] event-member-role', {
          durationMs: Math.round(performance.now() - memberStartedAt),
          eventId: resolvedEvent.id,
          uid: resolvedUser.uid,
          docsRead: memberDoc.exists() ? 1 : 0,
          blockingPublicResolution: false,
        });

        if (!isMounted) return;

        if (memberDoc.exists()) {
          setUserRole(memberDoc.data().role as EventRole);
        } else if (globalRole === 'owner') {
          setUserRole('admin');
        } else {
          setUserRole(null);
        }
      } catch (error: any) {
        console.warn('[Perf] event-member-role-error', {
          durationMs: Math.round(performance.now() - memberStartedAt),
          eventId: resolvedEvent.id,
          uid: resolvedUser.uid,
          errorCode: error?.code ?? null,
          errorMessage: error?.message ?? null,
          blockingPublicResolution: false,
        });

        if (isMounted) {
          setUserRole(globalRole === 'owner' ? 'admin' : null);
        }
      }
    }

    resolveMembershipRole();

    return () => {
      isMounted = false;
    };
  }, [event?.id, user?.uid, globalRole]);

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
