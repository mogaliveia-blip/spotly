// src/lib/firebase.ts
import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore }from 'firebase/firestore';
import { firebaseConfig } from './firebase-config';

// Initialize Firebase
const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();
const auth = getAuth(app);
const db = getFirestore(app);

// In a real application, you might want to use the emulators for local development
//
// if (process.env.NODE_ENV === 'development') {
//   try {
//     connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
//     connectFirestoreEmulator(db, '127.0.0.1', 8080);
//   } catch (e) {
//     console.error(e);
//   }
// }


export { app, auth, db };
