
'use client';

import {
  createContext,
  useState,
  useEffect,
  useContext,
  ReactNode,
  useRef,
  useCallback,
} from 'react';
import { createSharedGeolocationRequest } from '@/lib/geolocation-request';

type Location = { lat: number; lng: number };

interface GeolocationContextType {
  userLocation: Location | null;
  loading: boolean;
  error: GeolocationPositionError | null;
  requestPosition: () => Promise<Location>;
}

const GeolocationContext = createContext<GeolocationContextType>({
  userLocation: null,
  loading: true,
  error: null,
  requestPosition: async () => { throw new Error('GeolocationProvider is missing'); },
});

export const GeolocationProvider = ({ children }: { children: ReactNode }) => {
  const [state, setState] = useState<Omit<GeolocationContextType, 'requestPosition'>>({
    userLocation: null,
    loading: true,
    error: null,
  });

  const watchIdRef = useRef<number | null>(null);
  const hasLoggedErrorRef = useRef(false);
  const mountedRef = useRef(false);
  const requesterRef = useRef<ReturnType<typeof createSharedGeolocationRequest> | null>(null);

  const updateLocation = useCallback((position: GeolocationPosition) => {
    if (!mountedRef.current) return;
    setState({
      userLocation: { lat: position.coords.latitude, lng: position.coords.longitude },
      loading: false,
      error: null,
    });
  }, []);

  const handleError = useCallback((error: GeolocationPositionError) => {
    if (!mountedRef.current) return;
    if (!hasLoggedErrorRef.current && error.code !== 3) {
      console.warn('[Geolocation]', error.code, error.message);
      hasLoggedErrorRef.current = true;
    }
    setState(prev => ({ ...prev, loading: false, error }));
  }, []);

  const requestPosition = useCallback(async (): Promise<Location> => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      throw new Error('Geolocation unavailable');
    }
    requesterRef.current ??= createSharedGeolocationRequest(navigator.geolocation, updateLocation, handleError);
    const position = await requesterRef.current();
    return { lat: position.coords.latitude, lng: position.coords.longitude };
  }, [updateLocation, handleError]);

  useEffect(() => {
    mountedRef.current = true;
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setState(prev => ({ ...prev, loading: false }));
      return;
    }

    const startWatching = () => {
      const requester = requesterRef.current ??= createSharedGeolocationRequest(navigator.geolocation, updateLocation, handleError);
      requester.setWatching(true);
      // Configuration équilibrée : précision élevée pour le suivi
      watchIdRef.current = navigator.geolocation.watchPosition(
        requester.watchPosition,
        requester.watchError,
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
          if (!mountedRef.current) return;
    
          if (permission.state === 'denied') {
            requesterRef.current ??= createSharedGeolocationRequest(navigator.geolocation, updateLocation, handleError);
            requesterRef.current.setWatching(false);
            setState(prev => ({ 
              ...prev, 
              loading: false, 
              error: { code: 1, message: "Permission denied" } as GeolocationPositionError 
            }));
            return;
          }
        }
    
        // The position watch can satisfy the same initial request before the quick fix returns.
        startWatching();
        void requestPosition().catch(() => {});
        
        // 🔥 IMPORTANT : ne jamais bloquer l'UI si le GPS est lent
        setState(prev => ({
          ...prev,
          loading: false
        }));

      } catch {
        requesterRef.current ??= createSharedGeolocationRequest(navigator.geolocation, updateLocation, handleError);
        requesterRef.current.setWatching(false);
        setState(prev => ({ ...prev, loading: false }));
      }
    };
    
    init();

    return () => {
      mountedRef.current = false;
      requesterRef.current?.setWatching(false);
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
      }
    };
  }, [requestPosition, updateLocation, handleError]);

  return (
    <GeolocationContext.Provider value={{ ...state, requestPosition }}>
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
