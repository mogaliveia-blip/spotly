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
}

export const AuthContext = createContext<AuthContextType>({
  user: null,
  firebaseUser: null,
  loading: true,
  role: null,
});

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<AppUser | null>(null);
  const [firebaseUser, setFirebaseUser] = useState<FirebaseUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [role, setRole] = useState<UserRole | null>(null);

  useEffect(() => {
    const unsubscribe = onIdTokenChanged(auth, async (firebaseUser) => {
      setLoading(true);
      if (firebaseUser) {
        setFirebaseUser(firebaseUser);
        
        // Fetch user role from Firestore
        const userDocRef = doc(db, 'users', firebaseUser.uid);
        const userDoc = await getDoc(userDocRef);
        const userRole = userDoc.exists() ? (userDoc.data().role as UserRole) || 'user' : 'user';

        const appUser: AppUser = {
          uid: firebaseUser.uid,
          email: firebaseUser.email,
          displayName: firebaseUser.displayName,
          photoURL: firebaseUser.photoURL,
          role: userRole,
        };
        setUser(appUser);
        setRole(userRole);
      } else {
        setFirebaseUser(null);
        setUser(null);
        setRole(null);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const value = { user, firebaseUser, loading, role };
  
  // By returning the provider directly, the content is always rendered.
  // The 'loading' state is still managed and can be used by child components
  // to conditionally render content (e.g., show a spinner inside a component
  // while waiting for user data), but it no longer blocks the entire page.
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
