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
  runTransaction,
  Timestamp
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

// --- CONFIG FUNCTIONS ---

/**
 * Fetches the global application configuration.
 * @returns A promise that resolves with the app configuration.
 */
export async function fetchAppConfig(): Promise<AppConfig> {
  const configRef = doc(db, 'config', 'main')
  const configSnap = await getDoc(configRef)
  if (configSnap.exists()) {
    return configSnap.data() as AppConfig
  }
  return {
    isLandingPageActive: true,
    festivalMode: false
  }
}

/**
 * Updates the global application configuration.
 * @param config The partial config to update.
 */
export async function updateAppConfig(config: Partial<AppConfig>): Promise<void> {
  const configRef = doc(db, 'config', 'main')
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

/**
 * Fetches the marketing configuration.
 * @returns A promise that resolves with the marketing configuration.
 */
export async function fetchMarketingConfig(): Promise<MarketingConfig> {
  const configRef = doc(db, 'config', 'marketing')
  const configSnap = await getDoc(configRef)
  if (configSnap.exists()) {
    return configSnap.data() as MarketingConfig
  }
  // Default config if it doesn't exist
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

/**
 * Updates the marketing configuration.
 * @param config The partial marketing config to update.
 */
export async function updateMarketingConfig(
  config: Partial<MarketingConfig>
): Promise<void> {
  const configRef = doc(db, 'config', 'marketing')
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

/**
 * Uploads a file to Firebase Storage.
 * @param file The file to upload.
 * @param path The path in Storage where the file will be saved.
 * @returns A promise that resolves with the download URL and the full path of the uploaded file.
 */
export async function uploadFile(
  file: File,
  path: string
): Promise<{ url: string; path: string }> {
  const storageRef = ref(storage, path)
  // uploadBytes returns an UploadResult, and we should use its reference for getDownloadURL
  const uploadResult = await uploadBytes(storageRef, file, {
    contentType: file.type || 'image/jpeg'
  })
  const url = await getDownloadURL(uploadResult.ref)
  return { url, path: uploadResult.ref.fullPath }
}

/**
 * Deletes a file from Firebase Storage using its full path.
 * @param filePath The full path of the file to delete.
 */
export async function deleteFileByPath(filePath: string): Promise<void> {
  const storageRef = ref(storage, filePath)
  try {
    await deleteObject(storageRef)
  } catch (error: any) {
    // It's not critical if the file doesn't exist, so we can ignore 'object-not-found' errors.
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

export async function fetchPois(): Promise<POI[]> {
  const poiCollection = collection(db, 'pois')
  const poiSnapshot = await getDocs(poiCollection)
  const poiList = poiSnapshot.docs.map(
    (doc) => ({ id: doc.id, ...doc.data() } as POI)
  )
  return poiList
}

/**
 * ✅ NOUVEAU : fetch POIs LITE depuis pois_public
 * Cache-first -> serveur, avec refresh serveur non bloquant.
 *
 * ⚠️ Fallback obligatoire : si pois_public vide / inexistant / permission, on retourne fetchPois()
 */
export async function fetchPoisLite(): Promise<POILite[]> {
  const colRef = collection(db, 'pois_public')

  const fallback = async () => {
    const full = await fetchPois()
    // On peut caster : POI contient forcément les champs du lite.
    return full as unknown as POILite[]
  }

  try {
    const cacheSnap = await getDocsFromCache(colRef)

    if (!cacheSnap.empty) {
      const cached = cacheSnap.docs.map(
        (d) => ({ id: d.id, ...d.data() } as POILite)
      )

      // Refresh serveur non bloquant
      void getDocsFromServer(colRef).catch(() => {
        // silence: on ne casse pas l'app
      })

      return cached
    }

    // Cache vide -> serveur
    const serverSnap = await getDocsFromServer(colRef)
    if (serverSnap.empty) {
      return await fallback()
    }

    return serverSnap.docs.map(
      (d) => ({ id: d.id, ...d.data() } as POILite)
    )
  } catch (e: any) {
    // permission denied / rules / etc -> fallback sur pois (full)
    if (e?.code && String(e.code).includes('permission')) {
      return await fallback()
    }
    return await fallback()
  }
}

/**
 * (Facultatif) : lire un POI lite par ID depuis pois_public
 */
export async function fetchPoiPublicById(
  id: string
): Promise<POILite | undefined> {
  const poiRef = doc(db, 'pois_public', id)
  const poiSnap = await getDoc(poiRef)
  if (poiSnap.exists()) {
    return { id: poiSnap.id, ...poiSnap.data() } as POILite
  }
  return undefined
}

export async function fetchPoiById(id: string): Promise<POI | undefined> {
  const poiRef = doc(db, 'pois', id)
  const poiSnap = await getDoc(poiRef)
  if (poiSnap.exists()) {
    return { id: poiSnap.id, ...poiSnap.data() } as POI
  }
  return undefined
}

export async function fetchReviewsByPoiId(poiId: string): Promise<Review[]> {
  const reviewsCollection = collection(db, 'pois', poiId, 'reviews')
  const reviewSnapshot = await getDocs(reviewsCollection)
  const reviewList = reviewSnapshot.docs.map((doc) => {
    const data = doc.data()
    // Handle both Timestamp and Date objects
    const createdAt = data.createdAt?.toDate
      ? data.createdAt.toDate()
      : new Date(data.createdAt)
    return { id: doc.id, ...data, createdAt } as Review
  })
  return reviewList.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
}

export async function addReview(
  poiId: string,
  reviewData: Omit<Review, 'id' | 'poiId' | 'createdAt'>
): Promise<Review> {
  const reviewsCollection = collection(db, 'pois', poiId, 'reviews');
  const poiRef = doc(db, 'pois', poiId);

  try {
    let newReviewId = '';

    await runTransaction(db, async (tx) => {

      // 1️⃣ LIRE D'ABORD (obligatoire avant toute écriture)
      const poiSnap = await tx.get(poiRef);

      const currentCount = poiSnap.exists()
        ? (poiSnap.data().reviewCount || 0)
        : 0;

      // 2️⃣ Préparer la référence du nouvel avis
      const newReviewRef = doc(reviewsCollection);
      newReviewId = newReviewRef.id;

      // 3️⃣ ÉCRITURES (après les lectures)

      tx.set(newReviewRef, {
        ...reviewData,
        poiId,
        createdAt: serverTimestamp(),
        hidden: false,
        reportCount: 0,
        hiddenAt: null,
      });

      tx.update(poiRef, {
        reviewCount: currentCount + 1,
      });

    });

    // Retour optimiste pour l'UI
    return {
      id: newReviewId,
      ...reviewData,
      createdAt: new Date(),
      poiId,
      hidden: false,
      reportCount: 0,
      hiddenAt: null,
    };

  } catch (e: any) {
    if (e.code && e.code.includes('permission-denied')) {
      const permissionError = new FirestorePermissionError({
        path: `pois/${poiId}/reviews`,
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
  poiData: Omit<POI, 'id' | 'averageRating' | 'reviewCount'>
): Promise<string> {
  const poiCollection = collection(db, 'pois')
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
  poiData: Partial<Omit<POI, 'id' | 'averageRating' | 'reviewCount'>>
): Promise<void> {
  const poiRef = doc(db, 'pois', poiId)
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

export async function deletePoi(poiId: string): Promise<void> {
  const poiRef = doc(db, 'pois', poiId)
  const imagesFolderRef = ref(storage, `poi-images/${poiId}`)

  try {
    // Delete Firestore document first
    await deleteDoc(poiRef)

    // Then delete all files in the corresponding Storage folder
    const res = await listAll(imagesFolderRef)
    const deletePromises = res.items.map((itemRef) => deleteObject(itemRef))
    // Also delete items in subfolders (like gallery)
    const subfolderPromises = res.prefixes.map(async (folderRef) => {
      const subfolderItems = await listAll(folderRef)
      return subfolderItems.items.map((itemRef) => deleteObject(itemRef))
    })

    await Promise.all([
      ...deletePromises,
      ...(await Promise.all(subfolderPromises)).flat()
    ])
  } catch (serverError: any) {
    // Handle potential permission errors for both Firestore and Storage
    if (serverError.code?.includes('permission-denied')) {
      const permissionError = new FirestorePermissionError({
        path: poiRef.path,
        operation: 'delete'
      })
      errorEmitter.emit('permission-error', permissionError)
    } else {
      console.error('Erreur lors de la suppression du POI et de ses images', serverError)
    }
    throw serverError // Re-throw the error to be caught by the caller
  }
}

/**
 * Seeds the database with initial sample data to create collections.
 */
export async function seedDatabase(): Promise<void> {
  const poiId = await createPoi({
    title: "Scène Principale",
    description: "La scène principale du festival Leu Tempo, accueillant les plus grands artistes.",
    mainCategory: "programmation",
    subCategory: "concert_headliner",
    location: { lat: -21.3393, lng: 55.4781 },
    headerPhotoUrl: "https://picsum.photos/seed/main-stage/1200/800",
    galleryUrls: []
  });

  await addReview(poiId, {
    userId: "system-seed",
    userDisplayName: "Équipe Festival",
    userPhotoURL: null,
    rating: 5,
    comment: "Hâte de vous retrouver devant cette scène magnifique !",
    hidden: false,
    reportCount: 0,
    hiddenAt: null
  });
}
