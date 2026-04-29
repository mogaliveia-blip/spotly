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

  // Le slug vient du paramètre de route dynamique [eventSlug]
  const eventSlug = params?.eventSlug as string;

  // Détection immédiate du changement de slug pour forcer l'état de chargement
  // même avant que le useEffect ne se déclenche (évite le "leak" de données anciennes)
  const isTransitioning = eventSlug && eventSlug !== resolvedSlug;

  useEffect(() => {
    let isMounted = true;

    async function resolveEvent() {
      // Passage immédiat en mode loading
      setLoading(true);
    
      // Reset immédiat pour éviter toute fuite de l'ancien event
      setInternalEventId('default-event');
      setCurrentEventId('default-event');
      setEvent(null);
    
      // Cas route globale (sans événement)
      if (!eventSlug || eventSlug === 'dashboard' || eventSlug === 'admin') {
        if (isMounted) {
          setResolvedSlug(eventSlug || 'global');
          setLoading(false);
        }
        return;
      }

      try {
        console.log(`[EventProvider] Tentative de résolution du slug: ${eventSlug}`);
        const resolved = await fetchEventBySlug(eventSlug);
        
        if (isMounted) {
          if (resolved) {
            console.log(`[EventProvider] Événement résolu avec succès:`, {
              id: resolved.id,
              slug: resolved.slug,
              name: resolved.name
            });
            setEvent(resolved);
            setInternalEventId(resolved.id);
            setCurrentEventId(resolved.id);
          } else {
            console.warn(`[EventProvider] Aucun événement trouvé pour le slug: ${eventSlug}`);
            setInternalEventId('default-event');
            setCurrentEventId('default-event');
            setEvent(null);
          }
          setResolvedSlug(eventSlug);
          setLoading(false);
        }
      } catch (error) {
        console.error("[EventProvider] Erreur lors de la résolution de l'événement:", error);
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
