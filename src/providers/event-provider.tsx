'use client';

import React, { createContext, useContext, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { fetchEventBySlug, DEFAULT_EVENT_ID } from '@/lib/data';
import type { AppEvent } from '@/lib/types';

interface EventContextType {
  event: AppEvent | null;
  eventId: string;
  loading: boolean;
}

const EventContext = createContext<EventContextType>({
  event: null,
  eventId: DEFAULT_EVENT_ID,
  loading: true,
});

export function EventProvider({ children }: { children: React.ReactNode }) {
  const params = useParams();
  const [event, setEvent] = useState<AppEvent | null>(null);
  const [currentEventId, setInternalEventId] = useState<string>(DEFAULT_EVENT_ID);
  const [loading, setLoading] = useState(true);
  const [resolvedSlug, setResolvedSlug] = useState<string | null>(null);

  const eventSlug = params?.eventSlug as string;

  // Détection immédiate de changement de route
  const isTransitioning = eventSlug !== (resolvedSlug === 'global' ? undefined : resolvedSlug);

  useEffect(() => {
    let isMounted = true;

    async function resolveEvent() {
      // Si on est sur une route globale (/dashboard, /admin, etc.)
      if (!eventSlug || ['dashboard', 'admin', 'login', 'signup', 'access-pending'].includes(eventSlug)) {
        if (isMounted) {
          setEvent(null);
          setInternalEventId(DEFAULT_EVENT_ID);
          setResolvedSlug('global');
          setLoading(false);
        }
        return;
      }

      setLoading(true);
      setInternalEventId(DEFAULT_EVENT_ID);
      setEvent(null);

      try {
        const resolved = await fetchEventBySlug(eventSlug);
        
        if (isMounted) {
          if (resolved) {
            setEvent(resolved);
            setInternalEventId(resolved.id);
          } else {
            // Slug invalide ou événement introuvable
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
  }, [eventSlug]);

  return (
    <EventContext.Provider value={{ 
      event, 
      eventId: currentEventId, 
      loading: loading || isTransitioning 
    }}>
      {children}
    </EventContext.Provider>
  );
}

export const useEvent = () => useContext(EventContext);
