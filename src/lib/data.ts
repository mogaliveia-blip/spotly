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
  deleteField,
  addDoc,
  writeBatch,
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
  AppEvent,
  EventStatus,
  EventMember,
  EventRole,
  EventMemberWithProfile,
  POISponsor
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

export const DEFAULT_EVENT_ID = 'default-event';

/**
 * Résout un événement à partir de son slug URL.
 */
export async function fetchEventBySlug(
  slug: string,
  options: { uid?: string; isOwner?: boolean } = {}
): Promise<AppEvent | null> {
  if (!slug || slug === 'default' || slug === 'dashboard' || slug === 'admin') return null;
  
  const normalizedSlug = slug.toLowerCase().trim();
  
  try {
    const eventsRef = collection(db, 'events');
    const q = query(eventsRef, where('slug', '==', normalizedSlug), where('status', '==', 'published'), limit(1));
    const snap = await getDocs(q);
    
    if (!snap.empty) {
      const d = snap.docs[0];
      const data = d.data();
      return {
        id: d.id,
        ...data,
        createdAt: data.createdAt?.toDate ? data.createdAt.toDate() : new Date(data.createdAt),
        updatedAt: data.updatedAt?.toDate ? data.updatedAt.toDate() : new Date(data.updatedAt),
        startDate: data.startDate?.toDate ? data.startDate.toDate() : (data.startDate ? new Date(data.startDate) : undefined),
        endDate: data.endDate?.toDate ? data.endDate.toDate() : (data.endDate ? new Date(data.endDate) : undefined)
      } as AppEvent;
    }

    if (options.isOwner) {
      const ownerQuery = query(eventsRef, where('slug', '==', normalizedSlug), limit(1));
      const ownerSnap = await getDocs(ownerQuery);

      if (!ownerSnap.empty) {
        const d = ownerSnap.docs[0];
        const data = d.data();
        return {
          id: d.id,
          ...data,
          createdAt: data.createdAt?.toDate ? data.createdAt.toDate() : new Date(data.createdAt),
          updatedAt: data.updatedAt?.toDate ? data.updatedAt.toDate() : new Date(data.updatedAt),
          startDate: data.startDate?.toDate ? data.startDate.toDate() : (data.startDate ? new Date(data.startDate) : undefined),
          endDate: data.endDate?.toDate ? data.endDate.toDate() : (data.endDate ? new Date(data.endDate) : undefined)
        } as AppEvent;
      }
    }

    if (options.uid) {
      const userEvents = await fetchUserEvents(options.uid);
      return userEvents.find((event) => event.slug === normalizedSlug) ?? null;
    }

    return null;
  } catch (error) {
    console.error(`[Data] Erreur lors de la résolution du slug ${slug}:`, error);
    return null;
  }
}

/**
 * Récupère tous les événements où l'utilisateur est membre.
 */
export async function fetchUserEvents(uid: string): Promise<(AppEvent & { userRole?: EventRole })[]> {
  try {
    // Filtrage strict par UID pour respecter les Security Rules
    const membersQuery = query(collectionGroup(db, 'members'), where('uid', '==', uid));
    
    let membersSnap;
    try {
      membersSnap = await getDocsFromServer(membersQuery);
    } catch (e: any) {
      console.error('[Data] fetchUserEvents members collectionGroup server query failed');
      console.error('[Data] Firestore raw error code:', e?.code);
      console.error('[Data] Firestore raw error message:', e?.message);
      console.error('[Data] Firestore raw error object:', e);

      if (e?.code !== 'unavailable') {
        throw e;
      }

      membersSnap = await getDocs(membersQuery);
    }
    
    const memberships = membersSnap.docs.map(d => {
        const segments = d.ref.path.split('/');
        const eventId = segments[1];
        const role = d.data().role as EventRole;
        return eventId ? { eventId, role } : null;
    }).filter(Boolean) as { eventId: string; role: EventRole }[];

    const eventIds = Array.from(new Set(memberships.map(m => m.eventId)));
    
    if (eventIds.length === 0) return [];

    const eventPromises = eventIds.map(async (id) => {
      try {
        const eventDoc = await getDoc(doc(db, 'events', id));
        if (!eventDoc.exists()) return null;
        const d = eventDoc.data();
        const membership = memberships.find(m => m.eventId === id);

        return { 
          id: eventDoc.id, 
          ...d, 
          userRole: membership?.role,
          createdAt: d.createdAt?.toDate ? d.createdAt.toDate() : new Date(d.createdAt),
          updatedAt: d.updatedAt?.toDate ? d.updatedAt.toDate() : new Date(d.updatedAt),
          startDate: d.startDate?.toDate ? d.startDate.toDate() : (d.startDate ? new Date(d.startDate) : undefined),
          endDate: d.endDate?.toDate ? d.endDate.toDate() : (d.endDate ? new Date(d.endDate) : undefined)
        } as (AppEvent & { userRole?: EventRole });
      } catch (e) {
        return null;
      }
    });

    const events = await Promise.all(eventPromises);
    return events.filter((e): e is (AppEvent & { userRole: EventRole }) => e !== null);

  } catch (error: any) {
    if (error.message === 'INDEX_MISSING') throw error;
    console.error("[Data] fetchUserEvents failed:", error);
    return [];
  }
}

/**
 * Récupère tous les événements de la plateforme.
 * Réservé aux owners par les règles Firestore.
 */
export async function fetchAllEvents(): Promise<AppEvent[]> {
  try {
    const snap = await getDocs(collection(db, 'events'));

    return snap.docs.map(d => {
      const data = d.data();
      return {
        id: d.id,
        ...data,
        createdAt: data.createdAt?.toDate ? data.createdAt.toDate() : new Date(data.createdAt),
        updatedAt: data.updatedAt?.toDate ? data.updatedAt.toDate() : new Date(data.updatedAt),
        startDate: data.startDate?.toDate ? data.startDate.toDate() : (data.startDate ? new Date(data.startDate) : undefined),
        endDate: data.endDate?.toDate ? data.endDate.toDate() : (data.endDate ? new Date(data.endDate) : undefined)
      } as AppEvent;
    });
  } catch (error) {
    console.error("[Data] fetchAllEvents failed:", error);
    return [];
  }
}

/**
 * Récupère tous les événements publiés pour le portail visiteur.
 */
export async function fetchPublishedEvents(): Promise<AppEvent[]> {
  try {
    const eventsRef = collection(db, 'events');
    const q = query(eventsRef, where('status', '==', 'published'));
    const snap = await getDocs(q);
    
    return snap.docs.map(d => {
      const data = d.data();
      return {
        id: d.id,
        ...data,
        createdAt: data.createdAt?.toDate ? data.createdAt.toDate() : new Date(data.createdAt),
        updatedAt: data.updatedAt?.toDate ? data.updatedAt.toDate() : new Date(data.updatedAt),
        startDate: data.startDate?.toDate ? data.startDate.toDate() : (data.startDate ? new Date(data.startDate) : undefined),
        endDate: data.endDate?.toDate ? data.endDate.toDate() : (data.endDate ? new Date(data.endDate) : undefined)
      } as AppEvent;
    });
  } catch (error) {
    console.error("[Data] Erreur fetchPublishedEvents:", error);
    return [];
  }
}

/**
 * Crée un nouvel événement et initialise sa structure de données.
 */
export async function createEvent(data: {
  name: string;
  slug: string;
  adminId: string;
  startDate?: Date;
  endDate?: Date;
  timezone?: string;
}): Promise<AppEvent> {
  const eventRef = doc(collection(db, 'events'));
  const id = eventRef.id;

  // On récupère le profil de l'admin pour la redondance dans members
  const userDoc = await getDoc(doc(db, 'users', data.adminId));
  const userData = userDoc.data();

  const eventData: {
    name: string;
    slug: string;
    adminId: string;
    status: 'draft';
    startDate?: Date;
    endDate?: Date;
    timezone: string;
    createdAt: ReturnType<typeof serverTimestamp>;
    updatedAt: ReturnType<typeof serverTimestamp>;
  } = {
    name: data.name,
    slug: data.slug.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, ''),
    adminId: data.adminId,
    status: 'draft' as const,
    timezone: data.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone || 'Europe/Paris',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  };

  if (data.startDate) {
    eventData.startDate = data.startDate;
  }

  if (data.endDate) {
    eventData.endDate = data.endDate;
  }

  try {
    await setDoc(eventRef, eventData);

    const batch = writeBatch(db);
    const memberRef = doc(db, `events/${id}/members`, data.adminId);
    batch.set(memberRef, {
      uid: data.adminId,
      role: 'admin',
      displayName: userData?.displayName || 'Créateur',
      email: userData?.email || '',
      photoURL: userData?.photoURL || null,
      joinedAt: serverTimestamp()
    });

    batch.set(doc(db, `events/${id}/config`, 'main'), {
      isLandingPageActive: true,
      reviewsEnabled: true
    });

    batch.set(doc(db, `events/${id}/config`, 'marketing'), {
      heroEnabled: false,
      heroTitle: `Bienvenue à ${data.name}`,
      heroSubtitle: "Découvrez l'application officielle du festival.",
      heroImageUrl: 'https://picsum.photos/seed/festival/1200/800',
      heroCtaText: 'Commencer',
      heroCtaMode: 'auth'
    });

    await batch.commit();
  } catch (error: any) {
    console.error('[Data] createEvent failed', {
      code: error?.code,
      message: error?.message,
      eventId: id,
      eventData,
      adminId: data.adminId
    });

    throw error;
  }

  return { id, ...eventData, createdAt: new Date(), updatedAt: new Date() } as AppEvent;
}

export async function updateEventDetails(
  eventId: string,
  data: Partial<Pick<AppEvent, 'name' | 'startDate' | 'endDate' | 'timezone' | 'city' | 'departmentCode' | 'departmentName' | 'region' | 'country'>>
): Promise<void> {
  const payload: Record<string, unknown> = {};

  Object.entries(data).forEach(([key, value]) => {
    payload[key] = value === undefined ? deleteField() : value;
  });

  await updateDoc(doc(db, 'events', eventId), {
    ...payload,
    updatedAt: serverTimestamp()
  });
}

export async function updateEventStatus(eventId: string, status: EventStatus): Promise<void> {
  await updateDoc(doc(db, 'events', eventId), {
    status,
    updatedAt: serverTimestamp()
  });
}

export const dbPaths = {
  pois: (eventId: string) => eventId === DEFAULT_EVENT_ID ? 'pois' : `events/${eventId}/pois`,
  poisPublic: (eventId: string) => eventId === DEFAULT_EVENT_ID ? 'pois_public' : `events/${eventId}/pois_public`,
  config: (eventId: string) => eventId === DEFAULT_EVENT_ID ? 'config' : `events/${eventId}/config`,
  members: (eventId: string) => `events/${eventId}/members`,
}

function sanitizeSponsorForFirestore(sponsor: POISponsor): POISponsor {
  const sanitized: POISponsor = {
    enabled: sponsor.enabled,
    level: sponsor.level,
    priority: sponsor.priority
  };

  if (sponsor.startDate) {
    sanitized.startDate = sponsor.startDate;
  }

  if (sponsor.endDate) {
    sanitized.endDate = sponsor.endDate;
  }

  return sanitized;
}

function sanitizePoiPayloadForFirestore<T extends Partial<Omit<POI, 'id' | 'averageRating' | 'reviewCount'>>>(poiData: T): T {
  if (!poiData.sponsor || typeof poiData.sponsor.enabled !== 'boolean') {
    return poiData;
  }

  return {
    ...poiData,
    sponsor: sanitizeSponsorForFirestore(poiData.sponsor)
  };
}

async function deleteCollectionDocs(path: string): Promise<void> {
  const snap = await getDocs(collection(db, path));
  let batch = writeBatch(db);
  let writes = 0;

  for (const document of snap.docs) {
    batch.delete(document.ref);
    writes += 1;

    if (writes === 450) {
      await batch.commit();
      batch = writeBatch(db);
      writes = 0;
    }
  }

  if (writes > 0) {
    await batch.commit();
  }
}

async function deleteStorageFolder(folderPath: string): Promise<void> {
  const folderRef = ref(storage, folderPath);
  const res = await listAll(folderRef);

  await Promise.all(res.items.map((itemRef) => deleteObject(itemRef)));
  await Promise.all(res.prefixes.map((prefixRef) => deleteStorageFolder(prefixRef.fullPath)));
}

// --- MEMBERS MANAGEMENT ---

export async function fetchEventMembers(eventId: string): Promise<EventMemberWithProfile[]> {
  try {
    const membersSnap = await getDocs(collection(db, `events/${eventId}/members`));
    // Plus besoin de lire /users, les données sont redondées dans le membre
    return membersSnap.docs.map(d => {
      const data = d.data();
      return {
        ...data,
        joinedAt: (data.joinedAt as any)?.toDate?.() || new Date(data.joinedAt)
      } as EventMemberWithProfile;
    });
  } catch (error) {
    console.error("[Data] fetchEventMembers failed:", error);
    return [];
  }
}

export async function inviteMemberToEvent(eventId: string, email: string, role: EventRole): Promise<void> {
  const usersRef = collection(db, 'users');
  const q = query(usersRef, where('email', '==', email.toLowerCase().trim()), limit(1));
  const userSnap = await getDocs(q);

  if (userSnap.empty) {
    throw new Error('USER_NOT_FOUND');
  }

  const userData = userSnap.docs[0].data();
  const uid = userData.uid;

  // On stocke les infos de profil directement dans le membre pour éviter les lectures croisées de collections
  const memberRef = doc(db, `events/${eventId}/members`, uid);
  await setDoc(memberRef, {
    uid,
    role,
    displayName: userData.displayName || 'Utilisateur',
    email: userData.email || '',
    photoURL: userData.photoURL || null,
    joinedAt: serverTimestamp()
  });
}

export async function updateEventMemberRole(eventId: string, uid: string, role: EventRole): Promise<void> {
  const memberRef = doc(db, `events/${eventId}/members`, uid);
  await updateDoc(memberRef, { role });
}

export async function removeEventMember(eventId: string, uid: string): Promise<void> {
  const memberRef = doc(db, `events/${eventId}/members`, uid);
  await deleteDoc(memberRef);
}

// --- CONFIG FUNCTIONS ---

export async function fetchAppConfig(eventId: string): Promise<AppConfig> {
  const path = dbPaths.config(eventId);

  try {
    const configRef = doc(db, path, 'main')
    const configSnap = await getDoc(configRef)
    
    if (configSnap.exists()) {
      return configSnap.data() as AppConfig;
    }
  } catch (e: any) {}
  
  return { isLandingPageActive: true, festivalMode: false, reviewsEnabled: true }
}

export async function updateAppConfig(config: Partial<AppConfig>, eventId: string): Promise<void> {
  const configRef = doc(db, dbPaths.config(eventId), 'main')
  try {
    await setDoc(configRef, config, { merge: true })
  } catch (serverError: any) {
    const permissionError = new FirestorePermissionError({ path: configRef.path, operation: 'update', requestResourceData: config })
    errorEmitter.emit('permission-error', permissionError)
    throw serverError
  }
}

export async function fetchMarketingConfig(eventId: string): Promise<MarketingConfig> {
  try {
    const configRef = doc(db, dbPaths.config(eventId), 'marketing')
    const configSnap = await getDoc(configRef)
    if (configSnap.exists()) return configSnap.data() as MarketingConfig
  } catch {}
  return {
    heroEnabled: false,
    heroTitle: 'Découvrez le festival',
    heroSubtitle: "Connectez-vous pour accéder à toutes les fonctionnalités.",
    heroImageUrl: 'https://picsum.photos/seed/marketing/1200/800',
    heroCtaText: 'Se connecter',
    heroCtaMode: 'auth'
  }
}

export async function updateMarketingConfig(config: Partial<MarketingConfig>, eventId: string): Promise<void> {
  const configRef = doc(db, dbPaths.config(eventId), 'marketing')
  try {
    await setDoc(configRef, config, { merge: true })
  } catch (serverError: any) {
    const permissionError = new FirestorePermissionError({ path: configRef.path, operation: 'update', requestResourceData: config })
    errorEmitter.emit('permission-error', permissionError)
    throw serverError
  }
}

// --- STORAGE FUNCTIONS ---

export async function uploadFile(file: File, path: string): Promise<{ url: string; path: string }> {
  const storageRef = ref(storage, path)
  const uploadResult = await uploadBytes(storageRef, file, { contentType: file.type || 'image/jpeg' })
  const url = await getDownloadURL(uploadResult.ref)
  return { url, path: uploadResult.ref.fullPath }
}

export async function deleteFileByPath(filePath: string): Promise<void> {
  const storageRef = ref(storage, filePath)
  try {
    await deleteObject(storageRef)
  } catch (error: any) {
    if (error.code !== 'storage/object-not-found') {
      console.warn('Could not delete file:', filePath);
    }
  }
}

// --- FIRESTORE FUNCTIONS ---

export async function createUserInFirestore(user: Omit<AppUser, 'role' | 'emailVerified' | 'isApproved'> & { role?: UserRole; isApproved?: boolean }): Promise<void> {
  const userRef = doc(db, 'users', user.uid)
  try {
    const userSnap = await getDoc(userRef)
    if (!userSnap.exists()) {
      const initialData = { uid: user.uid, email: user.email, displayName: user.displayName, photoURL: user.photoURL || null, role: user.role || 'user', isApproved: user.isApproved ?? false, createdAt: serverTimestamp() }
      await setDoc(userRef, initialData)
    } else {
      const syncData = { email: user.email, displayName: user.displayName, photoURL: user.photoURL || null, lastLogin: serverTimestamp() }
      await setDoc(userRef, syncData, { merge: true })
    }
  } catch (serverError: any) {
    const permissionError = new FirestorePermissionError({ path: userRef.path, operation: 'create', requestResourceData: user })
    errorEmitter.emit('permission-error', permissionError)
    throw serverError
  }
}

export async function updateUserApproval(uid: string, isApproved: boolean): Promise<void> {
  const userRef = doc(db, 'users', uid)
  try {
    await updateDoc(userRef, { isApproved })
  } catch (serverError: any) {
     const permissionError = new FirestorePermissionError({ path: userRef.path, operation: 'update', requestResourceData: { isApproved } })
    errorEmitter.emit('permission-error', permissionError)
    throw serverError
  }
}

export async function fetchPois(eventId: string): Promise<POI[]> {
  try {
    const poiCollection = collection(db, dbPaths.pois(eventId))
    const poiSnapshot = await getDocs(poiCollection)
    return poiSnapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() } as POI))
  } catch {
    return []
  }
}

export async function fetchPoisLite(eventId: string): Promise<POILite[]> {
  const colRef = collection(db, dbPaths.poisPublic(eventId))

  const mapSnap = (snap: { docs: Array<{ id: string; data: () => Record<string, unknown> }> }) =>
    snap.docs.map((d) => ({ id: d.id, ...d.data() } as POILite))

  try {
    const cacheSnap = await getDocsFromCache(colRef).catch(() => null)

    if (cacheSnap && !cacheSnap.empty) {
      const cached = mapSnap(cacheSnap)
      void getDocsFromServer(colRef).catch(() => {})
      return cached
    }

    const serverSnap = await getDocsFromServer(colRef)
    return mapSnap(serverSnap)
  } catch (e: any) {
    const full = await fetchPois(eventId)
    return full as unknown as POILite[]
  }
}

export async function fetchPoiById(id: string, eventId: string): Promise<POI | undefined> {
  try {
    const poiRef = doc(db, dbPaths.pois(eventId), id)
    const poiSnap = await getDoc(poiRef)
    if (poiSnap.exists()) return { id: poiSnap.id, ...poiSnap.data() } as POI
  } catch {}
  return undefined
}

export async function fetchReviewsByPoiId(poiId: string, eventId: string): Promise<Review[]> {
  try {
    const reviewsCollection = collection(db, dbPaths.pois(eventId), poiId, 'reviews')
    const reviewSnapshot = await getDocs(reviewsCollection)
    const reviewList = reviewSnapshot.docs.map((doc) => {
      const data = doc.data()
      const createdAt = data.createdAt?.toDate ? data.createdAt.toDate() : new Date(data.createdAt)
      return { id: doc.id, ...data, createdAt } as Review
    })
    return reviewList.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
  } catch {
    return []
  }
}

export async function addReview(poiId: string, reviewData: Omit<Review, 'id' | 'poiId' | 'createdAt'>, eventId: string): Promise<Review> {
  const reviewsCollection = collection(db, dbPaths.pois(eventId), poiId, 'reviews');
  try {
    const newReviewRef = await addDoc(reviewsCollection, {
      ...reviewData,
      poiId,
      createdAt: serverTimestamp()
    });
    return { id: newReviewRef.id, ...reviewData, createdAt: new Date(), poiId };
  } catch (e: any) {
    if (e.code?.includes('permission-denied')) {
      const permissionError = new FirestorePermissionError({ path: `${dbPaths.pois(eventId)}/${poiId}/reviews`, operation: 'create', requestResourceData: reviewData });
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
    return [];
  }
}

export async function updateUserRole(uid: string, role: UserRole): Promise<void> {
  const userRef = doc(db, 'users', uid)
  try {
    await updateDoc(userRef, { role })
  } catch (serverError) {
    const permissionError = new FirestorePermissionError({ path: userRef.path, operation: 'update', requestResourceData: { role } })
    errorEmitter.emit('permission-error', permissionError)
    throw serverError
  }
}

/**
 * Crée un POI et sa projection publique synchronisée.
 */
export async function createPoi(
  poiData: Omit<POI, 'id' | 'averageRating' | 'reviewCount'>,
  eventId: string
): Promise<string> {
  const poiCollection = collection(db, dbPaths.pois(eventId))
  const poiPublicCollection = collection(db, dbPaths.poisPublic(eventId))
  
  const id = doc(poiCollection).id;
  const sanitizedPoiData = sanitizePoiPayloadForFirestore(poiData);
  const fullPoiData = {
    ...sanitizedPoiData,
    averageRating: 0,
    reviewCount: 0
  }

  try {
    await runTransaction(db, async (tx) => {
      tx.set(doc(poiCollection, id), fullPoiData);
      const liteData: any = {
        id,
        title: fullPoiData.title,
        location: fullPoiData.location,
        mainCategory: fullPoiData.mainCategory,
        subCategory: fullPoiData.subCategory,
        averageRating: 0,
        reviewCount: 0,
        headerPhotoUrl: fullPoiData.headerPhotoUrl
      };
      
      if (fullPoiData.sponsor) {
        liteData.sponsor = fullPoiData.sponsor;
      }
      
      tx.set(doc(poiPublicCollection, id), liteData);
    });
  } catch (serverError: any) {
    console.error('[Data] createPoi failed', {
      code: serverError?.code,
      message: serverError?.message,
      eventId,
      poiId: id,
      poiData: sanitizedPoiData
    });
    const permissionError = new FirestorePermissionError({ path: `${dbPaths.pois(eventId)}/${id}`, operation: 'create', requestResourceData: sanitizedPoiData })
    errorEmitter.emit('permission-error', permissionError)
    throw serverError
  }

  return id;
}

/**
 * Met à jour un POI et sa projection publique.
 */
export async function updatePoi(
  poiId: string,
  poiData: Partial<Omit<POI, 'id' | 'averageRating' | 'reviewCount'>>,
  eventId: string
): Promise<void> {
  const poiRef = doc(db, dbPaths.pois(eventId), poiId)
  const poiPublicRef = doc(db, dbPaths.poisPublic(eventId), poiId)
  const sanitizedPoiData = sanitizePoiPayloadForFirestore(poiData)

  try {
    await runTransaction(db, async (tx) => {
      const currentSnap = await tx.get(poiRef);
      if (!currentSnap.exists()) return;
      
      const currentData = currentSnap.data() as POI;
      const updatedData = { ...currentData, ...sanitizedPoiData };

      tx.update(poiRef, sanitizedPoiData);
      tx.set(poiPublicRef, {
        id: poiId,
        title: updatedData.title,
        location: updatedData.location,
        mainCategory: updatedData.mainCategory,
        subCategory: updatedData.subCategory,
        averageRating: updatedData.averageRating,
        reviewCount: updatedData.reviewCount,
        sponsor: updatedData.sponsor,
        headerPhotoUrl: updatedData.headerPhotoUrl
      }, { merge: true });
    });
  } catch (serverError: any) {
    console.error('[Data] updatePoi failed', {
      code: serverError?.code,
      message: serverError?.message,
      eventId,
      poiId,
      poiData: sanitizedPoiData
    });
    const permissionError = new FirestorePermissionError({ path: poiRef.path, operation: 'update', requestResourceData: sanitizedPoiData })
    errorEmitter.emit('permission-error', permissionError)
    throw serverError
  }
}

export async function deletePoi(poiId: string, eventId: string): Promise<void> {
  const poiRef = doc(db, dbPaths.pois(eventId), poiId)
  const poiPublicRef = doc(db, dbPaths.poisPublic(eventId), poiId)
  const storagePrefix = eventId === DEFAULT_EVENT_ID ? '' : `events/${eventId}/`;
  const imagesFolderPath = `${storagePrefix}poi-images/${poiId}`

  try {
    await deleteCollectionDocs(`${dbPaths.pois(eventId)}/${poiId}/reviews`)

    await runTransaction(db, async (tx) => {
      tx.delete(poiRef);
      tx.delete(poiPublicRef);
    });

    await deleteStorageFolder(imagesFolderPath)
  } catch (serverError: any) {
    if (serverError.code?.includes('permission-denied')) {
      const permissionError = new FirestorePermissionError({ path: poiRef.path, operation: 'delete' })
      errorEmitter.emit('permission-error', permissionError)
    }
    throw serverError
  }
}

export async function deleteEvent(eventId: string): Promise<void> {
  const eventRef = doc(db, 'events', eventId)

  try {
    await updateDoc(eventRef, { updatedAt: serverTimestamp() })

    const poisSnap = await getDocs(collection(db, dbPaths.pois(eventId)))

    for (const poiDoc of poisSnap.docs) {
      await deletePoi(poiDoc.id, eventId)
    }

    await deleteCollectionDocs(dbPaths.poisPublic(eventId))
    await deleteCollectionDocs(dbPaths.config(eventId))
    await deleteCollectionDocs(dbPaths.members(eventId))

    await deleteStorageFolder(`events/${eventId}/poi-images`).catch((error: unknown) => {
      console.warn('Could not delete event storage folder:', error)
    })

    await deleteDoc(eventRef)
  } catch (serverError: unknown) {
    const permissionError = new FirestorePermissionError({ path: eventRef.path, operation: 'delete' })
    errorEmitter.emit('permission-error', permissionError)
    throw serverError
  }
}
