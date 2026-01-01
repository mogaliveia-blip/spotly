// src/lib/data.ts
import { db } from './firebase';
import { collection, doc, getDoc, getDocs, setDoc, updateDoc, deleteDoc, addDoc, serverTimestamp } from 'firebase/firestore';
import type { POI, Review, AppUser, UserRole } from './types';
import { placeholderImages } from './placeholder-images.json';
import { errorEmitter } from '@/firebase/error-emitter';
import { FirestorePermissionError } from '@/firebase/errors';


// --- VRAIES FONCTIONS FIRESTORE ---

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

export function addReview(poiId: string, review: Omit<Review, 'id' | 'poiId' | 'createdAt'>): void {
    const reviewsCollection = collection(db, 'pois', poiId, 'reviews');
    const newReviewData = {
        ...review,
        createdAt: serverTimestamp(),
    }
    
    addDoc(reviewsCollection, newReviewData).catch(async (serverError) => {
      const permissionError = new FirestorePermissionError({
        path: `pois/${poiId}/reviews`,
        operation: 'create',
        requestResourceData: newReviewData,
      });
      errorEmitter.emit('permission-error', permissionError);
    });
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

export function createPoi(poiData: Omit<POI, 'id' | 'averageRating' | 'reviewCount'>): void {
    const poiCollection = collection(db, 'pois');
    const newPoiData = {
        ...poiData,
        averageRating: 0,
        reviewCount: 0,
    }
    
    addDoc(poiCollection, newPoiData).catch(async (serverError) => {
      const permissionError = new FirestorePermissionError({
        path: 'pois',
        operation: 'create',
        requestResourceData: newPoiData,
      });
      errorEmitter.emit('permission-error', permissionError);
    });
}

export function updatePoi(poiId: string, poiData: Partial<POI>): void {
    const poiRef = doc(db, 'pois', poiId);
    updateDoc(poiRef, poiData).catch(async (serverError) => {
      const permissionError = new FirestorePermissionError({
        path: poiRef.path,
        operation: 'update',
        requestResourceData: poiData,
      });
      errorEmitter.emit('permission-error', permissionError);
    });
}

export function deletePoi(poiId: string): void {
    const poiRef = doc(db, 'pois', poiId);
    deleteDoc(poiRef).catch(async (serverError) => {
      const permissionError = new FirestorePermissionError({
        path: poiRef.path,
        operation: 'delete',
      });
      errorEmitter.emit('permission-error', permissionError);
    });
}
