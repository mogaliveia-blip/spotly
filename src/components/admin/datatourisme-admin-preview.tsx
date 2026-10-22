'use client';

import React, { useState } from 'react';
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

function CandidateCard({ candidate }: { candidate: AnalysisCandidate }) {
  return <article className="rounded-xl border bg-card p-4 shadow-sm" aria-label={candidate.title ?? candidate.id}>
    <div className="flex flex-wrap items-start justify-between gap-2">
      <div><h3 className="font-semibold leading-snug">{candidate.title ?? 'Titre absent'}</h3>
        <p className="mt-1 text-sm text-muted-foreground">{candidate.startDay ?? 'Date inconnue'}{candidate.endDay ? ` → ${candidate.endDay}` : ' · fin non renseignée'} · {candidate.city ?? 'Commune inconnue'} ({candidate.department ?? 'département inconnu'})</p></div>
      <Badge variant={candidate.quality === 'rejete' ? 'destructive' : candidate.quality === 'acceptable' ? 'secondary' : 'outline'}>{qualityLabels[candidate.quality]}</Badge>
    </div>
    <div className="mt-3 flex flex-wrap gap-2"><Badge variant="outline">{candidate.category ?? 'Catégorie inconnue'}</Badge>
      {candidate.subcategory && <Badge variant="outline">{candidate.subcategory}</Badge>}
      {candidate.possibleDuplicate && <Badge variant="outline">Doublon possible</Badge>}</div>
    <dl className="mt-3 space-y-1 text-sm">
      <div><dt className="inline font-medium">Identifiant source : </dt><dd className="inline">{candidate.id}</dd></div>
      <div><dt className="inline font-medium">Description : </dt><dd className="inline">{candidate.description ?? 'Non renseignée'}</dd></div>
      <div><dt className="inline font-medium">Producteur : </dt><dd className="inline">{candidate.producer ?? 'Non renseigné'}</dd></div>
      <div><dt className="inline font-medium">Provenance : </dt><dd className="inline">{candidate.provenance ?? 'Non renseignée'}</dd></div>
      <div><dt className="inline font-medium">Localisation : </dt><dd className="inline">{positionLabels[candidate.positionPrecision]}{candidate.location ? ` (${candidate.location.lat}, ${candidate.location.lng})` : ''}</dd></div>
      <div><dt className="inline font-medium">Mise à jour : </dt><dd className="inline">{candidate.updatedAt ?? 'Non renseignée'}</dd></div>
      {candidate.sourceUrl && <div><dt className="inline font-medium">Source : </dt><dd className="inline"><a className="underline" href={candidate.sourceUrl} target="_blank" rel="noopener noreferrer">Voir la fiche source</a></dd></div>}
    </dl>
    {candidate.reasons.length > 0 && <p className="mt-3 rounded-lg bg-muted/60 p-2 text-sm"><span className="font-medium">{candidate.quality === 'rejete' ? 'Motif de rejet' : 'Points de contrôle'} : </span>{candidate.reasons.join(' ')}</p>}
  </article>;
}

export function DatatourismeAdminPreview() {
  const [department, setDepartment] = useState<PilotDepartment>('22');
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const analyze = async (page = 1) => {
    setLoading(true);
    setError(null);
    if (page === 1) setResult(null);
    try { setResult(await analyzeDatatourismeData(department, page)); }
    catch (caught) { setError(errorMessage(caught)); }
    finally { setLoading(false); }
  };

  const changeDepartment = (value: PilotDepartment) => {
    setDepartment(value);
    setResult(null);
    setError(null);
  };

  return <div className="h-full overflow-y-auto p-4 sm:p-6"><div className="mx-auto max-w-6xl space-y-6 pb-10">
    <div className="space-y-2"><div className="flex items-center gap-2 text-primary"><Database className="h-5 w-5" aria-hidden="true" /><span className="text-sm font-semibold">Administration des sources externes</span></div>
      <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">DATAtourisme</h1><p className="text-muted-foreground">Analyse en lecture seule des événements du pilote Bretagne.</p></div>
    <Alert className="border-amber-300 bg-amber-50 text-amber-950 dark:bg-amber-950/30 dark:text-amber-100"><Info className="h-4 w-4" aria-hidden="true" /><AlertTitle>Analyse sans importation</AlertTitle>
      <AlertDescription>Les résultats sont consultatifs. Aucune fiche n’est importée ni publiée. Les doublons signalés concernent seulement la page examinée.</AlertDescription></Alert>
    <Card><CardHeader><CardTitle>Périmètre du pilote</CardTitle><CardDescription>Choisissez un département. Chaque analyse examine au plus 25 fiches sur une page ; cinq pages au maximum. Le plafond de 100 événements concerne le futur pilote d’importation.</CardDescription></CardHeader>
      <CardContent className="flex flex-wrap items-end gap-3"><div className="space-y-1"><label htmlFor="datatourisme-department" className="text-sm font-medium">Département</label>
        <select id="datatourisme-department" className="flex h-10 rounded-md border bg-background px-3 text-sm" value={department} disabled={loading} onChange={(event) => changeDepartment(event.target.value as PilotDepartment)}>
          {PILOT_DEPARTMENTS.map((item) => <option key={item.code} value={item.code}>{item.code} — {item.name}</option>)}</select></div>
        <Button type="button" disabled={loading} onClick={() => void analyze()}>{loading ? 'Analyse en cours…' : 'Analyser les données'}</Button></CardContent></Card>
    {error && <Alert variant="destructive" role="alert"><AlertTitle>Analyse impossible</AlertTitle><AlertDescription>{error}</AlertDescription></Alert>}
    {result && <section aria-label="Résultats de l’analyse" className="space-y-3"><div><h2 className="text-xl font-semibold">Qualité des candidats</h2>
      <p className="text-sm text-muted-foreground">Département {result.meta.department} · page {result.meta.page} · {result.meta.examinedCount} événements examinés sur cette page · {result.meta.apiTotal} annoncés par l’API pour ce département. Aucun résultat n’est conservé.</p></div>
      <div className="grid gap-3 lg:grid-cols-2">{result.candidates.map((candidate, index) => <CandidateCard key={`${candidate.id}-${index}`} candidate={candidate} />)}</div>
      {!result.candidates.length && <p className="rounded-xl border p-5 text-sm text-muted-foreground">Aucun événement sur cette page.</p>}
      {result.meta.hasNextPage && <Button type="button" variant="outline" disabled={loading} onClick={() => void analyze(result.meta.page + 1)}>Page suivante</Button>}</section>}
    <Card><CardHeader><CardTitle>Opérations futures</CardTitle><CardDescription>Ces actions restent désactivées.</CardDescription></CardHeader><CardContent className="space-y-3">
      {['Sélectionner les événements', 'Importer', 'Publier dans Discovery', 'Synchroniser'].map((action) => <div key={action} className="flex items-center justify-between gap-3 rounded-xl border p-3"><span className="font-medium">{action}</span><Button type="button" variant="outline" disabled>{action}</Button></div>)}
      <div className="flex items-center justify-between gap-3 rounded-xl border p-3"><span className="flex items-center gap-2 font-medium"><EyeOff className="h-4 w-4" />Masquer les événements externes dans Discovery</span><Switch disabled checked={false} aria-label="Masquage global non disponible" /></div>
    </CardContent></Card>
  </div></div>;
}
