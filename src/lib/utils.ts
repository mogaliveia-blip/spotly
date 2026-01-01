import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}


/**
 * Calcule la distance entre deux points géographiques en kilomètres.
 * Utilise la formule de Haversine.
 * @param lat1 Latitude du premier point.
 * @param lon1 Longitude du premier point.
 * @param lat2 Latitude du deuxième point.
 * @param lon2 Longitude du deuxième point.
 * @returns La distance en kilomètres.
 */
export function getDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371; // Rayon de la Terre en km
  const dLat = deg2rad(lat2 - lat1);
  const dLon = deg2rad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(deg2rad(lat1)) * Math.cos(deg2rad(lat2)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const d = R * c; // Distance en km
  return d;
}

function deg2rad(deg: number): number {
  return deg * (Math.PI / 180);
}
