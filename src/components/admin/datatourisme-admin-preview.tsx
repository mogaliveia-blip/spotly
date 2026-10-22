'use client';

import React, { useReducer, useState } from 'react';
import { FirebaseError } from 'firebase/app';
import { Database, EyeOff, Info } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { analyzeDatatourismeData } from '@/lib/datatourisme-analysis';
import type { AnalysisCandidate, AnalysisResult } from '@/lib/datatourisme-analysis';
import { PILOT_DEPARTMENTS } from '@/lib/datatourisme-admin-demo';
import type { PilotDepartment } from '@/lib/datatourisme-admin-demo';
import { classifyDatatourisme } from '@/lib/datatourisme-classification';
import { discoveryCategories } from '@/lib/event-discovery';
import type { DiscoveryCategoryId } from '@/lib/event-discovery';
import {
  datatourismeSelectionReducer, hasTechnicalCategory, hasUsableSourceId,
  isReadyForFuturePreparation, MAX_DATATOURISME_SELECTION, needsEditorialConfirmation,
  summarizeDatatourismeSelection
} from '@/lib/datatourisme-selection';
import type { SelectedCandidate } from '@/lib/datatourisme-selection';

const qualityLabels = { acceptable: 'Acceptable', a_verifier: 'À vérifier', rejete: 'Rejeté' } as const;
const positionLabels = {
  source_coordinates: 'Coordonnées fournies par la source — précision à vérifier',
  address_only: 'Adresse renseignée, sans coordonnées',
  commune_only: 'Commune renseignée, sans position précise',
  unknown: 'Localisation non renseignée',
} as const;

function errorMessage(error: unknown): string {
  const code = error instanceof FirebaseError ? error.code : '';
  if (code === 'functions/unauthenticated') return 'Connectez-vous pour analyser les données.';
  if (code === 'functions/permission-denied') return 'Cette action est réservée au Super Admin.';
  if (code === 'functions/invalid-argument') return 'Département ou page non valide.';
  if (code === 'functions/not-found') return 'La fonction d’analyse n’est pas encore disponible.';
  if (code === 'functions/failed-precondition') return 'La connexion DATAtourisme n’est pas encore configurée.';
  if (code === 'functions/resource-exhausted') return 'Limite DATAtourisme atteinte. Réessayez plus tard.';
  return 'Analyse indisponible pour le moment. Réessayez plus tard.';
}

function rejectionReviewKey(candidate: AnalysisCandidate, department: PilotDepartment): string {
  return JSON.stringify([department, candidate.id, candidate.reasons]);
}

type CandidateCardProps = {
  candidate: AnalysisCandidate;
  examinedDepartment: PilotDepartment;
  selected: SelectedCandidate | undefined;
  selectionFull: boolean;
  rejectionReviewed: boolean;
  onAdd: (candidate: AnalysisCandidate, department: PilotDepartment, rejectionReviewed: boolean) => void;
  onRemove: (id: string) => void;
  onReviewRejected: (key: string, reviewed: boolean) => void;
  onCategoryChange: (id: string, categoryId: DiscoveryCategoryId | null) => void;
  onConfirm: (id: string, confirmed: boolean) => void;
};

function CandidateCard({
  candidate, examinedDepartment, selected, selectionFull, rejectionReviewed,
  onAdd, onRemove, onReviewRejected, onCategoryChange, onConfirm
}: CandidateCardProps) {
  const usableId = hasUsableSourceId(candidate);
  const editorialCandidate = selected?.candidate ?? candidate;
  const proposal = classifyDatatourisme(editorialCandidate);
  const proposedCategory = discoveryCategories.find((item) => item.id === proposal.categoryId)?.label ?? null;
  const requiresConfirmation = needsEditorialConfirmation(editorialCandidate);
  const reviewKey = rejectionReviewKey(candidate, examinedDepartment);
  return <article className="rounded-xl border bg-card p-4 shadow-sm" aria-label={candidate.title ?? candidate.id}>
    <div className="flex flex-wrap items-start justify-between gap-2">
      <div><h3 className="font-semibold leading-snug">{candidate.title ?? 'Titre absent'}</h3>
        <p className="mt-1 text-sm text-muted-foreground">{candidate.startDay ?? 'Date inconnue'}{candidate.endDay ? ` → ${candidate.endDay}` : ' · fin non renseignée'} · {candidate.city ?? 'Commune inconnue'} ({candidate.department ?? 'département inconnu'})</p></div>
      <Badge variant={candidate.quality === 'rejete' ? 'destructive' : candidate.quality === 'acceptable' ? 'secondary' : 'outline'}>{qualityLabels[candidate.quality]}</Badge>
    </div>
    <div className="mt-3 flex flex-wrap gap-2"><Badge variant="outline">{candidate.category ?? 'Catégorie source inconnue'}</Badge>
      {candidate.subcategory && <Badge variant="outline">{candidate.subcategory}</Badge>}
      {candidate.possibleDuplicate && <Badge variant="outline">Doublon possible sur la page examinée</Badge>}
      {selected && <Badge variant="secondary">Sélection temporaire</Badge>}</div>
    <dl className="mt-3 space-y-1 text-sm">
      <div><dt className="inline font-medium">Identifiant source : </dt><dd className="inline">{candidate.id}</dd></div>
      <div><dt className="inline font-medium">Catégorie DATAtourisme d’origine : </dt><dd className="inline">{candidate.category ?? 'Non renseignée'}{candidate.subcategory ? ` · ${candidate.subcategory}` : ''}</dd></div>
      {candidate.sourceTypes && <div><dt className="inline font-medium">Tous les types source : </dt><dd className="inline">{candidate.sourceTypes.map((term) => term.label ?? term.key).join(', ') || 'Non renseignés'}</dd></div>}
      {candidate.sourceThemes && <div><dt className="inline font-medium">Thèmes source : </dt><dd className="inline">{candidate.sourceThemes.map((term) => term.label ?? term.key).join(', ') || 'Non renseignés'}</dd></div>}
      <div><dt className="inline font-medium">Catégorie Discovery proposée automatiquement : </dt><dd className="inline">{proposedCategory ?? 'Aucune proposition fiable'}</dd></div>
      <div><dt className="inline font-medium">Type éditorial identifié : </dt><dd className="inline">{proposal.editorialType ?? 'À préciser'}</dd></div>
      <div><dt className="inline font-medium">Début : </dt><dd className="inline">{candidate.startDay ?? 'Non renseigné'}</dd><dt className="inline font-medium"> · Fin : </dt><dd className="inline">{candidate.endDay ?? 'Non renseignée'}</dd></div>
      <div><dt className="inline font-medium">Commune : </dt><dd className="inline">{candidate.city ?? 'Non renseignée'} · département source {candidate.department ?? 'inconnu'}</dd></div>
      <div><dt className="inline font-medium">Description : </dt><dd className="inline">{candidate.description ?? 'Non renseignée'}</dd></div>
      <div><dt className="inline font-medium">Producteur : </dt><dd className="inline">{candidate.producer ?? 'Non renseigné'}</dd></div>
      <div><dt className="inline font-medium">Provenance : </dt><dd className="inline">{candidate.provenance ?? 'Non renseignée'}</dd></div>
      <div><dt className="inline font-medium">Précision géographique : </dt><dd className="inline">{positionLabels[candidate.positionPrecision]}{candidate.location ? ` (${candidate.location.lat}, ${candidate.location.lng})` : ''}</dd></div>
      <div><dt className="inline font-medium">Mise à jour : </dt><dd className="inline">{candidate.updatedAt ?? 'Non renseignée'}</dd></div>
      {candidate.sourceUrl && <div><dt className="inline font-medium">Source : </dt><dd className="inline"><a className="underline" href={candidate.sourceUrl} target="_blank" rel="noopener noreferrer">Voir la fiche source</a></dd></div>}
    </dl>
    {candidate.reasons.length > 0 && <p className="mt-3 rounded-lg bg-muted/60 p-2 text-sm"><span className="font-medium">{candidate.quality === 'rejete' ? 'Motif de rejet' : 'Points de contrôle'} : </span>{candidate.reasons.join(' ')}</p>}
    {proposal.needsReview && <p className="mt-3 rounded-lg bg-amber-50 p-2 text-sm text-amber-950 dark:bg-amber-950/30 dark:text-amber-100"><span className="font-medium">Classification à vérifier : </span>{proposal.reason}</p>}
    {hasTechnicalCategory(candidate) && <p className="mt-3 rounded-lg bg-amber-50 p-2 text-sm text-amber-950 dark:bg-amber-950/30 dark:text-amber-100">Libellé source générique : l’analyse ne restitue qu’une catégorie. Consulter la fiche source, si disponible, pour examiner les autres types et informations avant de choisir une catégorie Discovery. Aucune correspondance automatique.</p>}
    {selected && selected.candidate !== candidate && <p className="mt-3 text-sm text-muted-foreground">Cet identifiant est déjà sélectionné depuis le département {selected.examinedDepartment}. Le récapitulatif conserve la première fiche examinée.</p>}
    {selected ? <div className="mt-3 space-y-2">
      <label className="block text-sm font-medium">{selected.categoryManuallySet ? 'Catégorie Discovery retenue · choix du Super Admin' : proposal.categoryId ? 'Catégorie Discovery retenue · proposition modifiable' : 'Catégorie Discovery à choisir manuellement'}
        <select className="mt-1 flex h-10 w-full rounded-md border bg-background px-3 text-sm" value={selected.categoryId ?? ''}
          onChange={(event) => onCategoryChange(candidate.id, event.target.value ? event.target.value as DiscoveryCategoryId : null)}>
          <option value="">À déterminer</option>
          {discoveryCategories.map((category) => <option key={category.id} value={category.id}>{category.label}</option>)}
        </select>
      </label>
      {editorialCandidate.quality !== 'rejete' && requiresConfirmation && <label className="flex items-start gap-2 text-sm"><input type="checkbox" className="mt-1" checked={selected.confirmed}
        onChange={(event) => onConfirm(candidate.id, event.target.checked)} />Je confirme cette fiche après vérification éditoriale des points signalés.</label>}
      <p className="text-sm text-muted-foreground">{editorialCandidate.quality === 'rejete' ? 'Motifs réexaminés : cette fiche reste rejetée et ne sera pas considérée comme prête.' : isReadyForFuturePreparation(selected) ? 'Préparation éditoriale complète pour une étape future ; aucune importation.' : 'Sélection à compléter avant une étape future ; aucune importation.'}</p>
    </div> : <p className="mt-3 text-sm text-muted-foreground">La catégorie proposée peut être corrigée après sélection ; aucune importation.</p>}
    {!selected && candidate.quality === 'rejete' && usableId && <label className="mt-3 flex items-start gap-2 text-sm"><input type="checkbox" className="mt-1" checked={rejectionReviewed}
      onChange={(event) => onReviewRejected(reviewKey, event.target.checked)} />J’ai réexaminé les motifs de rejet ci-dessus. Je conserve cette fiche uniquement pour suivi éditorial.</label>}
    {!usableId && <p className="mt-3 text-sm text-destructive">Identifiant source absent : sélection impossible.</p>}
    <div className="mt-3"><Button type="button" variant={selected ? 'outline' : 'secondary'}
      disabled={!selected && (!usableId || selectionFull || (candidate.quality === 'rejete' && !rejectionReviewed))}
      onClick={() => selected ? onRemove(candidate.id) : onAdd(candidate, examinedDepartment, rejectionReviewed)}>
      {selected ? 'Retirer de la sélection' : 'Sélectionner temporairement'}
    </Button>{!selected && selectionFull && <p className="mt-1 text-sm text-muted-foreground">Plafond de 100 fiches sélectionnées atteint.</p>}</div>
  </article>;
}

export function DatatourismeAdminPreview() {
  const [department, setDepartment] = useState<PilotDepartment>('22');
  const [resultsByPage, setResultsByPage] = useState<Record<string, AnalysisResult>>({});
  const [page, setPage] = useState<number | null>(null);
  const [selection, dispatchSelection] = useReducer(datatourismeSelectionReducer, new Map<string, SelectedCandidate>());
  const [reviewedRejected, setReviewedRejected] = useState<Set<string>>(() => new Set());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const result = page === null ? null : resultsByPage[`${department}:${page}`] ?? null;
  const summary = summarizeDatatourismeSelection(selection);
  const selectionFull = selection.size >= MAX_DATATOURISME_SELECTION;

  const cardActions = {
    selectionFull,
    onAdd: (candidate: AnalysisCandidate, examinedDepartment: PilotDepartment, rejectionReviewed: boolean) =>
      dispatchSelection({ type: 'add', candidate, department: examinedDepartment, rejectionReviewed }),
    onRemove: (id: string) => dispatchSelection({ type: 'remove', id }),
    onReviewRejected: (key: string, reviewed: boolean) => setReviewedRejected((previous) => {
      const next = new Set(previous);
      if (reviewed) next.add(key);
      else next.delete(key);
      return next;
    }),
    onCategoryChange: (id: string, categoryId: DiscoveryCategoryId | null) => dispatchSelection({ type: 'category', id, categoryId }),
    onConfirm: (id: string, confirmed: boolean) => dispatchSelection({ type: 'confirm', id, confirmed }),
  };

  const analyze = async (targetPage = 1) => {
    const key = `${department}:${targetPage}`;
    if (resultsByPage[key]) {
      setPage(targetPage);
      setError(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const analyzed = await analyzeDatatourismeData(department, targetPage);
      setResultsByPage((previous) => ({ ...previous, [key]: analyzed }));
      setPage(targetPage);
    }
    catch (caught) { setError(errorMessage(caught)); }
    finally { setLoading(false); }
  };

  const changeDepartment = (value: PilotDepartment) => {
    setDepartment(value);
    setPage(resultsByPage[`${value}:1`] ? 1 : null);
    setError(null);
  };

  return <div className="h-full overflow-y-auto p-4 sm:p-6"><div className="mx-auto max-w-6xl space-y-6 pb-10">
    <div className="space-y-2"><div className="flex items-center gap-2 text-primary"><Database className="h-5 w-5" aria-hidden="true" /><span className="text-sm font-semibold">Administration des sources externes</span></div>
      <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">DATAtourisme</h1><p className="text-muted-foreground">Analyser → Examiner → Sélectionner → Voir la sélection.</p></div>
    <Alert className="border-amber-300 bg-amber-50 text-amber-950 dark:bg-amber-950/30 dark:text-amber-100"><Info className="h-4 w-4" aria-hidden="true" /><AlertTitle>Analyse sans importation</AlertTitle>
      <AlertDescription>Les résultats et les choix sont consultatifs. La sélection reste en mémoire de cette page et peut disparaître à l’actualisation. Aucune fiche n’est enregistrée, importée ni publiée. Les doublons signalés concernent seulement la page examinée.</AlertDescription></Alert>
    <Card><CardHeader><CardTitle>Périmètre du pilote</CardTitle><CardDescription>Choisissez un département. Chaque analyse examine au plus 25 fiches sur une page ; cinq pages au maximum par département. Sélection temporaire : {selection.size}/{MAX_DATATOURISME_SELECTION} fiches pour le pilote Bretagne.</CardDescription></CardHeader>
      <CardContent className="flex flex-wrap items-end gap-3"><div className="space-y-1"><label htmlFor="datatourisme-department" className="text-sm font-medium">Département</label>
        <select id="datatourisme-department" className="flex h-10 rounded-md border bg-background px-3 text-sm" value={department} disabled={loading} onChange={(event) => changeDepartment(event.target.value as PilotDepartment)}>
          {PILOT_DEPARTMENTS.map((item) => <option key={item.code} value={item.code}>{item.code} — {item.name}</option>)}</select></div>
        <Button type="button" disabled={loading} onClick={() => void analyze()}>{loading ? 'Analyse en cours…' : result ? 'Voir la page 1 analysée' : 'Analyser les données'}</Button>
        <Button asChild variant="outline"><a href="#datatourisme-selection">Voir la sélection ({selection.size})</a></Button></CardContent></Card>
    {error && <Alert variant="destructive" role="alert"><AlertTitle>Analyse impossible</AlertTitle><AlertDescription>{error}</AlertDescription></Alert>}
    {result && <section aria-label="Résultats de l’analyse" className="space-y-3"><div><h2 className="text-xl font-semibold">Qualité des candidats</h2>
      <p className="text-sm text-muted-foreground">Département {result.meta.department} · page {result.meta.page} · {result.meta.examinedCount} événements examinés sur cette page · {result.meta.apiTotal} annoncés par l’API pour ce département. Analyse partielle ; résultats déjà reçus conservés seulement en mémoire de cette page.</p></div>
      <div className="grid gap-3 lg:grid-cols-2">{result.candidates.map((candidate, index) => <CandidateCard key={`${candidate.id}-${index}`} candidate={candidate} examinedDepartment={result.meta.department}
        selected={selection.get(candidate.id)} rejectionReviewed={reviewedRejected.has(rejectionReviewKey(candidate, result.meta.department))} {...cardActions} />)}</div>
      {!result.candidates.length && <p className="rounded-xl border p-5 text-sm text-muted-foreground">Aucun événement sur cette page.</p>}
      <div className="flex gap-2">{result.meta.page > 1 && <Button type="button" variant="outline" disabled={loading} onClick={() => void analyze(result.meta.page - 1)}>Page précédente</Button>}
        {result.meta.hasNextPage && <Button type="button" variant="outline" disabled={loading} onClick={() => void analyze(result.meta.page + 1)}>Page suivante</Button>}</div></section>}
    <section id="datatourisme-selection" aria-label="Sélection éditoriale temporaire" className="space-y-3 scroll-mt-6">
      <div><h2 className="text-xl font-semibold">Sélection éditoriale temporaire · {selection.size}/{MAX_DATATOURISME_SELECTION}</h2>
        <p className="text-sm text-muted-foreground">Choix conservés uniquement tant que cette page reste ouverte. Aucune sauvegarde Firestore, aucune importation et aucune publication.</p></div>
      <div className="grid gap-3 rounded-xl border p-4 text-sm sm:grid-cols-2 lg:grid-cols-4">
        {PILOT_DEPARTMENTS.map((item) => <p key={item.code}>{item.code} — {item.name} : <strong>{summary.departments[item.code]}</strong></p>)}
        <p>Fiches acceptables : <strong>{summary.acceptable}</strong></p>
        <p>Confirmation attendue : <strong>{summary.pendingConfirmation}</strong></p>
        <p>Catégorie Discovery à définir : <strong>{summary.categoriesToDefine}</strong></p>
        <p>Doublons possibles signalés : <strong>{summary.possibleDuplicates}</strong></p>
        <p>Rejetées après réexamen : <strong>{summary.rejectedAfterReview}</strong></p>
        <p>Préparation éditoriale complète : <strong>{summary.readyForFuturePreparation}</strong></p>
      </div>
      {selection.size ? <div className="grid gap-3 lg:grid-cols-2">{Array.from(selection.values()).map((entry) => <CandidateCard key={entry.candidate.id} candidate={entry.candidate}
        examinedDepartment={entry.examinedDepartment} selected={entry} rejectionReviewed={true} {...cardActions} />)}</div> :
        <p className="rounded-xl border p-5 text-sm text-muted-foreground">Aucune fiche sélectionnée. Analysez une page, puis examinez et sélectionnez des candidats.</p>}
    </section>
    <Card><CardHeader><CardTitle>Opérations futures</CardTitle><CardDescription>Ces actions restent désactivées.</CardDescription></CardHeader><CardContent className="space-y-3">
      {['Importer', 'Publier dans Discovery', 'Synchroniser'].map((action) => <div key={action} className="flex items-center justify-between gap-3 rounded-xl border p-3"><span className="font-medium">{action}</span><Button type="button" variant="outline" disabled>{action}</Button></div>)}
      <div className="flex items-center justify-between gap-3 rounded-xl border p-3"><span className="flex items-center gap-2 font-medium"><EyeOff className="h-4 w-4" />Masquer les événements externes dans Discovery</span><Switch disabled checked={false} aria-label="Masquage global non disponible" /></div>
    </CardContent></Card>
  </div></div>;
}
