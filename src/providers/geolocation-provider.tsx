
'use client';

import {
  createContext,
  useState,
  useEffect,
  useContext,
  ReactNode,
  useRef,
} from 'react';

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

  const watchIdRef = useRef<number | null>(null);
  const hasLoggedErrorRef = useRef(false);

  useEffect(() => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setState(prev => ({ ...prev, loading: false }));
      return;
    }

    let isMounted = true;

    const updateLocation = (position: GeolocationPosition) => {
      if (!isMounted) return;

      setState({
        userLocation: {
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        },
        loading: false,
        error: null,
      });
    };

    const handleError = (error: GeolocationPositionError) => {
      if (!isMounted) return;

      // On ne log en console que les erreurs réelles, pas les timeouts fréquents
      if (!hasLoggedErrorRef.current && error.code !== 3) {
        console.warn(
          '[Geolocation]',
          error.code,
          error.message
        );
        hasLoggedErrorRef.current = true;
      }

      setState(prev => ({
        ...prev,
        loading: false,
        error,
      }));
    };

    const startWatching = () => {
      // Configuration équilibrée : Précision élevée mais tolérance sur le cache pour la batterie
      watchIdRef.current = navigator.geolocation.watchPosition(
        updateLocation,
        handleError,
        {
          enableHighAccuracy: true,
          timeout: 10000,
          maximumAge: 10000, // 10 secondes de cache pour économiser la batterie
        }
      );
    };

    const init = async () => {
      try {
        if ('permissions' in navigator) {
          const permission = await navigator.permissions.query({
            name: 'geolocation',
          } as PermissionDescriptor);

          if (permission.state === 'denied') {
            setState(prev => ({ 
              ...prev, 
              loading: false, 
              error: { code: 1, message: "Permission denied" } as GeolocationPositionError 
            }));
            return;
          }
        }

        // Position initiale rapide
        navigator.geolocation.getCurrentPosition(
          updateLocation,
          handleError,
          { enableHighAccuracy: true, timeout: 5000 }
        );

        startWatching();
      } catch {
        setState(prev => ({ ...prev, loading: false }));
      }
    };

    init();

    return () => {
      isMounted = false;
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
      }
    };
  }, []);

  return (
    <GeolocationContext.Provider value={state}>
      {children}
    </GeolocationContext.Provider>
  );
};

export const useGeolocation = () => {
  const context = useContext(GeolocationContext);
  if (!context) {
    throw new Error('useGeolocation must be used within GeolocationProvider');
  }
  return context;
};
