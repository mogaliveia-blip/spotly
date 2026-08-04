'use client';

import type { User as FirebaseUser } from 'firebase/auth';
import { onIdTokenChanged } from 'firebase/auth';
import { createContext, useEffect, useState, useContext, ReactNode } from 'react';
import { auth, db } from '@/lib/firebase';
import type { AppUser, UserRole } from '@/lib/types';
import FirebaseErrorListener from '@/components/FirebaseErrorListener';
import { doc, getDoc } from 'firebase/firestore';

interface AuthContextType {
  user: AppUser | null;
  firebaseUser: FirebaseUser | null;
  loading: boolean;
  role: UserRole | null;
  isApproved: boolean;
}

export const AuthContext = createContext<AuthContextType>({
  user: null,
  firebaseUser: null,
  loading: true,
  role: null,
  isApproved: false,
});

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<AppUser | null>(null);
  const [firebaseUser, setFirebaseUser] = useState<FirebaseUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [role, setRole] = useState<UserRole | null>(null);
  const [isApproved, setIsApproved] = useState<boolean>(false);

  useEffect(() => {
    const startedAt = performance.now();
    console.time('[Perf] auth')
    let hasEndedAuthTimer = false;
    const finishAuthTimer = () => {
      if (hasEndedAuthTimer) return;
      hasEndedAuthTimer = true;
      console.timeEnd('[Perf] auth')
    };

    const unsubscribe = onIdTokenChanged(auth, async (firebaseUser) => {
      setLoading(true);
      if (firebaseUser) {
        setFirebaseUser(firebaseUser);
        
        // Fetch user metadata from Firestore
        const userDocStartedAt = performance.now();
        const userDocRef = doc(db, 'users', firebaseUser.uid);
        const userDoc = await getDoc(userDocRef);
        console.info('[Perf] auth-user-doc', {
          durationMs: Math.round(performance.now() - userDocStartedAt),
          uid: firebaseUser.uid,
          docsRead: userDoc.exists() ? 1 : 0,
        });
        const userData = userDoc.data();
        
        const userRole = (userData?.role as UserRole) || 'user';
        const approved = userData?.isApproved ?? false;
        const displayName = userData?.displayName || firebaseUser.displayName;

        const appUser: AppUser = {
          uid: firebaseUser.uid,
          email: firebaseUser.email,
          displayName,
          photoURL: firebaseUser.photoURL,
          role: userRole,
          isApproved: approved,
          emailVerified: firebaseUser.emailVerified,
        };
        setUser(appUser);
        setRole(userRole);
        setIsApproved(approved);
      } else {
        setFirebaseUser(null);
        setUser(null);
        setRole(null);
        setIsApproved(false);
      }
      setLoading(false);
      console.info('[Perf] auth-ready', {
        durationMs: Math.round(performance.now() - startedAt),
        isAuthenticated: !!firebaseUser,
        uid: firebaseUser?.uid ?? null,
      });
      finishAuthTimer()
    });

    return () => unsubscribe();
  }, []);

  const value = { user, firebaseUser, loading, role, isApproved };
  
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
