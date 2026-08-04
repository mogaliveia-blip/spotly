'use client';

import type { User as FirebaseUser } from 'firebase/auth';
import { onAuthStateChanged, onIdTokenChanged } from 'firebase/auth';
import { createContext, useEffect, useRef, useState, useContext, ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import { auth, db } from '@/lib/firebase';
import type { AppUser, UserRole } from '@/lib/types';
import FirebaseErrorListener from '@/components/FirebaseErrorListener';
import { doc, getDoc } from 'firebase/firestore';

const PUBLIC_AUTH_TIMEOUT_MS = 2500;

interface AuthContextType {
  user: AppUser | null;
  firebaseUser: FirebaseUser | null;
  loading: boolean;
  authStateKnown: boolean;
  profileLoading: boolean;
  authTimedOut: boolean;
  role: UserRole | null;
  isApproved: boolean;
}

export const AuthContext = createContext<AuthContextType>({
  user: null,
  firebaseUser: null,
  loading: true,
  authStateKnown: false,
  profileLoading: false,
  authTimedOut: false,
  role: null,
  isApproved: false,
});

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const pathname = usePathname();
  const [user, setUser] = useState<AppUser | null>(null);
  const [firebaseUser, setFirebaseUser] = useState<FirebaseUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [authStateKnown, setAuthStateKnown] = useState(false);
  const [profileLoading, setProfileLoading] = useState(false);
  const [authTimedOut, setAuthTimedOut] = useState(false);
  const [role, setRole] = useState<UserRole | null>(null);
  const [isApproved, setIsApproved] = useState<boolean>(false);
  const authStartedAtRef = useRef<number | null>(null);
  const authRequestIdRef = useRef(0);

  const isPublicEventDashboard = /^\/[^/]+\/dashboard(?:\/)?$/.test(pathname || '');

  useEffect(() => {
    authStartedAtRef.current = performance.now();
    const startedAt = performance.now();
    console.info('[Perf] auth-sdk-init', {
      durationMs: 0,
      pathname,
      isPublicEventDashboard,
      hasCurrentUser: !!auth.currentUser,
      browser: typeof navigator !== 'undefined' ? navigator.userAgent : null,
    });
    console.time('[Perf] auth')
    let hasEndedAuthTimer = false;
    const finishAuthTimer = () => {
      if (hasEndedAuthTimer) return;
      hasEndedAuthTimer = true;
      console.timeEnd('[Perf] auth')
    };

    const publicTimeoutId = window.setTimeout(() => {
      if (!isPublicEventDashboard) return;
      setAuthTimedOut(true);
      setAuthStateKnown(true);
      setLoading(false);
      console.warn('[Perf] auth-context-ready', {
        durationMs: Math.round(performance.now() - startedAt),
        source: 'public-timeout-guest',
        timeoutMs: PUBLIC_AUTH_TIMEOUT_MS,
        uid: null,
        pathname,
      });
      finishAuthTimer();
    }, PUBLIC_AUTH_TIMEOUT_MS);

    const loadUserProfile = async (currentUser: FirebaseUser, requestId: number) => {
      setProfileLoading(true);
      try {
        const userDocStartedAt = performance.now();
        const userDocRef = doc(db, 'users', currentUser.uid);
        const userDoc = await getDoc(userDocRef);
        console.info('[Perf] auth-profile-fetch', {
          durationMs: Math.round(performance.now() - userDocStartedAt),
          uid: currentUser.uid,
          path: userDocRef.path,
          docsRead: userDoc.exists() ? 1 : 0,
          source: 'firestore',
        });
        if (requestId !== authRequestIdRef.current) return;

        const userData = userDoc.data();
        
        const userRole = (userData?.role as UserRole) || 'user';
        const approved = userData?.isApproved ?? false;
        const displayName = userData?.displayName || currentUser.displayName;

        const appUser: AppUser = {
          uid: currentUser.uid,
          email: currentUser.email,
          displayName,
          photoURL: currentUser.photoURL,
          role: userRole,
          isApproved: approved,
          emailVerified: currentUser.emailVerified,
        };
        setUser(appUser);
        setRole(userRole);
        setIsApproved(approved);
      } catch (error: any) {
        console.warn('[Perf] auth-profile-fetch', {
          durationMs: authStartedAtRef.current ? Math.round(performance.now() - authStartedAtRef.current) : null,
          uid: currentUser.uid,
          source: 'error',
          errorCode: error?.code ?? null,
          errorMessage: error?.message ?? null,
        });
      } finally {
        if (requestId === authRequestIdRef.current) setProfileLoading(false);
      }
    };

    const unsubscribeAuthState = onAuthStateChanged(auth, (currentUser) => {
      const requestId = ++authRequestIdRef.current;
      window.clearTimeout(publicTimeoutId);
      setAuthTimedOut(false);
      setAuthStateKnown(true);
      setLoading(false);
      setFirebaseUser(currentUser);
      console.info('[Perf] auth-listener-fired', {
        durationMs: Math.round(performance.now() - startedAt),
        listener: 'onAuthStateChanged',
        uid: currentUser?.uid ?? null,
        pathname,
      });
      console.info('[Perf] auth-current-user-known', {
        durationMs: Math.round(performance.now() - startedAt),
        uid: currentUser?.uid ?? null,
        source: 'onAuthStateChanged',
      });

      if (currentUser) {
        setUser({
          uid: currentUser.uid,
          email: currentUser.email,
          displayName: currentUser.displayName,
          photoURL: currentUser.photoURL,
          role: 'user',
          isApproved: false,
          emailVerified: currentUser.emailVerified,
        });
        void loadUserProfile(currentUser, requestId);
      } else {
        setFirebaseUser(null);
        setUser(null);
        setRole(null);
        setIsApproved(false);
        setProfileLoading(false);
      }

      console.info('[Perf] auth-context-ready', {
        durationMs: Math.round(performance.now() - startedAt),
        isAuthenticated: !!currentUser,
        uid: currentUser?.uid ?? null,
        profileBlocking: false,
      });
      finishAuthTimer()
    });

    const unsubscribeIdToken = onIdTokenChanged(auth, (currentUser) => {
      console.info('[Perf] auth-token-ready', {
        durationMs: Math.round(performance.now() - startedAt),
        listener: 'onIdTokenChanged',
        uid: currentUser?.uid ?? null,
      });
      console.info('[Perf] auth-ready', {
        durationMs: Math.round(performance.now() - startedAt),
        isAuthenticated: !!currentUser,
        uid: currentUser?.uid ?? null,
        source: 'token-listener',
      });
    });

    return () => {
      window.clearTimeout(publicTimeoutId);
      unsubscribeAuthState();
      unsubscribeIdToken();
    };
  }, [isPublicEventDashboard, pathname]);

  const value = { user, firebaseUser, loading, authStateKnown, profileLoading, authTimedOut, role, isApproved };
  
  return (
    <AuthContext.Provider value={value}>
        {children}
        <FirebaseErrorListener />
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
