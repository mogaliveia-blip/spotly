'use client';

import React, { createContext, useContext, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { fetchEventBySlug, setCurrentEventId } from '@/lib/data';
import type { AppEvent } from '@/lib/types';

interface EventContextType {
  event: AppEvent | null;
  eventId: string;
  loading: boolean;
}

const EventContext = createContext<EventContextType>({
  event: null,
  eventId: 'default-event',
  loading: true,
});

export function EventProvider({ children }: { children: React.ReactNode }) {
  const params = useParams();
  const [event, setEvent] = useState<AppEvent | null>(null);
  const [currentEventId, setInternalEventId] = useState<string>('default-event');
  const [loading, setLoading] = useState(true);
  const [resolvedSlug, setResolvedSlug] = useState<string | null>(null);

  const eventSlug = params?.eventSlug as string;

  // ✅ Correction de la détection de transition :
  // On est en transition si le slug de l'URL ne correspond pas au slug actuellement résolu dans le state.
  // Cela couvre l'entrée dans un event, le changement d'event, et le retour au mode global (undefined).
  const isTransitioning = eventSlug !== (resolvedSlug === 'global' ? undefined : resolvedSlug);

  useEffect(() => {
    let isMounted = true;

    async function resolveEvent() {
      setLoading(true);
    
      // Reset immédiat pour éviter toute fuite de l'ancien event
      setInternalEventId('default-event');
      setCurrentEventId('default-event');
      setEvent(null);
    
      // Cas route globale (sans événement)
      if (!eventSlug || eventSlug === 'dashboard' || eventSlug === 'admin') {
        if (isMounted) {
          console.log("[EventProvider] Mode Global détecté (pas de slug)");
          setResolvedSlug('global');
          setLoading(false);
        }
        return;
      }

      try {
        console.log(`[EventProvider] Tentative de résolution du slug: ${eventSlug}`);
        const resolved = await fetchEventBySlug(eventSlug);
        
        if (isMounted) {
          if (resolved) {
            console.log(`[EventProvider] Événement résolu: ${resolved.id} (${resolved.name})`);
            setEvent(resolved);
            setInternalEventId(resolved.id);
            setCurrentEventId(resolved.id);
          } else {
            console.warn(`[EventProvider] Aucun événement pour le slug: ${eventSlug}`);
            setInternalEventId('default-event');
            setCurrentEventId('default-event');
            setEvent(null);
          }
          setResolvedSlug(eventSlug);
          setLoading(false);
        }
      } catch (error) {
        console.error("[EventProvider] Erreur résolution:", error);
        if (isMounted) {
          setInternalEventId('default-event');
          setCurrentEventId('default-event');
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
