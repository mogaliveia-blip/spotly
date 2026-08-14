'use client';

import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { useParams, usePathname } from 'next/navigation';
import { fetchEventById, fetchEventBySlug, DEFAULT_EVENT_ID } from '@/lib/data';
import type { AppEvent, EventRole } from '@/lib/types';
import { useAuth } from '@/hooks/use-auth-user';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import {
  clearStoredPrivateAccessEventId,
  clearSessionPrivateAccessToken,
  getSessionPrivateAccessToken,
  getStoredPrivateAccessEventId,
  getPrivateAccessTokenFromUrl,
  redeemPrivateEventAccess,
  removePrivateAccessTokenFromUrl,
  storeSessionPrivateAccessToken,
  storePrivateAccessEventId
} from '@/lib/private-event-access';

interface EventContextType {
  event: AppEvent | null;
  eventId: string;
  loading: boolean;
  userRole: EventRole | null; // Ajout du rôle local de l'utilisateur
  roleLoading: boolean;
  privateAccessRecoveryRequired: boolean;
}

const EventContext = createContext<EventContextType>({
  event: null,
  eventId: DEFAULT_EVENT_ID,
  loading: true,
  userRole: null,
  roleLoading: false,
  privateAccessRecoveryRequired: false,
});

export function EventProvider({ children }: { children: React.ReactNode }) {
  const params = useParams();
  const pathname = usePathname();
  const { user, firebaseUser, role: globalRole, loading: authLoading, authStateKnown } = useAuth();
  const [event, setEvent] = useState<AppEvent | null>(null);
  const [currentEventId, setInternalEventId] = useState<string>(DEFAULT_EVENT_ID);
  const [userRole, setUserRole] = useState<EventRole | null>(null);
  const [roleLoading, setRoleLoading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [resolvedSlug, setResolvedSlug] = useState<string | null>(null);
  const [privateAccessRecoveryRequired, setPrivateAccessRecoveryRequired] = useState(false);
  const redeemedPrivateAccessRef = useRef<string | null>(null);

  const eventSlug = params?.eventSlug as string;
  const isPublicDashboard = /^\/[^/]+\/dashboard(?:\/)?$/.test(pathname || '');

  // Détection immédiate de changement de route
  const isTransitioning = eventSlug !== (resolvedSlug === 'global' ? undefined : resolvedSlug);

  useEffect(() => {
    let isMounted = true;

    async function resolveEvent() {
      // Si on est sur une route globale
      if (!eventSlug || ['dashboard', 'admin', 'login', 'signup', 'access-pending'].includes(eventSlug)) {
        if (isMounted) {
          setEvent(null);
          setInternalEventId(DEFAULT_EVENT_ID);
          setResolvedSlug('global');
          setUserRole(null);
          setRoleLoading(false);
          setPrivateAccessRecoveryRequired(false);
          setLoading(false);
        }
        return;
      }

      const shouldReplayPrivateTokenForSignedInUser =
        isPublicDashboard &&
        !!firebaseUser &&
        !firebaseUser.isAnonymous &&
        !!getSessionPrivateAccessToken(eventSlug);

      if (
        isPublicDashboard &&
        !shouldReplayPrivateTokenForSignedInUser &&
        resolvedSlug === eventSlug &&
        event?.slug === eventSlug &&
        event.status === 'published'
      ) {
        return;
      }

      if (!isPublicDashboard && authLoading) {
        setLoading(true);
        return;
      }

      if (isPublicDashboard && !authStateKnown && getStoredPrivateAccessEventId(eventSlug) && !getPrivateAccessTokenFromUrl()) {
        setLoading(true);
        return;
      }

      setLoading(true);
      setInternalEventId(DEFAULT_EVENT_ID);
      setEvent(null);
      setUserRole(null);
      setRoleLoading(false);
      setPrivateAccessRecoveryRequired(false);

      try {
        let privateAccessUid: string | null = null;
        let privateAccessEvent: AppEvent | null = null;
        const privateAccessToken = isPublicDashboard ? getPrivateAccessTokenFromUrl() : null;
        const sessionPrivateAccessToken = isPublicDashboard ? getSessionPrivateAccessToken(eventSlug) : null;
        const tokenForCurrentUser = !privateAccessToken && firebaseUser && !firebaseUser.isAnonymous
          ? sessionPrivateAccessToken
          : null;
        const tokenToRedeem = privateAccessToken ?? tokenForCurrentUser;

        if (tokenToRedeem && redeemedPrivateAccessRef.current !== `${eventSlug}:${tokenToRedeem}:${firebaseUser?.uid ?? 'initial'}`) {
          let shouldRemoveUrlToken = false;

          try {
            const redeemResult = await redeemPrivateEventAccess(eventSlug, tokenToRedeem);
            privateAccessUid = redeemResult.uid;
            privateAccessEvent = await fetchEventById(redeemResult.eventId);

            if (!privateAccessEvent) {
              throw new Error('PRIVATE_EVENT_READ_AFTER_GRANT_FAILED');
            }

            storePrivateAccessEventId(eventSlug, redeemResult.eventId);
            if (redeemResult.isAnonymous) {
              storeSessionPrivateAccessToken(eventSlug, tokenToRedeem);
            } else {
              clearSessionPrivateAccessToken(eventSlug);
            }
            redeemedPrivateAccessRef.current = `${eventSlug}:${tokenToRedeem}:${redeemResult.uid}`;
            shouldRemoveUrlToken = true;
          } catch (error) {
            const errorCode = (error as any)?.code ?? null;
            console.warn('[EventProvider] private access validation failed', {
              eventSlug,
              errorCode,
              errorMessage: (error as any)?.message ?? null,
            });

            shouldRemoveUrlToken =
              errorCode === 'functions/permission-denied' ||
              errorCode === 'functions/not-found' ||
              errorCode === 'functions/invalid-argument';
          } finally {
            if (privateAccessToken && shouldRemoveUrlToken) {
              removePrivateAccessTokenFromUrl();
            }
          }
        }

        if (!privateAccessEvent && isPublicDashboard && !tokenToRedeem) {
          const storedPrivateAccessEventId = getStoredPrivateAccessEventId(eventSlug);

          if (storedPrivateAccessEventId) {
            privateAccessEvent = await fetchEventById(storedPrivateAccessEventId);

            if (!privateAccessEvent) {
              clearStoredPrivateAccessEventId(eventSlug);
              if (isMounted) setPrivateAccessRecoveryRequired(true);
            }
          }
        }

        const publicResolved = await fetchEventBySlug(eventSlug);
        let resolved = privateAccessEvent ?? publicResolved;

        if (!resolved) {
          const fallbackUid = privateAccessUid ?? user?.uid;
          const canAttemptPrivateFallback = !!fallbackUid || globalRole === 'owner';
          const shouldAttemptPrivateFallback = canAttemptPrivateFallback && (!!privateAccessUid || !isPublicDashboard || authStateKnown);

          if (shouldAttemptPrivateFallback) {
            resolved = await fetchEventBySlug(eventSlug, {
              uid: fallbackUid,
              isOwner: globalRole === 'owner',
              allowPrivateFallback: true,
            });
          }
        }
        
        if (isMounted) {
          if (resolved) {
            setRoleLoading(!!user);
            setEvent(resolved);
            setInternalEventId(resolved.id);

            if (publicResolved && isPublicDashboard) {
              setResolvedSlug(eventSlug);
              setLoading(false);
            }

          } else {
            setInternalEventId(DEFAULT_EVENT_ID);
            setEvent(null);
          }
          if (!(publicResolved && isPublicDashboard)) {
            setResolvedSlug(eventSlug);
            setLoading(false);
          }
        }
      } catch (error) {
        console.error('[EventProvider] event resolution failed', {
          eventSlug,
          errorCode: (error as any)?.code ?? null,
          errorMessage: (error as any)?.message ?? null,
        });
        if (isMounted) {
          setInternalEventId(DEFAULT_EVENT_ID);
          setEvent(null);
          setResolvedSlug(eventSlug);
          setRoleLoading(false);
          setLoading(false);
        }
      }
    }

    resolveEvent();

    return () => {
      isMounted = false;
    };
  }, [eventSlug, user?.uid, firebaseUser?.uid, firebaseUser?.isAnonymous, globalRole, authLoading, authStateKnown, isPublicDashboard, pathname]);

  useEffect(() => {
    let isMounted = true;

    if (!event) {
      setUserRole(null);
      setRoleLoading(false);
      return () => {
        isMounted = false;
      };
    }

    if (!user) {
      setUserRole(null);
      setRoleLoading(false);
      return () => {
        isMounted = false;
      };
    }

    const resolvedEvent = event;
    const resolvedUser = user;

    async function resolveMembershipRole() {
      setRoleLoading(true);

      try {
        const memberDoc = await getDoc(doc(db, `events/${resolvedEvent.id}/members`, resolvedUser.uid));

        if (!isMounted) return;

        if (memberDoc.exists()) {
          setUserRole(memberDoc.data().role as EventRole);
        } else if (globalRole === 'owner') {
          setUserRole('admin');
        } else {
          setUserRole(null);
        }
      } catch (error: any) {
        console.error('[EventProvider] member role fetch failed', {
          eventId: resolvedEvent.id,
          errorCode: error?.code ?? null,
          errorMessage: error?.message ?? null,
        });

        if (isMounted) {
          setUserRole(globalRole === 'owner' ? 'admin' : null);
        }
      } finally {
        if (isMounted) {
          setRoleLoading(false);
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
      userRole,
      roleLoading,
      privateAccessRecoveryRequired
    }}>
      {children}
    </EventContext.Provider>
  );
}

export const useEvent = () => useContext(EventContext);
