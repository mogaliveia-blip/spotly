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

  // Le slug vient du paramètre de route dynamique [eventSlug]
  const eventSlug = params?.eventSlug as string;

  useEffect(() => {
    async function resolveEvent() {
      setLoading(true);
      if (eventSlug && eventSlug !== 'dashboard' && eventSlug !== 'admin') {
        try {
          const resolved = await fetchEventBySlug(eventSlug);
          if (resolved) {
            setEvent(resolved);
            setInternalEventId(resolved.id);
            setCurrentEventId(resolved.id);
          } else {
            // Fallback si slug invalide ou non trouvé
            setInternalEventId('default-event');
            setCurrentEventId('default-event');
            setEvent(null);
          }
        } catch (error) {
          console.error("Erreur lors de la résolution de l'événement:", error);
          setInternalEventId('default-event');
          setCurrentEventId('default-event');
          setEvent(null);
        }
      } else {
        // Mode par défaut (rétrocompatibilité ou URL racine)
        setInternalEventId('default-event');
        setCurrentEventId('default-event');
        setEvent(null);
      }
      setLoading(false);
    }

    resolveEvent();
  }, [eventSlug]);

  return (
    <EventContext.Provider value={{ event, eventId: currentEventId, loading }}>
      {children}
    </EventContext.Provider>
  );
}

export const useEvent = () => useContext(EventContext);
