'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/hooks/use-auth-user';
import { useEvent } from '@/providers/event-provider';
import { fetchUserEvents } from '@/lib/data';
import type { AppEvent } from '@/lib/types';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useRouter, useParams } from 'next/navigation';
import { Calendar } from 'lucide-react';

export function EventSwitcher() {
  const { user } = useAuth();
  const { eventId } = useEvent();
  const [events, setEvents] = useState<AppEvent[]>([]);
  const router = useRouter();
  const params = useParams();

  useEffect(() => {
    if (user) {
      fetchUserEvents(user.uid)
        .then(setEvents)
        .catch(() => {
          // On ignore l'erreur ici (ex: index manquant)
          // La page "Mes Événements" se chargera d'afficher l'alerte détaillée
          setEvents([]);
        });
    }
  }, [user]);

  // Ne rien afficher si pas d'événements (ou utilisateur non connecté)
  if (!user || events.length === 0) return null;

  const currentSlug = params?.eventSlug as string || 'default';

  return (
    <div className="flex items-center gap-2 mr-2">
      <Select 
        value={currentSlug} 
        onValueChange={(slug) => {
          if (slug === 'default') router.push('/dashboard');
          else router.push(`/${slug}/dashboard`);
        }}
      >
        <SelectTrigger className="w-[140px] sm:w-[200px] h-9 text-xs font-bold rounded-2xl bg-muted/50 border-none hover:bg-muted transition-colors">
          <Calendar className="h-3.5 w-3.5 mr-2 text-primary" />
          <SelectValue placeholder="Mes événements" />
        </SelectTrigger>
        <SelectContent>
           <SelectItem value="default" className="text-xs">🌍 Mode Global</SelectItem>
          {events.map((e) => (
            <SelectItem key={e.id} value={e.slug} className="text-xs">
              {e.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
