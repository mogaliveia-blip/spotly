// src/lib/sponsor-utils.ts
import type { POI, POISponsor } from './types';

// Helper to handle Firestore Timestamps or JS Dates
const getJsDate = (date: any): Date | null => {
  if (!date) return null;
  if (date.toDate) return date.toDate(); // Firestore Timestamp
  if (date instanceof Date) return date;   // JS Date
  return null;
};

/**
 * Checks if a POI's sponsorship is currently active.
 * @param poi The POI to check.
 * @returns True if the sponsor is active, false otherwise.
 */
export function isSponsorActive(poi: POI): boolean {
  if (!poi.sponsor || !poi.sponsor.enabled) {
    return false;
  }
  const now = new Date();
  
  const startDate = getJsDate(poi.sponsor.startDate);
  const endDate = getJsDate(poi.sponsor.endDate);
  
  if (!startDate && !endDate) {
    return true; // Active if no dates are set
  }
  
  const isAfterStart = startDate ? now >= startDate : true;
  const isBeforeEnd = endDate ? now <= endDate : true;

  return isAfterStart && isBeforeEnd;
}

/**
 * Gets the display label for a given sponsorship level.
 * @param level The sponsorship level.
 * @returns The display string for the label.
 */
export function getSponsorLabel(level: 'standard' | 'premium' | 'official'): string {
    switch (level) {
        case 'standard': return 'Sponsor';
        case 'premium': return 'Sponsor Premium';
        case 'official': return 'Partenaire Officiel';
        default: return '';
    }
}

/**
 * Gets the badge variant for a given sponsorship level.
 * @param level The sponsorship level.
 * @returns The variant name for the Badge component.
 */
export function getSponsorVariant(level: 'standard' | 'premium' | 'official'): 'secondary' | 'default' | 'destructive' {
     switch (level) {
        case 'standard': return 'secondary';
        case 'premium': return 'default';
        case 'official': return 'destructive';
        default: return 'secondary';
    }
}
