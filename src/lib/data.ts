// src/lib/data.ts
import { db } from './firebase';
import { collection, doc, getDoc, getDocs, setDoc, updateDoc, deleteDoc, addDoc } from 'firebase/firestore';
import type { POI, Review, AppUser, UserRole } from './types';
import { placeholderImages } from './placeholder-images.json';
import { errorEmitter } from '@/firebase/error-emitter';
import { FirestorePermissionError } from '@/firebase/errors';


// --- VRAIES FONCTIONS FIRESTORE ---

export function createUserInFirestore(user: AppUser): void {
  const userRef = doc(db, 'users', user.uid);
  const userData = {
    uid: user.uid,
    email: user.email,
    displayName: user.displayName,
    role: user.role,
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
    const reviewList = reviewSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data(), createdAt: doc.data().createdAt.toDate() } as Review));
    return reviewList.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
}

export async function addReview(poiId: string, review: Omit<Review, 'id' | 'poiId' | 'createdAt'>): Promise<Review> {
    const reviewsCollection = collection(db, 'pois', poiId, 'reviews');
    const newReviewData = {
        ...review,
        createdAt: new Date(),
    }
    const docRef = await addDoc(reviewsCollection, newReviewData);
    return {
        id: docRef.id,
        poiId,
        ...newReviewData
    };
}


export async function fetchUsers(): Promise<AppUser[]> {
    const userCollection = collection(db, 'users');
    const userSnapshot = await getDocs(userCollection);
    return userSnapshot.docs.map(doc => doc.data() as AppUser);
}

export async function updateUserRole(uid: string, role: UserRole): Promise<void> {
    const userRef = doc(db, 'users', uid);
    await updateDoc(userRef, { role });
}

export async function createPoi(poiData: Omit<POI, 'id' | 'averageRating' | 'reviewCount'>): Promise<POI> {
    const poiCollection = collection(db, 'pois');
    const newPoiData = {
        ...poiData,
        averageRating: 0,
        reviewCount: 0,
    }
    const docRef = await addDoc(poiCollection, newPoiData);
    return {
        id: docRef.id,
        ...newPoiData,
    };
}

export async function updatePoi(poiId: string, poiData: Partial<POI>): Promise<POI> {
    const poiRef = doc(db, 'pois', poiId);
    await updateDoc(poiRef, poiData);
    const updatedDoc = await getDoc(poiRef);
    return { id: updatedDoc.id, ...updatedDoc.data() } as POI;
}

export async function deletePoi(poiId: string): Promise<void> {
    const poiRef = doc(db, 'pois', poiId);
    await deleteDoc(poiRef);
}