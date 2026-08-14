'use client';

import type { User as FirebaseUser } from 'firebase/auth';
import { onAuthStateChanged } from 'firebase/auth';
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
  const authRequestIdRef = useRef(0);

  const isPublicEventDashboard = /^\/[^/]+\/dashboard(?:\/)?$/.test(pathname || '');

  useEffect(() => {
    const publicTimeoutId = window.setTimeout(() => {
      if (!isPublicEventDashboard) return;
      setAuthTimedOut(true);
      setAuthStateKnown(true);
      setLoading(false);
    }, PUBLIC_AUTH_TIMEOUT_MS);

    const loadUserProfile = async (currentUser: FirebaseUser, requestId: number) => {
      setProfileLoading(true);
      try {
        const userDocRef = doc(db, 'users', currentUser.uid);
        const userDoc = await getDoc(userDocRef);
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
        console.error('[Auth] profile fetch failed', {
          operation: 'fetchCurrentUserProfile',
          path: 'users/{uid}',
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

      if (currentUser) {
        const anonymousUser: AppUser = {
          uid: currentUser.uid,
          email: currentUser.email,
          displayName: currentUser.displayName,
          photoURL: currentUser.photoURL,
          role: 'user',
          isApproved: false,
          emailVerified: currentUser.emailVerified,
        };
        setUser({
          ...anonymousUser,
        });
        if (currentUser.isAnonymous) {
          setRole('user');
          setIsApproved(false);
          setProfileLoading(false);
          return;
        }
        void loadUserProfile(currentUser, requestId);
      } else {
        setFirebaseUser(null);
        setUser(null);
        setRole(null);
        setIsApproved(false);
        setProfileLoading(false);
      }
    });

    return () => {
      window.clearTimeout(publicTimeoutId);
      unsubscribeAuthState();
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
