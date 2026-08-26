'use client';

import { useEffect, useRef } from 'react';
import { useMapsLibrary } from '@vis.gl/react-google-maps';

import { useToast } from '@/hooks/use-toast';

type LatLngLiteral = {
  lat: number;
  lng: number;
};

type PlaceSelectEvent = Event & {
  placePrediction?: google.maps.places.PlacePrediction | null;
};

interface PoiLocationSearchProps {
  locationBias?: LatLngLiteral | null;
  onPlaceSelected: (location: LatLngLiteral) => void;
}

function getLatLngLiteral(location: google.maps.LatLng | google.maps.LatLngLiteral): LatLngLiteral {
  const lat = location.lat;
  const lng = location.lng;

  if (typeof lat === 'number' && typeof lng === 'number') {
    return {
      lat,
      lng,
    };
  }

  return {
    lat: (lat as () => number)(),
    lng: (lng as () => number)(),
  };
}

export function PoiLocationSearch({ locationBias, onPlaceSelected }: PoiLocationSearchProps) {
  const placesLibrary = useMapsLibrary('places');
  const autocompleteRef = useRef<google.maps.places.PlaceAutocompleteElement | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    const autocomplete = autocompleteRef.current;
    if (!autocomplete || !placesLibrary) return;

    autocomplete.locationBias = locationBias ?? null;
    autocomplete.requestedLanguage = 'fr';
    (autocomplete as google.maps.places.PlaceAutocompleteElement & { placeholder?: string }).placeholder = 'Rechercher une adresse ou un lieu...';
  }, [locationBias, placesLibrary]);

  useEffect(() => {
    const autocomplete = autocompleteRef.current;
    if (!autocomplete || !placesLibrary) return;

    const handlePlaceSelect = async (event: Event) => {
      const placePrediction = (event as PlaceSelectEvent).placePrediction;
      if (!placePrediction) {
        toast({
          title: 'Lieu introuvable',
          description: "Aucun lieu Google valide n'a ete selectionne.",
          variant: 'destructive',
        });
        return;
      }

      try {
        const place = placePrediction.toPlace();
        await place.fetchFields({ fields: ['location'] });

        if (!place.location) {
          toast({
            title: 'Position indisponible',
            description: "Ce resultat ne contient pas de coordonnees exploitables.",
            variant: 'destructive',
          });
          return;
        }

        onPlaceSelected(getLatLngLiteral(place.location));
      } catch (error) {
        console.error('[PoiLocationSearch] Places selection failed', error);
        toast({
          title: 'Recherche indisponible',
          description: 'La carte reste utilisable pour placer le marqueur manuellement.',
          variant: 'destructive',
        });
      }
    };

    const handlePlaceError = () => {
      toast({
        title: 'Recherche indisponible',
        description: 'La carte reste utilisable pour placer le marqueur manuellement.',
        variant: 'destructive',
      });
    };

    autocomplete.addEventListener('gmp-select', handlePlaceSelect);
    autocomplete.addEventListener('gmp-error', handlePlaceError);

    return () => {
      autocomplete.removeEventListener('gmp-select', handlePlaceSelect);
      autocomplete.removeEventListener('gmp-error', handlePlaceError);
    };
  }, [onPlaceSelected, placesLibrary, toast]);

  if (!placesLibrary) {
    return (
      <div className="flex min-h-11 w-full items-center rounded-xl border border-input bg-background px-3 text-sm text-muted-foreground">
        Chargement de la recherche...
      </div>
    );
  }

  return (
    <gmp-place-autocomplete
      ref={autocompleteRef}
      className="block w-full"
      requested-language="fr"
    />
  );
}
