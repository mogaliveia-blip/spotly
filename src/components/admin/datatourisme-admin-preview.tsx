'use client';

import React, { useState } from 'react';
import { AlertCircle, Database, EyeOff, Info } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { PILOT_DEPARTMENTS, demoCandidatesForDepartments } from '@/lib/datatourisme-admin-demo';
import type { DemoCandidate, PilotDepartment } from '@/lib/datatourisme-admin-demo';

const metrics = [
  { label: 'Événements disponibles', detail: 'Analyse non connectée' },
  { label: 'Événements sélectionnés', detail: 'Aucune sélection réelle' },
  { label: 'Événements importés', detail: 'Importation non connectée' },
  { label: 'Événements publiés', detail: 'Publication non connectée' },
  { label: 'Dernière synchronisation', detail: 'Historique non connecté' },
] as const;

const futureActions = [
  { label: 'Analyser les données', detail: 'Lire les candidats et leurs motifs de qualité.' },
  { label: 'Sélectionner les événements', detail: 'Confirmer au plus 100 fiches bretonnes.' },
  { label: 'Importer', detail: 'Créer les fiches privées, sans les publier.' },
  { label: 'Publier dans Discovery', detail: 'Rendre visibles uniquement les fiches validées.' },
  { label: 'Synchroniser', detail: 'Appliquer seulement les différences contrôlées.' },
] as const;

const positionLabels: Record<DemoCandidate['positionPrecision'], string> = {
  source_gps: 'Coordonnées fournies par la source — précision à vérifier',
  address_geocoded: 'Position géocodée depuis une adresse',
  commune_center: 'Position approximative — centre de commune',
};

function dateLabel(day: string): string {
  return new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })
    .format(new Date(`${day}T12:00:00Z`));
}

function CandidateCard({ candidate }: { candidate: DemoCandidate }) {
  const status = candidate.decision === 'retenu' ? 'Retenu dans l’exemple' :
    candidate.decision === 'a_confirmer' ? 'À confirmer dans l’exemple' : 'Rejeté dans l’exemple';
  return <article className="rounded-xl border bg-card p-4 shadow-sm" aria-label={candidate.title}>
    <div className="flex flex-wrap items-start justify-between gap-2">
      <div>
        <h3 className="font-semibold leading-snug">{candidate.title}</h3>
        <p className="mt-1 text-sm text-muted-foreground">{dateLabel(candidate.startDay)}{candidate.endDay ? '' : ' · fin non renseignée'} · {candidate.city} ({candidate.department})</p>
      </div>
      <Badge variant={candidate.decision === 'rejete' ? 'destructive' : candidate.decision === 'retenu' ? 'secondary' : 'outline'}>{status}</Badge>
    </div>
    <div className="mt-3 flex flex-wrap gap-2">
      <Badge variant="outline">Exemple fictif</Badge>
      <Badge variant="outline">{candidate.category}</Badge>
      {candidate.possibleNativeDuplicate && <Badge variant="outline" className="border-amber-500 text-amber-900 dark:text-amber-200">Doublon possible</Badge>}
    </div>
    <dl className="mt-3 space-y-1 text-sm">
      <div><dt className="inline font-medium">Producteur : </dt><dd className="inline">{candidate.producer}</dd></div>
      <div><dt className="inline font-medium">Provenance : </dt><dd className="inline">{candidate.provenance}</dd></div>
      <div><dt className="inline font-medium">Localisation : </dt><dd className="inline">{positionLabels[candidate.positionPrecision]}</dd></div>
    </dl>
    {candidate.reason && <p className="mt-3 rounded-lg bg-muted/60 p-2 text-sm"><span className="font-medium">{candidate.decision === 'rejete' ? 'Motif de rejet' : 'Point de contrôle'} : </span>{candidate.reason}</p>}
  </article>;
}

export function DatatourismeAdminPreview() {
  const [departments, setDepartments] = useState<PilotDepartment[]>(PILOT_DEPARTMENTS.map((item) => item.code));
  const candidates = demoCandidatesForDepartments(departments);

  const toggleDepartment = (code: PilotDepartment, selected: boolean) => {
    setDepartments((current) => selected ? [...current, code] : current.filter((item) => item !== code));
  };

  return <div className="h-full overflow-y-auto p-4 sm:p-6">
    <div className="mx-auto max-w-6xl space-y-6 pb-10">
      <div className="space-y-2">
        <div className="flex items-center gap-2 text-primary"><Database className="h-5 w-5" aria-hidden="true" /><span className="text-sm font-semibold">Administration des sources externes</span></div>
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">DATAtourisme</h1>
        <p className="text-muted-foreground">Préparation du pilote Bretagne depuis l’espace Super Admin.</p>
      </div>

      <Alert className="border-amber-300 bg-amber-50 text-amber-950 dark:bg-amber-950/30 dark:text-amber-100">
        <Info className="h-4 w-4" aria-hidden="true" />
        <AlertTitle>Maquette locale — données entièrement fictives</AlertTitle>
        <AlertDescription>Aucune analyse DATAtourisme, importation, publication ou synchronisation n’est connectée. Les chiffres de production sont indisponibles.</AlertDescription>
      </Alert>

      <section aria-labelledby="pilot-scope-heading">
        <Card>
          <CardHeader>
            <CardTitle id="pilot-scope-heading">Périmètre du pilote</CardTitle>
            <CardDescription>Région Bretagne · plafond de 100 événements. Les cases filtrent seulement l’aperçu fictif de cette page.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap items-center gap-2"><span className="text-sm font-medium">Région</span><Badge variant="secondary">Bretagne</Badge><Badge variant="outline">100 événements maximum</Badge></div>
            <fieldset>
              <legend className="mb-2 text-sm font-medium">Départements de l’aperçu</legend>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {PILOT_DEPARTMENTS.map(({ code, name }) => <div key={code} className="flex items-center gap-2 rounded-lg border p-3">
                  <Checkbox id={`department-${code}`} checked={departments.includes(code)} onCheckedChange={(checked) => toggleDepartment(code, checked === true)} />
                  <Label htmlFor={`department-${code}`} className="cursor-pointer">{code} — {name}</Label>
                </div>)}
              </div>
            </fieldset>
          </CardContent>
        </Card>
      </section>

      <section aria-labelledby="pilot-dashboard-heading" className="space-y-3">
        <h2 id="pilot-dashboard-heading" className="text-xl font-semibold">Tableau de bord</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
          {metrics.map((metric) => <Card key={metric.label} className="rounded-xl">
            <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">{metric.label}</CardTitle></CardHeader>
            <CardContent><p className="text-2xl font-semibold" aria-label={`${metric.label} : indisponible`}>—</p><p className="text-xs text-muted-foreground">{metric.detail}</p></CardContent>
          </Card>)}
        </div>
      </section>

      <section aria-labelledby="pilot-candidates-heading" className="space-y-3">
        <div>
          <h2 id="pilot-candidates-heading" className="text-xl font-semibold">Qualité des candidats</h2>
          <p className="text-sm text-muted-foreground">{candidates.length} exemple{candidates.length > 1 ? 's' : ''} fictif{candidates.length > 1 ? 's' : ''} affiché{candidates.length > 1 ? 's' : ''} après filtre local. Aucun choix n’est enregistré.</p>
        </div>
        {candidates.length ? <div className="grid gap-3 lg:grid-cols-2">{candidates.map((candidate) => <CandidateCard key={candidate.id} candidate={candidate} />)}</div> :
          <p className="rounded-xl border bg-card p-5 text-sm text-muted-foreground">Sélectionnez un département pour voir les exemples fictifs.</p>}
      </section>

      <section aria-labelledby="pilot-actions-heading">
        <Card>
          <CardHeader>
            <CardTitle id="pilot-actions-heading">Opérations futures</CardTitle>
            <CardDescription>Chaque opération sera indépendante et contrôlée côté serveur. Aucun bouton ci-dessous n’est actif.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {futureActions.map((action, index) => <div key={action.label} className="flex flex-col gap-3 rounded-xl border p-3 sm:flex-row sm:items-center sm:justify-between">
              <div><p className="font-medium">{index + 1}. {action.label}</p><p className="text-sm text-muted-foreground">{action.detail}</p></div>
              <Button type="button" variant="outline" disabled className="shrink-0">{action.label}</Button>
            </div>)}
            <div className="flex flex-col gap-3 rounded-xl border p-3 sm:flex-row sm:items-center sm:justify-between">
              <div><p className="flex items-center gap-2 font-medium"><EyeOff className="h-4 w-4" aria-hidden="true" />6. Masquer les événements externes dans Discovery</p>
                <p className="text-sm text-muted-foreground">Interrupteur global futur, sans suppression systématique des fiches. Non disponible.</p></div>
              <Switch disabled checked={false} aria-label="Masquage global non disponible" />
            </div>
          </CardContent>
        </Card>
      </section>

      <p className="flex items-start gap-2 text-xs text-muted-foreground"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />L’accès visuel réservé au Super Admin ne remplace pas les contrôles d’authentification et de rôle requis dans les futures opérations serveur.</p>
    </div>
  </div>;
}
