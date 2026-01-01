// src/lib/data.ts
import { db } from './firebase';
import { doc, setDoc } from 'firebase/firestore';
import type { POI, Review, AppUser, UserRole } from './types';
import { placeholderImages } from './placeholder-images.json';

// REAL FIRESTORE FUNCTION
export async function createUserInFirestore(user: AppUser): Promise<void> {
  const userRef = doc(db, 'users', user.uid);
  // Using setDoc with merge: true is a good practice to avoid overwriting data if the doc exists.
  await setDoc(userRef, {
    uid: user.uid,
    email: user.email,
    displayName: user.displayName,
    role: user.role,
    photoURL: user.photoURL || null,
  }, { merge: true });
}


// --- MOCK DATA AND FUNCTIONS FOR POIs and REVIEWS ---
// In a real application, these would also be converted to use Firestore.

const mockPois: POI[] = [
  {
    id: 'main-stage',
    title: 'Main Stage',
    description: 'The heart of the festival! Catch the headlining acts here all day and night. Expect spectacular light shows and unforgettable performances.',
    headerPhotoUrl: placeholderImages[0].imageUrl,
    headerPhotoHint: placeholderImages[0].imageHint,
    galleryUrls: [
        { url: placeholderImages[1].imageUrl, hint: placeholderImages[1].imageHint },
        { url: placeholderImages[2].imageUrl, hint: placeholderImages[2].imageHint },
        { url: placeholderImages[3].imageUrl, hint: placeholderImages[3].imageHint },
    ],
    location: { lat: 48.8584, lng: 2.2945 }, // Eiffel Tower
    averageRating: 4.5,
    reviewCount: 120,
  },
  {
    id: 'food-truck-alley',
    title: 'Food Truck Alley',
    description: 'A culinary adventure awaits! Sample a diverse range of gourmet street food from the best local food trucks. From tacos to donuts, there\'s something for everyone.',
    headerPhotoUrl: placeholderImages[4].imageUrl,
    headerPhotoHint: placeholderImages[4].imageHint,
    galleryUrls: [
      { url: placeholderImages[5].imageUrl, hint: placeholderImages[5].imageHint },
      { url: placeholderImages[6].imageUrl, hint: placeholderImages[6].imageHint },
    ],
    location: { lat: 48.8606, lng: 2.3376 }, // Louvre
    averageRating: 4.8,
    reviewCount: 250,
  },
  {
    id: 'artisan-market',
    title: 'Artisan Market',
    description: 'Discover unique, handcrafted goods from local artists and creators. A perfect place to find a special souvenir or gift.',
    headerPhotoUrl: placeholderImages[7].imageUrl,
    headerPhotoHint: placeholderImages[7].imageHint,
    galleryUrls: [
       { url: placeholderImages[8].imageUrl, hint: placeholderImages[8].imageHint },
    ],
    location: { lat: 48.8530, lng: 2.3499 }, // Notre Dame
    averageRating: 4.2,
    reviewCount: 85,
  },
];

const mockReviews: { [key: string]: Review[] } = {
  'main-stage': [
    {
      id: 'review-1', poiId: 'main-stage', userId: 'user-1', userDisplayName: 'Alex', userPhotoURL: 'https://i.pravatar.cc/40?u=alex', rating: 5, comment: 'Absolutely electrifying! The sound system was incredible.', createdAt: new Date('2023-10-26T10:00:00Z')
    },
    {
      id: 'review-2', poiId: 'main-stage', userId: 'user-2', userDisplayName: 'Maria', userPhotoURL: 'https://i.pravatar.cc/40?u=maria', rating: 4, comment: 'Great performances, but a bit crowded near the front. The route from the main entrance was clear though.', createdAt: new Date('2023-10-26T11:30:00Z')
    },
    {
      id: 'review-3', poiId: 'main-stage', userId: 'user-3', userDisplayName: 'Sam', userPhotoURL: null, rating: 3, comment: 'The main path suggested by the app was blocked by a huge crowd for the merch tent. Had to take the long way around past the food trucks. Annoying!', createdAt: new Date()
    },
  ],
  'food-truck-alley': [
    {
      id: 'review-4', poiId: 'food-truck-alley', userId: 'user-4', userDisplayName: 'Chloe', userPhotoURL: 'https://i.pravatar.cc/40?u=chloe', rating: 5, comment: 'The gourmet grilled cheese was to die for! So many options.', createdAt: new Date('2023-10-26T12:00:00Z')
    },
  ],
  'artisan-market': [],
};

const mockUsers: AppUser[] = [
    { uid: '1', email: 'user@test.com', displayName: 'Normal User', role: 'user' },
    { uid: '2', email: 'editor@test.com', displayName: 'Content Editor', role: 'editor' },
    { uid: '3', email: 'admin@test.com', displayName: 'App Admin', role: 'admin' },
    { uid: '4', email: 'jane.doe@test.com', displayName: 'Jane Doe', role: 'user' },
    { uid: '5', email: 'john.smith@test.com', displayName: 'John Smith', role: 'user' },
];


// MOCK API FUNCTIONS
const delay = (ms: number) => new Promise(res => setTimeout(res, ms));

export async function fetchPois(): Promise<POI[]> {
  await delay(500);
  return mockPois;
}

export async function fetchPoiById(id: string): Promise<POI | undefined> {
  await delay(500);
  return mockPois.find(p => p.id === id);
}

export async function fetchReviewsByPoiId(poiId: string): Promise<Review[]> {
  await delay(500);
  return mockReviews[poiId] || [];
}

export async function addReview(poiId: string, review: Omit<Review, 'id' | 'poiId' | 'createdAt'>): Promise<Review> {
    await delay(1000);
    const newReview: Review = {
        ...review,
        id: `review-${Date.now()}`,
        poiId,
        createdAt: new Date(),
    };
    if (!mockReviews[poiId]) {
        mockReviews[poiId] = [];
    }
    mockReviews[poiId].unshift(newReview);
    return newReview;
}

export async function fetchUsers(): Promise<AppUser[]> {
    await delay(1000);
    return mockUsers;
}

export async function updateUserRole(uid: string, role: UserRole): Promise<AppUser> {
    await delay(500);
    const user = mockUsers.find(u => u.uid === uid);
    if (!user) {
        throw new Error("User not found");
    }
    user.role = role;
    return user;
}

export async function createPoi(poiData: Omit<POI, 'id' | 'averageRating' | 'reviewCount'>): Promise<POI> {
    await delay(1000);
    const newPoi: POI = {
        ...poiData,
        id: `poi-${Date.now()}`,
        averageRating: 0,
        reviewCount: 0,
    };
    mockPois.push(newPoi);
    return newPoi;
}

export async function updatePoi(poiId: string, poiData: Partial<POI>): Promise<POI> {
    await delay(1000);
    const poiIndex = mockPois.findIndex(p => p.id === poiId);
    if (poiIndex === -1) {
        throw new Error("POI not found");
    }
    mockPois[poiIndex] = { ...mockPois[poiIndex], ...poiData };
    return mockPois[poiIndex];
}

export async function deletePoi(poiId: string): Promise<void> {
    await delay(1000);
    const poiIndex = mockPois.findIndex(p => p.id === poiId);
    if (poiIndex === -1) {
        throw new Error("POI not found");
    }
    mockPois.splice(poiIndex, 1);
}
