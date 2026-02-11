// src/lib/types.ts
import type { User as FirebaseUser } from 'firebase/auth';

export type UserRole = 'user' | 'editor' | 'admin';

export interface AppUser {
  uid: string;
  email: string | null;
  displayName: string | null;
  role: UserRole;
  photoURL?: string | null;
  emailVerified: boolean;
}

export type MainCategory =
  | 'programmation'
  | 'nourriture_boissons'
  | 'services_essentiels'
  | 'logistique_mobilite'
  | 'merchandising_partenaires'
  | 'espaces_specifiques';

export type SubCategory =
  | 'concert_headliner'
  | 'concert_scene_secondaire'
  | 'spectacle_rue'
  | 'dj_set'
  | 'food_truck'
  | 'restaurant'
  | 'bar'
  | 'buvette'
  | 'toilettes'
  | 'poste_secours'
  | 'securite'
  | 'point_eau'
  | 'entree_principale'
  | 'parking'
  | 'navette'
  | 'info_point'
  | 'acces_pmr'
  | 'boutique_officielle'
  | 'stand_partenaire'
  | 'sponsor'
  | 'espace_vip'
  | 'espace_enfant'
  | 'zone_detente'
  | 'backstage';

export const categoriesMap: Record<MainCategory, { label: string; subCategories: Partial<Record<SubCategory, string>> }> = {
  programmation: {
    label: 'Programmation',
    subCategories: {
      concert_headliner: 'Concert Headliner',
      concert_scene_secondaire: 'Concert Scène Secondaire',
      spectacle_rue: 'Spectacle de Rue',
      dj_set: 'DJ Set',
    },
  },
  nourriture_boissons: {
    label: 'Nourriture & Boissons',
    subCategories: {
      food_truck: 'Food Truck',
      restaurant: 'Restaurant',
      bar: 'Bar',
      buvette: 'Buvette',
    },
  },
  services_essentiels: {
    label: 'Services Essentiels',
    subCategories: {
      toilettes: 'Toilettes',
      poste_secours: 'Poste de Secours',
      securite: 'Sécurité',
      point_eau: "Point d'eau",
    },
  },
  logistique_mobilite: {
    label: 'Logistique & Mobilité',
    subCategories: {
      entree_principale: 'Entrée Principale',
      parking: 'Parking',
      navette: 'Navette',
      info_point: 'Point Info',
      acces_pmr: 'Accès PMR',
    },
  },
  merchandising_partenaires: {
    label: 'Merchandising & Partenaires',
    subCategories: {
      boutique_officielle: 'Boutique Officielle',
      stand_partenaire: 'Stand Partenaire',
      sponsor: 'Sponsor',
    },
  },
  espaces_specifiques: {
    label: 'Espaces Spécifiques',
    subCategories: {
      espace_vip: 'Espace VIP',
      espace_enfant: 'Espace Enfants',
      zone_detente: 'Zone Détente',
      backstage: 'Backstage',
    },
  },
};


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
  mainCategory: MainCategory;
  subCategory: SubCategory;
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
