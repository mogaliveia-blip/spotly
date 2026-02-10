// src/lib/data.ts
import { db, storage } from './firebase';
import { collection, doc, getDoc, getDocs, setDoc, updateDoc, deleteDoc, addDoc, serverTimestamp, runTransaction, Timestamp } from 'firebase/firestore';
import type { POI, Review, AppUser, UserRole, AppConfig } from './types';
import { errorEmitter } from '@/firebase/error-emitter';
import { FirestorePermissionError } from '@/firebase/errors';
import { ref, uploadBytes, getDownloadURL, deleteObject, listAll } from 'firebase/storage';

// --- CONFIG FUNCTIONS ---

/**
 * Fetches the global application configuration.
 * @returns A promise that resolves with the app configuration.
 */
export async function fetchAppConfig(): Promise<AppConfig> {
  const configRef = doc(db, 'config', 'main');
  const configSnap = await getDoc(configRef);
  if (configSnap.exists()) {
    return configSnap.data() as AppConfig;
  }
  // Default config if it doesn't exist
  return { isLandingPageActive: true };
}

/**
 * Updates the global application configuration.
 * @param config The partial config to update.
 */
export async function updateAppConfig(config: Partial<AppConfig>): Promise<void> {
  const configRef = doc(db, 'config', 'main');
   try {
    await setDoc(configRef, config, { merge: true });
  } catch (serverError: any) {
    const permissionError = new FirestorePermissionError({
      path: configRef.path,
      operation: 'update',
      requestResourceData: config,
    });
    errorEmitter.emit('permission-error', permissionError);
    throw serverError;
  }
}


// --- STORAGE FUNCTIONS ---

/**
 * Uploads a file to Firebase Storage.
 * @param file The file to upload.
 * @param path The path in Storage where the file will be saved.
 * @returns A promise that resolves with the download URL and the full path of the uploaded file.
 */
export async function uploadFile(file: File, path: string): Promise<{ url: string, path: string }> {
  const storageRef = ref(storage, path);
  // uploadBytes returns an UploadResult, and we should use its reference for getDownloadURL
  const uploadResult = await uploadBytes(storageRef, file, { contentType: file.type || 'image/jpeg' });
  const url = await getDownloadURL(uploadResult.ref);
  return { url, path: uploadResult.ref.fullPath };
}


/**
 * Deletes a file from Firebase Storage using its full path.
 * @param filePath The full path of the file to delete.
 */
export async function deleteFileByPath(filePath: string): Promise<void> {
    const storageRef = ref(storage, filePath);
    try {
        await deleteObject(storageRef);
    } catch (error: any) {
        // It's not critical if the file doesn't exist, so we can ignore 'object-not-found' errors.
        if (error.code !== 'storage/object-not-found') {
            console.error("Erreur lors de la suppression du fichier:", error);
            throw error;
        }
    }
}


// --- FIRESTORE FUNCTIONS ---

export async function createUserInFirestore(
  user: Omit<AppUser, 'role'> & { role?: UserRole }
): Promise<void> {
  const userRef = doc(db, 'users', user.uid);
  const userData = {
    uid: user.uid,
    email: user.email,
    displayName: user.displayName,
    role: user.role || 'user',
    photoURL: user.photoURL || null,
  };

  try {
    await setDoc(userRef, userData, { merge: true });
  } catch (serverError) {
    const permissionError = new FirestorePermissionError({
      path: userRef.path,
      operation: 'create',
      requestResourceData: userData,
    });
    errorEmitter.emit('permission-error', permissionError);
    throw serverError;
  }
}

export async function fetchPois(): Promise<POI[]> {
  const poiCollection = collection(db, 'pois');
  const poiSnapshot = await getDocs(poiCollection);
  const poiList = poiSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as POI));
  return poiList;
}

export async function fetchPoiById(id: string): Promise<POI | undefined> {
  const poiRef = doc(db, 'pois', id);
  const poiSnap = await getDoc(poiRef);
  if (poiSnap.exists()) {
    return { id: poiSnap.id, ...poiSnap.data() } as POI;
  }
  return undefined;
}

export async function fetchReviewsByPoiId(poiId: string): Promise<Review[]> {
    const reviewsCollection = collection(db, 'pois', poiId, 'reviews');
    const reviewSnapshot = await getDocs(reviewsCollection);
    const reviewList = reviewSnapshot.docs.map(doc => {
      const data = doc.data();
      // Handle both Timestamp and Date objects
      const createdAt = data.createdAt?.toDate ? data.createdAt.toDate() : new Date(data.createdAt);
      return { id: doc.id, ...data, createdAt } as Review;
    });
    return reviewList.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
}

export async function addReview(poiId: string, reviewData: Omit<Review, 'id' | 'poiId' | 'createdAt'>): Promise<Review> {
  const reviewsCollection = collection(db, 'pois', poiId, 'reviews');
  
  // Add the review to the subcollection
  const reviewWithTimestamp = {
      ...reviewData,
      poiId,
      createdAt: serverTimestamp(),
  };

  try {
    const newReviewRef = await addDoc(reviewsCollection, reviewWithTimestamp);
    // Return the optimistic review object for UI update
    return {
        id: newReviewRef.id,
        ...reviewData,
        createdAt: new Date(), // Use local date for immediate UI update
        poiId,
    };
  } catch (e: any) {
    if (e.code && e.code.includes('permission-denied')) {
        const permissionError = new FirestorePermissionError({
            path: `pois/${poiId}/reviews`,
            operation: 'create',
            requestResourceData: reviewData,
        });
        errorEmitter.emit('permission-error', permissionError);
    }
    throw e;
  }
}


export async function fetchUsers(): Promise<AppUser[]> {
    const userCollection = collection(db, 'users');
    const userSnapshot = await getDocs(userCollection);
    return userSnapshot.docs.map(doc => doc.data() as AppUser);
}

export function updateUserRole(uid: string, role: UserRole): void {
    const userRef = doc(db, 'users', uid);
    updateDoc(userRef, { role }).catch(async (serverError) => {
      const permissionError = new FirestorePermissionError({
        path: userRef.path,
        operation: 'update',
        requestResourceData: { role },
      });
      errorEmitter.emit('permission-error', permissionError);
    });
}

export async function createPoi(poiData: Omit<POI, 'id'>): Promise<string> {
    const poiCollection = collection(db, 'pois');
    const docRef = await addDoc(poiCollection, poiData);
    return docRef.id;
}


export async function updatePoi(poiId: string, poiData: Partial<POI>): Promise<void> {
    const poiRef = doc(db, 'pois', poiId);
    try {
      await updateDoc(poiRef, poiData);
    } catch (serverError: any) {
      const permissionError = new FirestorePermissionError({
        path: poiRef.path,
        operation: 'update',
        requestResourceData: poiData,
      });
      errorEmitter.emit('permission-error', permissionError);
      throw serverError;
    }
}

export async function deletePoi(poiId: string): Promise<void> {
  const poiRef = doc(db, 'pois', poiId);
  const imagesFolderRef = ref(storage, `poi-images/${poiId}`);

  try {
    // Delete Firestore document first
    await deleteDoc(poiRef);

    // Then delete all files in the corresponding Storage folder
    const res = await listAll(imagesFolderRef);
    const deletePromises = res.items.map((itemRef) => deleteObject(itemRef));
    // Also delete items in subfolders (like gallery)
    const subfolderPromises = res.prefixes.map(async (folderRef) => {
      const subfolderItems = await listAll(folderRef);
      return subfolderItems.items.map((itemRef) => deleteObject(itemRef));
    });
    
    await Promise.all([...deletePromises, ...(await Promise.all(subfolderPromises)).flat()]);
    
  } catch (serverError: any) {
    // Handle potential permission errors for both Firestore and Storage
    if (serverError.code?.includes('permission-denied')) {
        const permissionError = new FirestorePermissionError({
            path: poiRef.path,
            operation: 'delete',
        });
        errorEmitter.emit('permission-error', permissionError);
    } else {
        console.error("Erreur lors de la suppression du POI et de ses images", serverError);
    }
    throw serverError; // Re-throw the error to be caught by the caller
  }
}
