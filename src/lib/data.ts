// src/lib/data.ts
import { db, storage } from './firebase';
import { collection, doc, getDoc, getDocs, setDoc, updateDoc, deleteDoc, addDoc, serverTimestamp, runTransaction, Timestamp } from 'firebase/firestore';
import type { POI, Review, AppUser, UserRole } from './types';
import { errorEmitter } from '@/firebase/error-emitter';
import { FirestorePermissionError } from '@/firebase/errors';
import { ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';

// --- STORAGE FUNCTIONS ---

/**
 * Uploads a file to Firebase Storage.
 * @param file The file to upload.
 * @param path The path in Storage where the file will be saved.
 * @returns A promise that resolves with the download URL and the full path of the uploaded file.
 */
export async function uploadFile(file: File, path: string): Promise<{ url: string, path: string }> {
  const storageRef = ref(storage, path);
  await uploadBytes(storageRef, file, { contentType: file.type });
  const url = await getDownloadURL(storageRef);
  return { url, path: storageRef.fullPath };
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

export function createUserInFirestore(user: Omit<AppUser, 'role'> & { role?: UserRole }): void {
  const userRef = doc(db, 'users', user.uid);
  const userData = {
    uid: user.uid,
    email: user.email,
    displayName: user.displayName,
    role: user.role || 'user', // Default to 'user' role
    photoURL: user.photoURL || null,
  };

  setDoc(userRef, userData, { merge: true }).catch(async (serverError) => {
    const permissionError = new FirestorePermissionError({
      path: userRef.path,
      operation: 'create',
      requestResourceData: userData,
    });
    errorEmitter.emit('permission-error', permissionError);
  });
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
  const poiRef = doc(db, 'pois', poiId);
  const reviewsCollection = collection(db, 'pois', poiId, 'reviews');
  
  // 1. Add the review to the subcollection
  const reviewWithTimestamp = {
      ...reviewData,
      poiId,
      createdAt: serverTimestamp(),
  };
  const newReviewRef = await addDoc(reviewsCollection, reviewWithTimestamp).catch(e => {
    if (e.code && e.code.includes('permission-denied')) {
        const permissionError = new FirestorePermissionError({
            path: `pois/${poiId}/reviews`,
            operation: 'create',
            requestResourceData: reviewData,
        });
        errorEmitter.emit('permission-error', permissionError);
    }
    throw e;
  });

  // 2. Update the aggregate data on the POI document in a transaction
  try {
    await runTransaction(db, async (transaction) => {
      const poiDoc = await transaction.get(poiRef);
      if (!poiDoc.exists()) {
        throw "Le POI n'existe pas !";
      }

      const poiData = poiDoc.data() as POI;
      const newReviewCount = (poiData.reviewCount || 0) + 1;
      const oldRatingTotal = (poiData.averageRating || 0) * (poiData.reviewCount || 0);
      const newAverageRating = (oldRatingTotal + reviewData.rating) / newReviewCount;

      transaction.update(poiRef, {
        reviewCount: newReviewCount,
        averageRating: newAverageRating,
      });
    });
  } catch (e) {
      console.error("Échec de la mise à jour de l'évaluation moyenne, mais l'avis a été ajouté.", e);
      // The review is already added, so we don't throw. We can handle this state later if needed.
  }

  // 3. Return the optimistic review object
  return {
      id: newReviewRef.id,
      ...reviewData,
      createdAt: new Date(), // Use local date for immediate UI update
      poiId,
  };
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

export function deletePoi(poiId: string): void {
    const poiRef = doc(db, 'pois', poiId);
    // TODO: Delete associated images in Storage using a Cloud Function.
    deleteDoc(poiRef).catch(async (serverError) => {
      const permissionError = new FirestorePermissionError({
        path: poiRef.path,
        operation: 'delete',
      });
      errorEmitter.emit('permission-error', permissionError);
    });
}
