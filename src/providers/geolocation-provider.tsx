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
    if (typeof navigator === 'undefined' || !('geolocation' in navigator)) {
      console.error("La géolocalisation n'est pas prise en charge par ce navigateur.");
      setState(prevState => ({ ...prevState, loading: false }));
      return;
    }

    const onSuccess = (position: GeolocationPosition) => {
      setState({
        userLocation: {
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        },
        loading: false, // The initial loading is done
        error: null,
      });
    };

    const onError = (error: GeolocationPositionError) => {
      let errorMessage = "Une erreur de géolocalisation est survenue.";
      switch(error.code) {
        case error.PERMISSION_DENIED:
          errorMessage = "La permission de géolocalisation a été refusée.";
          break;
        case error.POSITION_UNAVAILABLE:
          errorMessage = "L'information de localisation n'est pas disponible.";
          break;
        case error.TIMEOUT:
          errorMessage = "La demande de géolocalisation a expiré.";
          break;
        default:
          errorMessage = `Une erreur inconnue est survenue (code: ${error.code}).`;
          break;
      }
      console.error("Erreur de géolocalisation:", errorMessage, error.message);
      setState(prevState => ({
        ...prevState,
        loading: false,
        error: error,
      }));
    };

    // Use watchPosition to get real-time updates
    const watchId = navigator.geolocation.watchPosition(onSuccess, onError, {
      enableHighAccuracy: true,
      timeout: 10000,
      maximumAge: 0, // We want the most recent position
    });

    // Cleanup function to clear the watcher when the component unmounts
    return () => {
      navigator.geolocation.clearWatch(watchId);
    };
  }, []); // The empty dependency array is correct: the effect runs once to set up the watcher.

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
