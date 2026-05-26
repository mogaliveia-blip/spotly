// src/lib/firebase.ts
import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth, type Auth } from 'firebase/auth';
import { 
  getFirestore,
  initializeFirestore, 
  persistentLocalCache,
  type Firestore
} from 'firebase/firestore';
import { getStorage, type FirebaseStorage } from 'firebase/storage';
import { firebaseConfig } from './firebase-config';

const isBrowser = typeof window !== 'undefined';

// Initialize Firebase app (safe for Next.js HMR)
const app = !getApps().length 
  ? initializeApp(firebaseConfig) 
  : getApp();

const auth = isBrowser ? getAuth(app) : (null as unknown as Auth);

/**
 * 🔥 Firestore with persistent local cache.
 * Auth is browser-only because Firebase Auth validates the API key during
 * server module evaluation, which breaks Next.js build page-data collection.
 */
let db: Firestore;
if (isBrowser) {
  try {
    db = initializeFirestore(app, {
      localCache: persistentLocalCache()
    });
  } catch {
    db = getFirestore(app);
  }
} else {
  db = getFirestore(app);
}

const storage: FirebaseStorage = getStorage(app);

export { app, auth, db, storage };
