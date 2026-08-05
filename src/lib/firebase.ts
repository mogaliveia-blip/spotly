// src/lib/firebase.ts
import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth, type Auth } from 'firebase/auth';
import { 
  getFirestore,
  initializeFirestore, 
  memoryLocalCache,
  persistentLocalCache,
  type Firestore
} from 'firebase/firestore';
import { getStorage, type FirebaseStorage } from 'firebase/storage';
import { firebaseConfig } from './firebase-config';

const isBrowser = typeof window !== 'undefined';
const RAW_FIRESTORE_CACHE_MODE = process.env.NEXT_PUBLIC_FIRESTORE_CACHE_MODE;
const RAW_FIRESTORE_TRANSPORT_MODE = process.env.NEXT_PUBLIC_FIRESTORE_TRANSPORT_MODE;
const FIRESTORE_CACHE_MODE = (RAW_FIRESTORE_CACHE_MODE || 'persistent').trim().toLowerCase();
const FIRESTORE_TRANSPORT_MODE = (RAW_FIRESTORE_TRANSPORT_MODE || 'default').trim().toLowerCase();

// Initialize Firebase app (safe for Next.js HMR)
const app = !getApps().length 
  ? initializeApp(firebaseConfig) 
  : getApp();

const auth = isBrowser ? getAuth(app) : (null as unknown as Auth);

declare global {
  var __spotlyFirestoreDb: Firestore | undefined;
  var __spotlyFirestoreConfig: {
    cacheMode: string;
    transportMode: string;
    initializedAt: number;
  } | undefined;
  var __spotlyFirestoreErrorListenersInstalled: boolean | undefined;
}

function buildFirestoreSettings() {
  const settings: Record<string, unknown> = {};

  if (FIRESTORE_CACHE_MODE === 'memory') {
    settings.localCache = memoryLocalCache();
  } else {
    settings.localCache = persistentLocalCache();
  }

  if (FIRESTORE_TRANSPORT_MODE === 'auto-long-polling') {
    settings.experimentalAutoDetectLongPolling = true;
  }

  return settings;
}

let db: Firestore;
if (isBrowser) {
  if (globalThis.__spotlyFirestoreDb) {
    db = globalThis.__spotlyFirestoreDb;
  } else {
    try {
      const firestoreSettings = buildFirestoreSettings();
      db = initializeFirestore(app, firestoreSettings as any);
      globalThis.__spotlyFirestoreDb = db;
      globalThis.__spotlyFirestoreConfig = {
        cacheMode: FIRESTORE_CACHE_MODE,
        transportMode: FIRESTORE_TRANSPORT_MODE,
        initializedAt: Date.now(),
      };
    } catch (error: any) {
      db = getFirestore(app);
      globalThis.__spotlyFirestoreDb = db;
      globalThis.__spotlyFirestoreConfig = {
        cacheMode: 'getFirestore-fallback',
        transportMode: FIRESTORE_TRANSPORT_MODE,
        initializedAt: Date.now(),
      };
      console.error('[Firestore] initialization failed, using getFirestore fallback', {
        errorCode: error?.code ?? null,
        errorMessage: error?.message ?? null,
      });
    }
  }
} else {
  db = getFirestore(app);
}

if (isBrowser && !globalThis.__spotlyFirestoreErrorListenersInstalled) {
  globalThis.__spotlyFirestoreErrorListenersInstalled = true;

  window.addEventListener('unhandledrejection', (event) => {
    const reason = event.reason;
    const message = String(reason?.message ?? reason ?? '');
    if (!message.includes('Firestore') && !message.includes('Listen/channel') && !message.includes('BloomFilter')) {
      return;
    }
    console.warn('[Firestore] unhandled rejection', {
      errorCode: reason?.code ?? null,
      errorMessage: message,
    });
  });

  window.addEventListener('error', (event) => {
    const message = String(event.message ?? '');
    if (!message.includes('Firestore') && !message.includes('Listen/channel') && !message.includes('BloomFilter')) {
      return;
    }
    console.warn('[Firestore] window error', {
      errorMessage: message,
    });
  });
}

const storage: FirebaseStorage = getStorage(app);

export { app, auth, db, storage };
