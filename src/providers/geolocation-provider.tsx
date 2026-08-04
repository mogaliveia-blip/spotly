
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
    const startedAt = performance.now();
    console.time('[Perf] geolocation')
    let hasEndedGeolocationTimer = false;
    const finishGeolocationTimer = () => {
      if (hasEndedGeolocationTimer) return;
      hasEndedGeolocationTimer = true;
      console.timeEnd('[Perf] geolocation')
    };

    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setState(prev => ({ ...prev, loading: false }));
      console.info('[Perf] geolocation-ready', {
        durationMs: Math.round(performance.now() - startedAt),
        source: 'unsupported',
        hasLocation: false,
      });
      finishGeolocationTimer()
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
      console.info('[Perf] geolocation-ready', {
        durationMs: Math.round(performance.now() - startedAt),
        source: 'position',
        accuracy: position.coords.accuracy,
        hasLocation: true,
      });
      finishGeolocationTimer()
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
      console.info('[Perf] geolocation-ready', {
        durationMs: Math.round(performance.now() - startedAt),
        source: 'error',
        code: error.code,
        hasLocation: false,
      });
      finishGeolocationTimer()
    };

    const startWatching = () => {
      // Configuration équilibrée : précision élevée pour le suivi
      watchIdRef.current = navigator.geolocation.watchPosition(
        updateLocation,
        handleError,
        {
          enableHighAccuracy: true,
          timeout: 10000,
          maximumAge: 10000, // cache 10s pour économiser la batterie
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
            console.info('[Perf] geolocation-ready', {
              durationMs: Math.round(performance.now() - startedAt),
              source: 'permission-denied',
              hasLocation: false,
            });
            finishGeolocationTimer()
            return;
          }
        }
    
        // ⚡ Position initiale rapide (réseau / wifi)
        navigator.geolocation.getCurrentPosition(
          updateLocation,
          handleError,
          {
            enableHighAccuracy: false, // IMPORTANT : beaucoup plus rapide
            timeout: 5000,
            maximumAge: 30000          // accepte une position récente
          }
        );
        
        // 🔥 IMPORTANT : ne jamais bloquer l'UI si le GPS est lent
        setState(prev => ({
          ...prev,
          loading: false
        }));
        console.info('[Perf] geolocation-nonblocking', {
          durationMs: Math.round(performance.now() - startedAt),
          source: 'ui-unblocked-before-position',
        });

        // ensuite suivi précis
        startWatching();
    
      } catch {
        setState(prev => ({ ...prev, loading: false }));
        console.info('[Perf] geolocation-ready', {
          durationMs: Math.round(performance.now() - startedAt),
          source: 'exception',
          hasLocation: false,
        });
        finishGeolocationTimer()
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
