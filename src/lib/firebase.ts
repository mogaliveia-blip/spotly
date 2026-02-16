// src/lib/firebase.ts
import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { 
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

// 🔥 Firestore with persistent local cache (IndexedDB)
const db = initializeFirestore(app, {
  localCache: persistentLocalCache()
});

const storage = getStorage(app);

// Optional emulator config (kept intact)
// if (typeof window !== 'undefined' && window.location.hostname === 'localhost') {
//   try {
//     connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
//     connectFirestoreEmulator(db, '127.0.0.1', 8080);
//   } catch (e) {
//     console.error(e);
//   }
// }

export { app, auth, db, storage };
