export const PILOT_DEPARTMENTS = [
  { code: '22', name: 'Côtes-d’Armor' },
  { code: '29', name: 'Finistère' },
  { code: '35', name: 'Ille-et-Vilaine' },
  { code: '56', name: 'Morbihan' },
] as const;

export type PilotDepartment = (typeof PILOT_DEPARTMENTS)[number]['code'];
export type DemoCandidate = {
  id: string;
  title: string;
  startDay: string;
  endDay?: string;
  city: string;
  department: PilotDepartment;
  category: string;
  producer: string;
  provenance: string;
  positionPrecision: 'source_gps' | 'address_geocoded' | 'commune_center';
  decision: 'retenu' | 'a_confirmer' | 'rejete';
  reason?: string;
  possibleNativeDuplicate?: boolean;
};

/** Presentation examples only: no DATAtourisme identifiers, real events or external links. */
export const DEMO_CANDIDATES: readonly DemoCandidate[] = [
  {
    id: 'demo_22', title: 'Balade fictive à Saint-Brieuc', startDay: '2027-06-14',
    city: 'Saint-Brieuc', department: '22', category: 'Nature',
    producer: 'Organisateur fictif A', provenance: 'Source fictive de démonstration',
    positionPrecision: 'commune_center', decision: 'retenu',
    reason: 'Début futur cohérent ; date de fin non renseignée.',
  },
  {
    id: 'demo_29', title: 'Concert fictif à Brest', startDay: '2027-06-18', endDay: '2027-06-18',
    city: 'Brest', department: '29', category: 'Musique',
    producer: 'Organisateur fictif B', provenance: 'Source fictive de démonstration',
    positionPrecision: 'source_gps', decision: 'retenu',
  },
  {
    id: 'demo_35', title: 'Marché fictif à Rennes', startDay: '2027-06-20', endDay: '2027-06-20',
    city: 'Rennes', department: '35', category: 'Gastronomie',
    producer: 'Organisateur fictif C', provenance: 'Source fictive de démonstration',
    positionPrecision: 'address_geocoded', decision: 'a_confirmer',
    possibleNativeDuplicate: true,
    reason: 'Ressemblance possible avec un Event natif : confirmation humaine requise, aucun masquage automatique.',
  },
  {
    id: 'demo_56', title: 'Atelier fictif à Vannes', startDay: '2027-06-22', endDay: '2027-06-22',
    city: 'Vannes', department: '56', category: 'Culture',
    producer: 'Non renseigné (exemple fictif)', provenance: 'Source fictive de démonstration',
    positionPrecision: 'source_gps', decision: 'rejete',
    reason: 'Producteur non renseigné : attribution insuffisante.',
  },
];

export function demoCandidatesForDepartments(departments: readonly PilotDepartment[]): DemoCandidate[] {
  return DEMO_CANDIDATES.filter((candidate) => departments.includes(candidate.department));
}
