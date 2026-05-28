'use client';

import React, { createContext, useContext, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
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
  const { user, role: globalRole } = useAuth();
  const [event, setEvent] = useState<AppEvent | null>(null);
  const [currentEventId, setInternalEventId] = useState<string>(DEFAULT_EVENT_ID);
  const [userRole, setUserRole] = useState<EventRole | null>(null);
  const [loading, setLoading] = useState(true);
  const [resolvedSlug, setResolvedSlug] = useState<string | null>(null);

  const eventSlug = params?.eventSlug as string;

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
          setLoading(false);
        }
        return;
      }

      setLoading(true);
      setInternalEventId(DEFAULT_EVENT_ID);
      setEvent(null);
      setUserRole(null);

      try {
        const resolved = await fetchEventBySlug(eventSlug, {
          uid: user?.uid,
          isOwner: globalRole === 'owner'
        });
        
        if (isMounted) {
          if (resolved) {
            setEvent(resolved);
            setInternalEventId(resolved.id);

            // Résolution du rôle local si l'utilisateur est connecté
            if (user) {
              const memberDoc = await getDoc(doc(db, `events/${resolved.id}/members`, user.uid));
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
          setResolvedSlug(eventSlug);
          setLoading(false);
        }
      } catch (error) {
        if (isMounted) {
          setInternalEventId(DEFAULT_EVENT_ID);
          setEvent(null);
          setResolvedSlug(eventSlug);
          setLoading(false);
        }
      }
    }

    resolveEvent();

    return () => {
      isMounted = false;
    };
  }, [eventSlug, user, globalRole]);

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
