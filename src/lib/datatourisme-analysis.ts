import { httpsCallable } from 'firebase/functions';
import { functions } from './firebase';
import type { PilotDepartment } from './datatourisme-admin-demo';

export type SourceTerm = { key: string | null; label: string | null };

export type AnalysisCandidate = {
  id: string;
  title: string | null;
  description: string | null;
  startDay: string | null;
  endDay: string | null;
  city: string | null;
  department: string | null;
  category: string | null;
  subcategory: string | null;
  // Optional until the enriched Function contract is deployed.
  sourceTypes?: SourceTerm[];
  sourceThemes?: SourceTerm[];
  producer: string | null;
  provenance: string | null;
  location: { lat: number; lng: number } | null;
  positionPrecision: 'source_coordinates' | 'address_only' | 'commune_only' | 'unknown';
  updatedAt: string | null;
  sourceUrl: string | null;
  quality: 'acceptable' | 'a_verifier' | 'rejete';
  reasons: string[];
  possibleDuplicate: boolean;
};

export type AnalysisResult = {
  candidates: AnalysisCandidate[];
  meta: { department: PilotDepartment; page: number; pageSize: number; examinedCount: number; apiTotal: number; hasNextPage: boolean };
};

export async function analyzeDatatourismeData(department: PilotDepartment, page: number): Promise<AnalysisResult> {
  const callable = httpsCallable<{ department: PilotDepartment; page: number }, AnalysisResult>(
    functions, 'analyzeDatatourismeData', { timeout: 30000 }
  );
  return (await callable({ department, page })).data;
}
