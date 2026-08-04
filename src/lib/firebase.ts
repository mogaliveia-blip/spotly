// src/lib/firebase.ts
import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth, type Auth } from 'firebase/auth';
import { 
  getFirestore,
  initializeFirestore, 
  memoryLocalCache,
  persistentLocalCache,
  persistentMultipleTabManager,
  persistentSingleTabManager,
  type Firestore
} from 'firebase/firestore';
import { getStorage, type FirebaseStorage } from 'firebase/storage';
import { firebaseConfig } from './firebase-config';

const isBrowser = typeof window !== 'undefined';
const FIRESTORE_CACHE_MODE = process.env.NEXT_PUBLIC_FIRESTORE_CACHE_MODE || 'persistent';
const FIRESTORE_TRANSPORT_MODE = process.env.NEXT_PUBLIC_FIRESTORE_TRANSPORT_MODE || 'default';

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
  } else if (FIRESTORE_CACHE_MODE === 'persistent-multi-tab') {
    settings.localCache = persistentLocalCache({
      tabManager: persistentMultipleTabManager(),
    });
  } else if (FIRESTORE_CACHE_MODE === 'persistent-single-tab') {
    settings.localCache = persistentLocalCache({
      tabManager: persistentSingleTabManager({}),
    });
  } else {
    settings.localCache = persistentLocalCache();
  }

  if (FIRESTORE_TRANSPORT_MODE === 'auto-long-polling') {
    settings.experimentalAutoDetectLongPolling = true;
  } else if (FIRESTORE_TRANSPORT_MODE === 'force-long-polling') {
    settings.experimentalForceLongPolling = true;
  }

  return settings;
}

function describeFirestoreSettings(settings: Record<string, unknown>) {
  return {
    cacheMode: FIRESTORE_CACHE_MODE,
    transportMode: FIRESTORE_TRANSPORT_MODE,
    experimentalAutoDetectLongPolling: settings.experimentalAutoDetectLongPolling === true,
    experimentalForceLongPolling: settings.experimentalForceLongPolling === true,
    useFetchStreams: settings.useFetchStreams ?? null,
  };
}

function logFirestoreInit(mode: string, details: Record<string, unknown> = {}) {
  if (!isBrowser) return;
  console.info('[Perf] firestore-init', {
    mode,
    cacheMode: FIRESTORE_CACHE_MODE,
    transportMode: FIRESTORE_TRANSPORT_MODE,
    browser: navigator.userAgent,
    ...details,
  });
}

let db: Firestore;
if (isBrowser) {
  if (globalThis.__spotlyFirestoreDb) {
    db = globalThis.__spotlyFirestoreDb;
    logFirestoreInit('reuse-existing-instance', globalThis.__spotlyFirestoreConfig || {});
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
      logFirestoreInit('initializeFirestore', describeFirestoreSettings(firestoreSettings));
      console.info('[Perf] firestore-cache-mode', {
        ...describeFirestoreSettings(firestoreSettings),
        browser: navigator.userAgent,
      });
    } catch (error: any) {
      db = getFirestore(app);
      globalThis.__spotlyFirestoreDb = db;
      globalThis.__spotlyFirestoreConfig = {
        cacheMode: 'getFirestore-fallback',
        transportMode: FIRESTORE_TRANSPORT_MODE,
        initializedAt: Date.now(),
      };
      console.warn('[Perf] firestore-init-error', {
        cacheMode: FIRESTORE_CACHE_MODE,
        transportMode: FIRESTORE_TRANSPORT_MODE,
        errorCode: error?.code ?? null,
        errorMessage: error?.message ?? null,
        browser: navigator.userAgent,
      });
      console.warn('[Perf] firestore-cache-mode', {
        mode: 'getFirestore-fallback',
        requestedCacheMode: FIRESTORE_CACHE_MODE,
        transportMode: FIRESTORE_TRANSPORT_MODE,
        browser: navigator.userAgent,
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
    console.warn('[Perf] firestore-unhandled-rejection', {
      cacheMode: FIRESTORE_CACHE_MODE,
      transportMode: FIRESTORE_TRANSPORT_MODE,
      errorCode: reason?.code ?? null,
      errorMessage: message,
      online: navigator.onLine,
      visibilityState: document.visibilityState,
    });
  });

  window.addEventListener('error', (event) => {
    const message = String(event.message ?? '');
    if (!message.includes('Firestore') && !message.includes('Listen/channel') && !message.includes('BloomFilter')) {
      return;
    }
    console.warn('[Perf] firestore-window-error', {
      cacheMode: FIRESTORE_CACHE_MODE,
      transportMode: FIRESTORE_TRANSPORT_MODE,
      errorMessage: message,
      online: navigator.onLine,
      visibilityState: document.visibilityState,
    });
  });
}

const storage: FirebaseStorage = getStorage(app);

export { app, auth, db, storage };
