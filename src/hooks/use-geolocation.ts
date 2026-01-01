// src/hooks/use-geolocation.ts
'use client';

import { useState, useEffect } from 'react';

interface GeolocationState {
  coordinates: { lat: number; lng: number } | null;
  loading: boolean;
  error: GeolocationPositionError | null;
}

export function useGeolocation(): GeolocationState {
  const [state, setState] = useState<GeolocationState>({
    coordinates: null,
    loading: true,
    error: null,
  });

  useEffect(() => {
    if (!navigator.geolocation) {
      console.error("La géolocalisation n'est pas prise en charge par votre navigateur.");
      setState(prevState => ({ ...prevState, loading: false }));
      return;
    }

    const onSuccess = (position: GeolocationPosition) => {
      setState({
        coordinates: {
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        },
        loading: false,
        error: null,
      });
    };

    const onError = (error: GeolocationPositionError) => {
      setState({
        coordinates: null,
        loading: false,
        error: error,
      });
    };

    navigator.geolocation.getCurrentPosition(onSuccess, onError, {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 0
    });

  }, []);

  return state;
}
