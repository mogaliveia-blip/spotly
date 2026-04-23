'use client';

import React, { createContext, useContext, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { fetchEventBySlug, setCurrentEventId } from '@/lib/data';
import type { AppEvent } from '@/lib/types';

interface EventContextType {
  event: AppEvent | null;
  loading: boolean;
}

const EventContext = createContext<EventContextType>({
  event: null,
  loading: true,
});

export function EventProvider({ children }: { children: React.ReactNode }) {
  const params = useParams();
  const [event, setEvent] = useState<AppEvent | null>(null);
  const [loading, setLoading] = useState(true);

  // Le slug peut venir d'un paramètre de route dynamique [eventSlug]
  const eventSlug = params?.eventSlug as string;

  useEffect(() => {
    async function resolveEvent() {
      setLoading(true);
      if (eventSlug && eventSlug !== 'dashboard' && eventSlug !== 'admin') {
        try {
          const resolved = await fetchEventBySlug(eventSlug);
          if (resolved) {
            setEvent(resolved);
            setCurrentEventId(resolved.id);
          } else {
            // Fallback si slug invalide ou non trouvé
            setCurrentEventId('default-event');
          }
        } catch (error) {
          console.error("Erreur lors de la résolution de l'événement:", error);
          setCurrentEventId('default-event');
        }
      } else {
        // Mode par défaut (rétrocompatibilité ou URL racine)
        setCurrentEventId('default-event');
        setEvent(null);
      }
      setLoading(false);
    }

    resolveEvent();
  }, [eventSlug]);

  return (
    <EventContext.Provider value={{ event, loading }}>
      {children}
    </EventContext.Provider>
  );
}

export const useEvent = () => useContext(EventContext);
