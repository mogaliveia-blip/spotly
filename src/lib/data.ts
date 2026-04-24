
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
  query,
  where,
  limit,
  collectionGroup
} from 'firebase/firestore'
import type {
  POI,
  POILite,
  Review,
  AppUser,
  UserRole,
  AppConfig,
  MarketingConfig,
  AppEvent
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

// --- MULTI-EVENT ENGINE ---

let globalCurrentEventId: string = 'default-event';

/**
 * Retourne l'ID de l'événement courant (défini par le routing/provider).
 */
export function getCurrentEventId(): string {
  return globalCurrentEventId;
}

/**
 * Définit l'ID de l'événement courant. Appelé par l'EventProvider.
 */
export function setCurrentEventId(id: string) {
  globalCurrentEventId = id;
}

/**
 * Résout un événement à partir de son slug URL.
 */
export async function fetchEventBySlug(slug: string): Promise<AppEvent | null> {
  if (!slug || slug === 'default') return null;
  try {
    const eventsRef = collection(db, 'events');
    const q = query(eventsRef, where('slug', '==', slug), limit(1));
    const snap = await getDocs(q);
    if (snap.empty) return null;
    const d = snap.docs[0];
    const data = d.data();
    return { 
      id: d.id, 
      ...data, 
      createdAt: data.createdAt?.toDate ? data.createdAt.toDate() : new Date(data.createdAt),
      updatedAt: data.updatedAt?.toDate ? data.updatedAt.toDate() : new Date(data.updatedAt)
    } as AppEvent;
  } catch (error) {
    console.warn("Could not resolve event by slug:", slug);
    return null;
  }
}

/**
 * Récupère tous les événements où l'utilisateur est membre.
 * Retourne les événements avec le rôle spécifique de l'utilisateur.
 */
export async function fetchUserEvents(uid: string): Promise<(AppEvent & { userRole?: string })[]> {
  console.log("[Data] fetchUserEvents: Démarrage pour UID", uid);
  try {
    // 1. On récupère les documents de membres via Collection Group
    const membersQuery = query(collectionGroup(db, 'members'), where('uid', '==', uid));
    
    let membersSnap;
    try {
      // On force le serveur pour être sûr d'avoir l'état réel et valider l'index
      membersSnap = await getDocsFromServer(membersQuery);
      console.log("[Data] fetchUserEvents: Documents de membres trouvés (Serveur)", membersSnap.size);
    } catch (e: any) {
       if (e.code === 'failed-precondition' || e.message?.includes('index')) {
         console.warn("[Data] fetchUserEvents: Index manquant ou en cours.");
         throw new Error('INDEX_MISSING');
       }
       membersSnap = await getDocs(membersQuery);
       console.log("[Data] fetchUserEvents: Documents de membres trouvés (Cache)", membersSnap.size);
    }
    
    // 2. On extrait les IDs d'événements et les rôles associés
    const memberships = membersSnap.docs.map(d => {
        const eventId = d.ref.parent.parent?.id;
        const role = d.data().role;
        return eventId ? { eventId, role } : null;
    }).filter(Boolean) as { eventId: string; role: string }[];

    const eventIds = Array.from(new Set(memberships.map(m => m.eventId)));
    console.log("[Data] fetchUserEvents: IDs d'événements extraits", eventIds);
    
    if (eventIds.length === 0) {
      return [];
    }

    // 3. On récupère les détails de chaque événement
    const eventPromises = eventIds.map(async (id) => {
      try {
        const eventDoc = await getDoc(doc(db, 'events', id));
        if (!eventDoc.exists()) {
            console.warn(`[Data] fetchUserEvents: L'événement ${id} n'existe plus.`);
            return null;
        }
        const d = eventDoc.data();
        const membership = memberships.find(m => m.eventId === id);

        return { 
          id: eventDoc.id, 
          ...d, 
          userRole: membership?.role,
          createdAt: d.createdAt?.toDate ? d.createdAt.toDate() : new Date(d.createdAt),
          updatedAt: d.updatedAt?.toDate ? d.updatedAt.toDate() : new Date(d.updatedAt)
        } as (AppEvent & { userRole?: string });
      } catch (e) {
        console.error(`[Data] fetchUserEvents: Erreur lors du fetch de l'event ${id}`, e);
        return null;
      }
    });

    const events = await Promise.all(eventPromises);
    const finalEvents = events.filter((e): e is (AppEvent & { userRole: string }) => e !== null);
    
    console.log("[Data] fetchUserEvents: Nombre final d'événements retournés", finalEvents.length);
    return finalEvents;

  } catch (error: any) {
    if (error.message === 'INDEX_MISSING') throw error;
    console.error("[Data] fetchUserEvents: Erreur critique", error.message);
    return [];
  }
}

/**
 * Crée un nouvel événement et initialise sa structure de données.
 */
export async function createEvent(data: { name: string; slug: string; ownerId: string }): Promise<AppEvent> {
  const eventRef = doc(collection(db, 'events'));
  const id = eventRef.id;

  const eventData = {
    name: data.name,
    slug: data.slug.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, ''),
    ownerId: data.ownerId,
    status: 'draft' as const,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  };

  await runTransaction(db, async (tx) => {
    tx.set(eventRef, eventData);
    
    const memberRef = doc(db, `events/${id}/members`, data.ownerId);
    tx.set(memberRef, {
      uid: data.ownerId,
      role: 'admin',
      joinedAt: serverTimestamp()
    });

    tx.set(doc(db, `events/${id}/config`, 'main'), {
      isLandingPageActive: true,
      reviewsEnabled: true
    });

    tx.set(doc(db, `events/${id}/config`, 'marketing'), {
      heroEnabled: false,
      heroTitle: `Bienvenue à ${data.name}`,
      heroSubtitle: "Découvrez l'application officielle du festival.",
      heroImageUrl: 'https://picsum.photos/seed/festival/1200/800',
      heroCtaText: 'Commencer',
      heroCtaMode: 'auth'
    });
  });

  return { id, ...eventData, createdAt: new Date(), updatedAt: new Date() } as AppEvent;
}

/**
 * Centralise les chemins Firestore pour gérer le multi-événement.
 */
export const dbPaths = {
  pois: (eventId: string) => eventId === 'default-event' ? 'pois' : `events/${eventId}/pois`,
  poisPublic: (eventId: string) => eventId === 'default-event' ? 'pois_public' : `events/${eventId}/pois_public`,
  config: (eventId: string) => eventId === 'default-event' ? 'config' : `events/${eventId}/config`,
  members: (eventId: string) => `events/${eventId}/members`,
}

// --- CONFIG FUNCTIONS ---

export async function fetchAppConfig(eventId: string = getCurrentEventId()): Promise<AppConfig> {
  try {
    const configRef = doc(db, dbPaths.config(eventId), 'main')
    const configSnap = await getDoc(configRef)
    
    if (configSnap.exists()) {
      return configSnap.data() as AppConfig
    }
  } catch (e) {
  }

  if (eventId !== 'default-event') {
    try {
      const oldRef = doc(db, 'config', 'main')
      const oldSnap = await getDoc(oldRef)
      if (oldSnap.exists()) return oldSnap.data() as AppConfig
    } catch {
    }
  }

  return {
    isLandingPageActive: true,
    festivalMode: false,
    reviewsEnabled: true
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
  try {
    const configRef = doc(db, dbPaths.config(eventId), 'marketing')
    const configSnap = await getDoc(configRef)
    
    if (configSnap.exists()) {
      return configSnap.data() as MarketingConfig
    }
  } catch {
  }

  if (eventId !== 'default-event') {
    try {
      const oldRef = doc(db, 'config', 'marketing')
      const oldSnap = await getDoc(oldRef)
      if (oldSnap.exists()) return oldSnap.data() as MarketingConfig
    } catch {
    }
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
      console.warn('Could not delete file (not found):', filePath);
    }
  }
}

// --- FIRESTORE FUNCTIONS ---

export async function createUserInFirestore(
  user: Omit<AppUser, 'role' | 'emailVerified' | 'isApproved'> & { role?: UserRole; isApproved?: boolean }
): Promise<void> {
  const userRef = doc(db, 'users', user.uid)
  
  try {
    const userSnap = await getDoc(userRef)

    if (!userSnap.exists()) {
      // ✅ Création initiale : on définit les valeurs par défaut
      const initialData = {
        uid: user.uid,
        email: user.email,
        displayName: user.displayName,
        photoURL: user.photoURL || null,
        role: user.role || 'user',
        isApproved: user.isApproved ?? false,
        createdAt: serverTimestamp(),
      }
      await setDoc(userRef, initialData)
    } else {
      // ✅ Mise à jour (re-connexion) : on ne synchronise que les infos de profil
      // On ne touche PAS au rôle ni au statut d'approbation existant
      const syncData = {
        email: user.email,
        displayName: user.displayName,
        photoURL: user.photoURL || null,
        lastLogin: serverTimestamp(),
      }
      await setDoc(userRef, syncData, { merge: true })
    }
  } catch (serverError: any) {
    const permissionError = new FirestorePermissionError({
      path: userRef.path,
      operation: 'create',
      requestResourceData: user
    })
    errorEmitter.emit('permission-error', permissionError)
    throw serverError
  }
}

/**
 * Met à jour l'état d'approbation d'un utilisateur.
 */
export async function updateUserApproval(uid: string, isApproved: boolean): Promise<void> {
  const userRef = doc(db, 'users', uid)
  try {
    await updateDoc(userRef, { isApproved })
  } catch (serverError: any) {
     const permissionError = new FirestorePermissionError({
      path: userRef.path,
      operation: 'update',
      requestResourceData: { isApproved }
    })
    errorEmitter.emit('permission-error', permissionError)
    throw serverError
  }
}

export async function fetchPois(eventId: string = getCurrentEventId()): Promise<POI[]> {
  try {
    const poiCollection = collection(db, dbPaths.pois(eventId))
    let poiSnapshot = await getDocs(poiCollection)
    
    if (poiSnapshot.empty && eventId !== 'default-event') {
      const oldCollection = collection(db, 'pois')
      poiSnapshot = await getDocs(oldCollection)
    }

    return poiSnapshot.docs.map(
      (doc) => ({ id: doc.id, ...doc.data() } as POI)
    )
  } catch {
    if (eventId !== 'default-event') {
      try {
        const oldCollection = collection(db, 'pois')
        const poiSnapshot = await getDocs(oldCollection)
        return poiSnapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() } as POI))
      } catch {
        return []
      }
    }
    return []
  }
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
  try {
    const poiRef = doc(db, dbPaths.pois(eventId), id)
    const poiSnap = await getDoc(poiRef)
    
    if (poiSnap.exists()) {
      return { id: poiSnap.id, ...poiSnap.data() } as POI
    }
  } catch {
  }

  if (eventId !== 'default-event') {
    try {
      const oldRef = doc(db, 'pois', id)
      const oldSnap = await getDoc(oldRef)
      if (oldSnap.exists()) {
        return { id: oldSnap.id, ...oldSnap.data() } as POI
      }
    } catch {
    }
  }

  return undefined
}

export async function fetchReviewsByPoiId(poiId: string, eventId: string = getCurrentEventId()): Promise<Review[]> {
  try {
    const reviewsCollection = collection(db, dbPaths.pois(eventId), poiId, 'reviews')
    let reviewSnapshot = await getDocs(reviewsCollection)
    
    if (reviewSnapshot.empty && eventId !== 'default-event') {
      const oldReviewsCollection = collection(db, 'pois', poiId, 'reviews')
      reviewSnapshot = await getDocs(oldReviewsCollection)
    }

    const reviewList = reviewSnapshot.docs.map((doc) => {
      const data = doc.data()
      const createdAt = data.createdAt?.toDate
        ? data.createdAt.toDate()
        : new Date(data.createdAt)
      return { id: doc.id, ...data, createdAt } as Review
    })
    return reviewList.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
  } catch {
    if (eventId !== 'default-event') {
       try {
         const oldReviewsCollection = collection(db, 'pois', poiId, 'reviews')
         const reviewSnapshot = await getDocs(oldReviewsCollection)
         return reviewSnapshot.docs.map((doc) => {
           const data = doc.data()
           const createdAt = data.createdAt?.toDate ? data.createdAt.toDate() : new Date(data.createdAt)
           return { id: doc.id, ...data, createdAt } as Review
         }).sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
       } catch {
         return []
       }
    }
    return []
  }
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
    if (e.code && (e.code.includes('permission-denied') || e.code === 'permission-denied')) {
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
  try {
    const userCollection = collection(db, 'users')
    const userSnapshot = await getDocs(userCollection)
    return userSnapshot.docs.map((doc) => doc.data() as AppUser)
  } catch (error) {
    console.warn("Could not fetch users, possibly missing permissions.");
    return [];
  }
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
      console.warn('Could not fully delete POI or its images:', serverError.message)
    }
    throw serverError
  }
}
