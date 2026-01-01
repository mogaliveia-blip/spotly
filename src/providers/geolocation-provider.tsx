'use client';

import { createContext, useState, useEffect, useContext, ReactNode } from 'react';

interface GeolocationContextType {
  userLocation: { lat: number; lng: number } | null;
  loading: boolean;
  error: GeolocationPositionError | null;
}

const GeolocationContext = createContext<GeolocationContextType>({
  userLocation: null,
  loading: true,
  error: null,
});

export const GeolocationProvider = ({ children }: { children: ReactNode }) => {
  const [state, setState] = useState<GeolocationContextType>({
    userLocation: null,
    loading: true,
    error: null,
  });

  useEffect(() => {
    if (typeof navigator !== 'undefined' && 'geolocation' in navigator) {
      const onSuccess = (position: GeolocationPosition) => {
        setState({
          userLocation: {
            lat: position.coords.latitude,
            lng: position.coords.longitude,
          },
          loading: false,
          error: null,
        });
      };

      const onError = (error: GeolocationPositionError) => {
        console.error("Erreur de géolocalisation:", error.message);
        setState({
          userLocation: null,
          loading: false,
          error: error,
        });
      };

      navigator.geolocation.getCurrentPosition(onSuccess, onError, {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 60000, // Cache position for 1 minute
      });
    } else {
      console.error("La géolocalisation n'est pas prise en charge par ce navigateur.");
      setState(prevState => ({ ...prevState, loading: false }));
    }
  }, []);

  return (
    <GeolocationContext.Provider value={state}>
      {children}
    </GeolocationContext.Provider>
  );
};

export const useGeolocation = () => {
  const context = useContext(GeolocationContext);
  if (context === undefined) {
    throw new Error('useGeolocation must be used within a GeolocationProvider');
  }
  return context;
};
