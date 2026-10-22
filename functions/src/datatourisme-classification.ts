import type { DiscoveryCategoryId } from './event-discovery';

type SourceTerm = { key: string | null; label: string | null };
type ClassificationSource = { category: string | null; sourceTypes?: SourceTerm[]; sourceThemes?: SourceTerm[] };

export type ClassificationProposal = {
  categoryId: DiscoveryCategoryId | null;
  editorialType: string | null;
  needsReview: boolean;
  reason: string | null;
  completeTypes: boolean;
};

function normalized(value: string | null | undefined): string {
  return (value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/[^a-z0-9]/g, '');
}

const generic = new Set(['product', 'pointofinterest', 'placeofinterest', 'event', 'entertainmentandevent']);
const known = new Set([
  'concert', 'musicevent', 'opera', 'theaterevent', 'showevent', 'culturalevent',
  'exhibition', 'exhibitionevent', 'conference', 'sportsevent', 'sportscompetition',
  'rambling', 'visit', 'culturalsite', 'naturalheritage', 'traineeship', 'practice',
  'market', 'festival', 'childrensevent', 'sportsandleisureplace'
]);

/** A proposal is advisory; missing or conflicting source types always require review. */
export function classifyDatatourisme(candidate: ClassificationSource): ClassificationProposal {
  const completeTypes = Array.isArray(candidate.sourceTypes);
  const types = new Set((completeTypes ? candidate.sourceTypes! : [{ key: null, label: candidate.category }])
    .map((term) => normalized(term.key ?? term.label)).filter(Boolean));
  const themes = new Set((candidate.sourceThemes ?? []).map((term) => normalized(term.key ?? term.label)).filter(Boolean));
  const has = (key: string) => types.has(key);
  const music = has('concert') || has('musicevent') || has('opera');
  const theater = has('theaterevent');
  const show = has('showevent');
  const sport = has('sportsevent') || has('sportscompetition');
  const rambling = has('rambling');
  const visit = has('visit');
  const training = has('traineeship') || has('practice');
  const market = has('market');
  const festival = has('festival');
  const cultural = has('culturalevent') || has('exhibition') || has('exhibitionevent') || has('conference');
  const foodTheme = ['gastronomy', 'food', 'foodanddrink'].some((key) => themes.has(key));
  const categories = new Set<DiscoveryCategoryId>();

  if (music) categories.add('music');
  if (theater || (show && !music) || (cultural && !music)) categories.add('culture');
  if (sport) categories.add('sport');
  if (rambling && !sport) categories.add('nature');
  if (visit && has('culturalsite')) categories.add('culture');
  if (visit && has('naturalheritage')) categories.add('nature');
  if (visit && !has('culturalsite') && !has('naturalheritage')) {
    if (themes.has('culture')) categories.add('culture');
    if (themes.has('nature')) categories.add('nature');
  }
  if (market && foodTheme) categories.add('gastronomy');

  const conflicting = categories.size > 1 || (market && categories.size > 0 && !categories.has('gastronomy'));
  const ambiguousVisit = rambling && visit;
  const unknown = [...types].some((key) => !generic.has(key) && !known.has(key));
  const editorialConflict = training && (show || theater || music) ||
    market && (music || theater || show || sport || rambling || visit);
  let editorialType: string | null = null;
  if (!conflicting && !ambiguousVisit && !unknown && !editorialConflict) {
    if (theater) editorialType = 'Théâtre';
    else if (music) editorialType = has('concert') ? 'Concert' : 'Événement musical';
    else if (show) editorialType = 'Spectacle';
    else if (rambling) editorialType = sport ? 'Randonnée' : 'Balade';
    else if (training) editorialType = has('traineeship') ? 'Stage / atelier' : 'Atelier';
    else if (market) editorialType = 'Marché';
    else if (festival) editorialType = 'Festival';
    else if (visit) editorialType = has('culturalsite') ? 'Visite patrimoniale' : 'Visite';
    else if (sport) editorialType = 'Événement sportif';
    else if (has('exhibition') || has('exhibitionevent')) editorialType = 'Exposition';
    else if (has('conference')) editorialType = 'Conférence';
  }

  const categoryId = conflicting || ambiguousVisit || unknown ? null : [...categories][0] ?? null;
  let reason: string | null = null;
  if (conflicting) reason = 'Types précis contradictoires : catégorie à vérifier.';
  else if (ambiguousVisit) reason = 'Balade et visite combinées : vérifier la nature de l’activité.';
  else if (unknown) reason = 'Type source non reconnu : vérifier la classification.';
  else if (!categoryId) reason = 'Types insuffisants pour déterminer une catégorie Discovery.';
  else if (editorialConflict) reason = 'Type éditorial ambigu : vérifier les activités décrites.';
  else if (!completeTypes) reason = 'Réponse actuelle limitée au premier type source : vérifier les autres types sur la fiche.';
  return { categoryId, editorialType, needsReview: reason !== null, reason, completeTypes };
}
