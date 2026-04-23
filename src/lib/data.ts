// src/lib/data.ts
import { db, storage } from './firebase'
import {
  collection,
  doc,
  getDoc,
  getDocs,
  getDocsFromCache,
  getDocsFromServer,
  setDoc,
  updateDoc,
  deleteDoc,
  addDoc,
  serverTimestamp,
  runTransaction
} from 'firebase/firestore'
import type {
  POI,
  POILite,
  Review,
  AppUser,
  UserRole,
  AppConfig,
  MarketingConfig
} from './types'
import { errorEmitter } from '@/firebase/error-emitter'
import { FirestorePermissionError } from '@/firebase/errors'
import {
  ref,
  uploadBytes,
  getDownloadURL,
  deleteObject,
  listAll
} from 'firebase/storage'

// --- MULTI-EVENT HELPERS ---

/**
 * Temporairement fixé à "default-event" pour préserver la rétrocompatibilité.
 */
export function getCurrentEventId(): string {
  return 'default-event'
}

/**
 * Centralise les chemins Firestore pour gérer le multi-événement.
 * Si l'ID est "default-event", on utilise les anciennes collections globales.
 */
export const dbPaths = {
  pois: (eventId: string) => eventId === 'default-event' ? 'pois' : `events/${eventId}/pois`,
  poisPublic: (eventId: string) => eventId === 'default-event' ? 'pois_public' : `events/${eventId}/pois_public`,
  config: (eventId: string) => eventId === 'default-event' ? 'config' : `events/${eventId}/config`,
  members: (eventId: string) => `events/${eventId}/members`,
}

// --- CONFIG FUNCTIONS ---

export async function fetchAppConfig(eventId: string = getCurrentEventId()): Promise<AppConfig> {
  const configRef = doc(db, dbPaths.config(eventId), 'main')
  const configSnap = await getDoc(configRef)
  if (configSnap.exists()) {
    return configSnap.data() as AppConfig
  }
  return {
    isLandingPageActive: true,
    festivalMode: false
  }
}

export async function updateAppConfig(
  config: Partial<AppConfig>,
  eventId: string = getCurrentEventId()
): Promise<void> {
  const configRef = doc(db, dbPaths.config(eventId), 'main')
  try {
    await setDoc(configRef, config, { merge: true })
  } catch (serverError: any) {
    const permissionError = new FirestorePermissionError({
      path: configRef.path,
      operation: 'update',
      requestResourceData: config
    })
    errorEmitter.emit('permission-error', permissionError)
    throw serverError
  }
}

export async function fetchMarketingConfig(eventId: string = getCurrentEventId()): Promise<MarketingConfig> {
  const configRef = doc(db, dbPaths.config(eventId), 'marketing')
  const configSnap = await getDoc(configRef)
  if (configSnap.exists()) {
    return configSnap.data() as MarketingConfig
  }
  return {
    heroEnabled: false,
    heroTitle: 'Découvrez le festival',
    heroSubtitle:
      "Connectez-vous pour accéder à toutes les fonctionnalités et profiter d'une expérience complète.",
    heroImageUrl: 'https://picsum.photos/seed/marketing/1200/800',
    heroCtaText: 'Se connecter',
    heroCtaMode: 'auth',
    heroCtaLink: ''
  }
}

export async function updateMarketingConfig(
  config: Partial<MarketingConfig>,
  eventId: string = getCurrentEventId()
): Promise<void> {
  const configRef = doc(db, dbPaths.config(eventId), 'marketing')
  try {
    await setDoc(configRef, config, { merge: true })
  } catch (serverError: any) {
    const permissionError = new FirestorePermissionError({
      path: configRef.path,
      operation: 'update',
      requestResourceData: config
    })
    errorEmitter.emit('permission-error', permissionError)
    throw serverError
  }
}

// --- STORAGE FUNCTIONS ---

export async function uploadFile(
  file: File,
  path: string
): Promise<{ url: string; path: string }> {
  const storageRef = ref(storage, path)
  const uploadResult = await uploadBytes(storageRef, file, {
    contentType: file.type || 'image/jpeg'
  })
  const url = await getDownloadURL(uploadResult.ref)
  return { url, path: uploadResult.ref.fullPath }
}

export async function deleteFileByPath(filePath: string): Promise<void> {
  const storageRef = ref(storage, filePath)
  try {
    await deleteObject(storageRef)
  } catch (error: any) {
    if (error.code !== 'storage/object-not-found') {
      console.error('Erreur lors de la suppression du fichier:', error)
      throw error
    }
  }
}

// --- FIRESTORE FUNCTIONS ---

export async function createUserInFirestore(
  user: Omit<AppUser, 'role'> & { role?: UserRole }
): Promise<void> {
  const userRef = doc(db, 'users', user.uid)
  const userData = {
    uid: user.uid,
    email: user.email,
    displayName: user.displayName,
    role: user.role || 'user',
    photoURL: user.photoURL || null
  }

  try {
    await setDoc(userRef, userData, { merge: true })
  } catch (serverError) {
    const permissionError = new FirestorePermissionError({
      path: userRef.path,
      operation: 'create',
      requestResourceData: userData
    })
    errorEmitter.emit('permission-error', permissionError)
    throw serverError
  }
}

export async function fetchPois(eventId: string = getCurrentEventId()): Promise<POI[]> {
  const poiCollection = collection(db, dbPaths.pois(eventId))
  const poiSnapshot = await getDocs(poiCollection)
  const poiList = poiSnapshot.docs.map(
    (doc) => ({ id: doc.id, ...doc.data() } as POI)
  )
  return poiList
}

export async function fetchPoisLite(eventId: string = getCurrentEventId()): Promise<POILite[]> {
  const colRef = collection(db, dbPaths.poisPublic(eventId))

  const fallback = async () => {
    const full = await fetchPois(eventId)
    return full as unknown as POILite[]
  }

  try {
    const cacheSnap = await getDocsFromCache(colRef)

    if (!cacheSnap.empty) {
      const cached = cacheSnap.docs.map(
        (d) => ({ id: d.id, ...d.data() } as POILite)
      )
      void getDocsFromServer(colRef).catch(() => {})
      return cached
    }

    const serverSnap = await getDocsFromServer(colRef)
    if (serverSnap.empty) {
      return await fallback()
    }

    return serverSnap.docs.map(
      (d) => ({ id: d.id, ...d.data() } as POILite)
    )
  } catch (e: any) {
    return await fallback()
  }
}

export async function fetchPoiById(id: string, eventId: string = getCurrentEventId()): Promise<POI | undefined> {
  const poiRef = doc(db, dbPaths.pois(eventId), id)
  const poiSnap = await getDoc(poiRef)
  if (poiSnap.exists()) {
    return { id: poiSnap.id, ...poiSnap.data() } as POI
  }
  return undefined
}

export async function fetchReviewsByPoiId(poiId: string, eventId: string = getCurrentEventId()): Promise<Review[]> {
  const reviewsCollection = collection(db, dbPaths.pois(eventId), poiId, 'reviews')
  const reviewSnapshot = await getDocs(reviewsCollection)
  const reviewList = reviewSnapshot.docs.map((doc) => {
    const data = doc.data()
    const createdAt = data.createdAt?.toDate
      ? data.createdAt.toDate()
      : new Date(data.createdAt)
    return { id: doc.id, ...data, createdAt } as Review
  })
  return reviewList.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
}

export async function addReview(
  poiId: string,
  reviewData: Omit<Review, 'id' | 'poiId' | 'createdAt'>,
  eventId: string = getCurrentEventId()
): Promise<Review> {
  const reviewsCollection = collection(db, dbPaths.pois(eventId), poiId, 'reviews');
  const poiRef = doc(db, dbPaths.pois(eventId), poiId);

  try {
    let newReviewId = '';

    await runTransaction(db, async (tx) => {
      const poiSnap = await tx.get(poiRef);
      const currentCount = poiSnap.exists()
        ? (poiSnap.data().reviewCount || 0)
        : 0;

      const newReviewRef = doc(reviewsCollection);
      newReviewId = newReviewRef.id;

      tx.set(newReviewRef, {
        ...reviewData,
        poiId,
        createdAt: serverTimestamp(),
      });

      tx.update(poiRef, {
        reviewCount: currentCount + 1,
      });
    });

    return {
      id: newReviewId,
      ...reviewData,
      createdAt: new Date(),
      poiId,
    };

  } catch (e: any) {
    if (e.code && e.code.includes('permission-denied')) {
      const permissionError = new FirestorePermissionError({
        path: `${dbPaths.pois(eventId)}/${poiId}/reviews`,
        operation: 'create',
        requestResourceData: reviewData
      });
      errorEmitter.emit('permission-error', permissionError)
    }
    throw e;
  }
}

export async function fetchUsers(): Promise<AppUser[]> {
  const userCollection = collection(db, 'users')
  const userSnapshot = await getDocs(userCollection)
  return userSnapshot.docs.map((doc) => doc.data() as AppUser)
}

export function updateUserRole(uid: string, role: UserRole): void {
  const userRef = doc(db, 'users', uid)
  updateDoc(userRef, { role }).catch(async (serverError) => {
    const permissionError = new FirestorePermissionError({
      path: userRef.path,
      operation: 'update',
      requestResourceData: { role }
    })
    errorEmitter.emit('permission-error', permissionError)
  })
}

export async function createPoi(
  poiData: Omit<POI, 'id' | 'averageRating' | 'reviewCount'>,
  eventId: string = getCurrentEventId()
): Promise<string> {
  const poiCollection = collection(db, dbPaths.pois(eventId))
  const fullPoiData = {
    ...poiData,
    averageRating: 0,
    reviewCount: 0
  }
  const docRef = await addDoc(poiCollection, fullPoiData)
  return docRef.id
}

export async function updatePoi(
  poiId: string,
  poiData: Partial<Omit<POI, 'id' | 'averageRating' | 'reviewCount'>>,
  eventId: string = getCurrentEventId()
): Promise<void> {
  const poiRef = doc(db, dbPaths.pois(eventId), poiId)
  try {
    await updateDoc(poiRef, poiData)
  } catch (serverError: any) {
    const permissionError = new FirestorePermissionError({
      path: poiRef.path,
      operation: 'update',
      requestResourceData: poiData
    })
    errorEmitter.emit('permission-error', permissionError)
    throw serverError
  }
}

export async function deletePoi(poiId: string, eventId: string = getCurrentEventId()): Promise<void> {
  const poiRef = doc(db, dbPaths.pois(eventId), poiId)
  // Note: On ne touche pas encore aux chemins Storage pour préserver l'existant
  const imagesFolderRef = ref(storage, `poi-images/${poiId}`)

  try {
    await deleteDoc(poiRef)
    const res = await listAll(imagesFolderRef)
    const deletePromises = res.items.map((itemRef) => deleteObject(itemRef))
    const subfolderPromises = res.prefixes.map(async (folderRef) => {
      const subfolderItems = await listAll(folderRef)
      return subfolderItems.items.map((itemRef) => deleteObject(itemRef))
    })

    await Promise.all([
      ...deletePromises,
      ...(await Promise.all(subfolderPromises)).flat()
    ])
  } catch (serverError: any) {
    if (serverError.code?.includes('permission-denied')) {
      const permissionError = new FirestorePermissionError({
        path: poiRef.path,
        operation: 'delete'
      })
      errorEmitter.emit('permission-error', permissionError)
    } else {
      console.error('Erreur lors de la suppression du POI et de ses images', serverError)
    }
    throw serverError
  }
}
