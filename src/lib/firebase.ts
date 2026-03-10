// src/lib/firebase.ts
import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { 
  getFirestore,
  initializeFirestore, 
  persistentLocalCache 
} from 'firebase/firestore';
import { getStorage } from 'firebase/storage';
import { firebaseConfig } from './firebase-config';

// Initialize Firebase app (safe for Next.js HMR)
const app = !getApps().length 
  ? initializeApp(firebaseConfig) 
  : getApp();

const auth = getAuth(app);

/**
 * 🔥 Firestore with persistent local cache.
 * We use a check to ensure initializeFirestore is only called once.
 * If the app was already initialized (HMR), we use getFirestore.
 */
const db = !getApps().length
  ? initializeFirestore(app, {
      localCache: persistentLocalCache()
    })
  : getFirestore(app);

const storage = getStorage(app);

export { app, auth, db, storage };
