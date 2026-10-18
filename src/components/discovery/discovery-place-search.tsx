'use client';

import { useEffect, useRef, useState } from 'react';
import { useMapsLibrary } from '@vis.gl/react-google-maps';
import { useToast } from '@/hooks/use-toast';
import { isDiscoveryPosition } from '@/lib/event-discovery';
import { DiscoveryPlaceInput } from '@/lib/discovery-place-input';

type LatLngLiteral = { lat: number; lng: number };
type AutocompleteWithValue = google.maps.places.PlaceAutocompleteElement & { value: string; placeholder?: string };
type PlaceSelectEvent = Event & { placePrediction?: google.maps.places.PlacePrediction | null };

function coordinates(location: google.maps.LatLng | google.maps.LatLngLiteral): LatLngLiteral {
  return {
    lat: typeof location.lat === 'number' ? location.lat : location.lat(),
    lng: typeof location.lng === 'number' ? location.lng : location.lng(),
  };
}

export function DiscoveryPlaceSearch({ locationBias, onPlaceSelected }: {
  locationBias: LatLngLiteral | null;
  onPlaceSelected: (location: LatLngLiteral, label: string) => void;
}) {
  const placesLibrary = useMapsLibrary('places');
  const autocompleteRef = useRef<AutocompleteWithValue | null>(null);
  const inputStateRef = useRef(new DiscoveryPlaceInput());
  const [needsSelection, setNeedsSelection] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    const autocomplete = autocompleteRef.current;
    if (!autocomplete || !placesLibrary) return;
    autocomplete.locationBias = locationBias;
    autocomplete.requestedLanguage = 'fr';
    autocomplete.placeholder = 'Rechercher une adresse ou un lieu...';
  }, [locationBias, placesLibrary]);

  useEffect(() => {
    const autocomplete = autocompleteRef.current;
    if (!autocomplete || !placesLibrary) return;

    let firstInputAfterFocus = true;
    let scrollCorrectionFrame: number | null = null;
    const armMobileScrollCorrection = () => { firstInputAfterFocus = true; };

    const updateDraft = () => {
      inputStateRef.current.input(autocomplete.value);
      setNeedsSelection(inputStateRef.current.needsSelection);
      if (!firstInputAfterFocus || !autocomplete.value.trim()) return;
      firstInputAfterFocus = false;
      if (!window.matchMedia('(max-width: 1023px)').matches) return;

      scrollCorrectionFrame = requestAnimationFrame(() => {
        const viewport = window.visualViewport;
        // Correct the measured iOS page shift once as the widget opens its mobile UI.
        if (autocomplete.isConnected && viewport && viewport.scale === 1 &&
          viewport.height < window.innerHeight && viewport.offsetTop > 0 && window.scrollY > 0) {
          window.scrollTo(window.scrollX, 0);
        }
      });
    };

    const handlePlaceSelect = async (event: Event) => {
      const selectedText = autocomplete.value;
      const revision = inputStateRef.current.beginSelection(selectedText);
      setNeedsSelection(inputStateRef.current.needsSelection);
      const prediction = (event as PlaceSelectEvent).placePrediction;
      if (!prediction) {
        toast({ title: 'Lieu introuvable', description: 'Sélectionnez un lieu dans les suggestions.', variant: 'destructive' });
        return;
      }

      try {
        const place = prediction.toPlace();
        await place.fetchFields({ fields: ['location'] });
        // A new keystroke or selection makes this asynchronous Google response obsolete.
        if (!inputStateRef.current.isCurrent(revision, autocomplete.value) || autocomplete.value !== selectedText) return;
        const location = place.location && coordinates(place.location);
        if (!location || !isDiscoveryPosition(location)) {
          toast({ title: 'Position indisponible', description: 'Ce résultat ne contient pas de coordonnées exploitables.', variant: 'destructive' });
          return;
        }
        if (!inputStateRef.current.validate(revision, selectedText)) return;
        setNeedsSelection(false);
        // Let the public widget release focus before the mobile accordion closes.
        if (window.matchMedia('(max-width: 1023px)').matches) autocomplete.blur();
        onPlaceSelected(location, prediction.mainText?.text?.trim() || prediction.text?.text?.trim() || selectedText.trim());
      } catch (error) {
        if (!inputStateRef.current.isCurrent(revision, autocomplete.value) || autocomplete.value !== selectedText) return;
        console.error('[DiscoveryPlaceSearch] Places selection failed', error);
        toast({ title: 'Recherche indisponible', description: 'La dernière zone validée reste affichée.', variant: 'destructive' });
      }
    };

    const handlePlaceError = () => {
      inputStateRef.current.invalidate();
      updateDraft();
      toast({ title: 'Recherche indisponible', description: 'La dernière zone validée reste affichée.', variant: 'destructive' });
    };

    autocomplete.addEventListener('focusin', armMobileScrollCorrection);
    autocomplete.addEventListener('input', updateDraft);
    autocomplete.addEventListener('gmp-select', handlePlaceSelect);
    autocomplete.addEventListener('gmp-error', handlePlaceError);
    return () => {
      if (scrollCorrectionFrame !== null) cancelAnimationFrame(scrollCorrectionFrame);
      autocomplete.removeEventListener('focusin', armMobileScrollCorrection);
      autocomplete.removeEventListener('input', updateDraft);
      autocomplete.removeEventListener('gmp-select', handlePlaceSelect);
      autocomplete.removeEventListener('gmp-error', handlePlaceError);
    };
  }, [onPlaceSelected, placesLibrary, toast]);

  if (!placesLibrary) {
    return <div className="flex min-h-11 w-full items-center rounded-xl border border-input bg-background px-3 text-sm text-muted-foreground">
      Chargement de la recherche...
    </div>;
  }

  return <>
    <gmp-place-autocomplete ref={autocompleteRef} className="block w-full" requested-language="fr" />
    {needsSelection && <p role="status" className="mt-2 text-xs text-muted-foreground">Sélectionnez une commune dans les suggestions.</p>}
  </>;
}
