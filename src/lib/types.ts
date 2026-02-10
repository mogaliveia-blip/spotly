// src/lib/types.ts
import type { User as FirebaseUser } from 'firebase/auth';

export type UserRole = 'user' | 'editor' | 'admin';

export interface AppUser {
  uid: string;
  email: string | null;
  displayName: string | null;
  role: UserRole;
  photoURL?: string | null;
}

export interface POI {
  id: string;
  title: string;
  description: string;
  headerPhotoUrl: string;
  galleryUrls: { url: string; path: string }[];
  location: {
    lat: number;
    lng: number;
  };
  averageRating: number;
  reviewCount: number;
}

export interface Review {
  id: string;
  poiId: string;
  userId: string;
  userDisplayName: string;
  userPhotoURL: string | null;
  rating: number;
  comment: string;
  createdAt: Date;
}

export interface AppConfig {
  isLandingPageActive: boolean;
}
