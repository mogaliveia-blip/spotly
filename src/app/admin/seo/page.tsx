'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import {
  AlertTriangle,
  Braces,
  Check,
  CheckCircle2,
  CircleDashed,
  ExternalLink,
  FileSearch,
  Globe2,
  Link2,
  ListChecks,
  Loader2,
  Search,
  Share2,
  ShieldCheck,
  Tags,
} from 'lucide-react'

import { AppLayout } from '@/components/layout/app-layout'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { useAuth } from '@/hooks/use-auth-user'
import { canAccessPlatformAdmin } from '@/lib/access-control'

const SITE_URL = 'https://uninstantici.com'

type StatusTone = 'ok' | 'watch' | 'info'

type TrackedPage = {
  name: string
  scope: string
  indexation: string
  indexationTone: StatusTone
  canonical: string
  metadata: string
  openGraph: string
  jsonLd: string
  sitemap: string
  note: string
}

const primaryKeywords = [
  'carte interactive événement',
  'carte événement',
  'plan interactif événement',
  'application événementielle',
  'guide événementiel',
]

const secondaryKeywords = [
  'carte festival',
  'plan festival',
  'carte mariage',
  'événement privé',
  'événement public',
  'carte séminaire',
  'points d’intérêt événement',
  'guide événement mobile',
  'QR code événement',
  'carte interactive mobile',
]

const trackedPages: TrackedPage[] = [
  {
    name: 'Homepage',
    scope: '/',
    indexation: 'Indexable',
    indexationTone: 'ok',
    canonical: SITE_URL,
    metadata: 'Title et description dédiés',
    openGraph: 'Open Graph + Twitter',
    jsonLd: 'WebApplication présent',
    sitemap: 'Oui',
    note: 'Fondation SEO publique principale.',
  },
  {
    name: 'Contact',
    scope: '/contact',
    indexation: 'Indexable',
    indexationTone: 'ok',
    canonical: `${SITE_URL}/contact`,
    metadata: 'Title et description dédiés',
    openGraph: 'Non défini spécifiquement',
    jsonLd: 'Absent — non requis en V1',
    sitemap: 'Oui',
    note: 'Canonical explicite ; partage social à surveiller si le besoin apparaît.',
  },
  {
    name: 'Événements publics',
    scope: '/{eventSlug}/dashboard',
    indexation: 'Indexable si published + public',
    indexationTone: 'ok',
    canonical: 'URL dynamique de l’événement',
    metadata: 'Title et description dynamiques',
    openGraph: 'Open Graph + Twitter dynamiques',
    jsonLd: 'Absent',
    sitemap: 'Non en V1',
    note: 'Aucune expiration SEO automatique basée sur les dates.',
  },
  {
    name: 'POI publics',
    scope: '/{eventSlug}/dashboard?poi={poiId}',
    indexation: 'noindex, follow',
    indexationTone: 'info',
    canonical: 'URL dynamique avec ?poi=',
    metadata: 'Title et description dynamiques',
    openGraph: 'Open Graph + Twitter dynamiques',
    jsonLd: 'Absent',
    sitemap: 'Non',
    note: 'Le noindex évite de créer des pages concurrentes indexées pour chaque paramètre.',
  },
  {
    name: 'Événements privés',
    scope: '/{eventSlug}/dashboard',
    indexation: 'noindex, nofollow',
    indexationTone: 'info',
    canonical: 'URL événement sans token',
    metadata: 'Preview contrôlée ou fallback générique',
    openGraph: 'Preview sociale contrôlée',
    jsonLd: 'Absent',
    sitemap: 'Non',
    note: 'Un aperçu WhatsApp autorisé ne rend pas l’événement indexable.',
  },
  {
    name: 'Pages admin',
    scope: '/admin/* et /{eventSlug}/admin/*',
    indexation: 'noindex, nofollow',
    indexationTone: 'info',
    canonical: 'Non défini volontairement',
    metadata: 'Robots portés par les layouts admin',
    openGraph: 'Non pertinent',
    jsonLd: 'Absent',
    sitemap: 'Non',
    note: 'Accès fonctionnel protégé séparément du contrôle robots.',
  },
  {
    name: 'Pages auth',
    scope: '/login, /signup, /access-pending, /dashboard',
    indexation: 'noindex, nofollow',
    indexationTone: 'info',
    canonical: 'Non défini volontairement',
    metadata: 'Robots dédiés par page ou layout',
    openGraph: 'Non pertinent',
    jsonLd: 'Absent',
    sitemap: 'Non',
    note: 'Les parcours de compte restent hors index.',
  },
]

const technicalChecks = [
  'Domaine canonique HTTPS : uninstantici.com',
  'metadataBase alignée sur le domaine canonique',
  'Homepage : title, description et canonical dédiés',
  'robots.txt autorise le public et référence sitemap.xml',
  'sitemap.xml contient uniquement / et /contact en V1',
  'Open Graph et Twitter configurés sur la homepage et les contenus dynamiques',
  'JSON-LD WebApplication présent sur la homepage',
  'Pages admin et auth en noindex, nofollow',
  'Événements privés, brouillons et en pause en noindex, nofollow',
  'POI via ?poi= en noindex, follow',
]

const contentChecklist = [
  { label: 'H1 homepage cohérent avec la proposition de valeur', done: true },
  { label: 'Description homepage claire et orientée événement', done: true },
  { label: 'Mots-clés cibles documentés', done: true },
  { label: 'Créer les futures pages métier pour les organisateurs', done: false },
  { label: 'Préparer les cas d’usage festival, mariage, trail et événement public', done: false },
]

const eventChecklist = [
  'Définir la politique SEO des événements terminés',
  'Étudier l’ajout des événements publics pertinents au sitemap',
  'Définir une politique d’archives événementielles',
]

const googleChecklist = [
  'Connecter ou configurer Search Console manuellement',
  'Soumettre https://uninstantici.com/sitemap.xml',
  'Inspecter les URLs publiques après mise en production',
  'Suivre l’indexation du domaine sans automatisation V1',
]

function StatusBadge({ tone, children }: { tone: StatusTone; children: React.ReactNode }) {
  if (tone === 'ok') {
    return <Badge className="border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-50">{children}</Badge>
  }

  if (tone === 'watch') {
    return <Badge className="border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-50">{children}</Badge>
  }

  return <Badge variant="secondary">{children}</Badge>
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid gap-1 border-b border-border/60 py-3 last:border-0 sm:grid-cols-[9rem_minmax(0,1fr)] sm:gap-4">
      <dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className="min-w-0 break-words text-sm font-medium text-foreground">{value}</dd>
    </div>
  )
}

function ChecklistItem({ label, done = false }: { label: string; done?: boolean }) {
  const Icon = done ? CheckCircle2 : CircleDashed

  return (
    <li className="flex items-start gap-3 text-sm leading-6">
      <Icon className={done ? 'mt-0.5 h-4 w-4 shrink-0 text-emerald-600' : 'mt-0.5 h-4 w-4 shrink-0 text-amber-600'} />
      <span>{label}</span>
    </li>
  )
}

export default function SeoAdminPage() {
  const { firebaseUser, role, loading, profileLoading } = useAuth()
  const router = useRouter()
  const canAccess = canAccessPlatformAdmin(role)
  const authOrProfileLoading = loading || (!!firebaseUser && profileLoading)

  useEffect(() => {
    if (!authOrProfileLoading && !canAccess) {
      router.replace('/dashboard')
    }
  }, [authOrProfileLoading, canAccess, router])

  if (authOrProfileLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" aria-label="Validation de l’accès owner" />
      </div>
    )
  }

  if (!canAccess) return null

  return (
    <AppLayout>
      <div className="h-full overflow-y-auto">
        <main className="mx-auto w-full max-w-7xl space-y-8 px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
          <header className="space-y-4">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-primary">
                  <Search className="h-5 w-5" />
                  <span className="text-xs font-bold uppercase tracking-[0.2em]">Contrôle interne</span>
                </div>
                <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">Centre de contrôle SEO</h1>
                <p className="max-w-3xl text-sm leading-6 text-muted-foreground sm:text-base">
                  Synthèse des fondations SEO vérifiables dans le code d’Un Instant Ici. Cette page ne présente aucune donnée Google en direct.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <StatusBadge tone="ok">Configuration auditée</StatusBadge>
                <Badge variant="outline">Données statiques</Badge>
                <Badge variant="outline">Owner uniquement</Badge>
              </div>
            </div>
          </header>

          <section aria-labelledby="foundations-title" className="space-y-4">
            <div>
              <h2 id="foundations-title" className="text-xl font-bold">Fondations techniques</h2>
              <p className="text-sm text-muted-foreground">Contrôles internes issus de l’architecture actuelle, sans score Google.</p>
            </div>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <Card className="rounded-2xl border-muted/60">
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center gap-2 text-base"><Globe2 className="h-4 w-4 text-primary" /> Domaine canonique</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  <p className="break-all text-sm font-bold">{SITE_URL}</p>
                  <StatusBadge tone="ok">Configuré</StatusBadge>
                </CardContent>
              </Card>
              <Card className="rounded-2xl border-muted/60">
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center gap-2 text-base"><FileSearch className="h-4 w-4 text-primary" /> Exploration</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  <p className="text-sm font-bold">robots.txt + sitemap.xml</p>
                  <StatusBadge tone="ok">Présents</StatusBadge>
                </CardContent>
              </Card>
              <Card className="rounded-2xl border-muted/60">
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center gap-2 text-base"><Share2 className="h-4 w-4 text-primary" /> Partage social</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  <p className="text-sm font-bold">Open Graph + Twitter</p>
                  <StatusBadge tone="ok">Actifs</StatusBadge>
                </CardContent>
              </Card>
              <Card className="rounded-2xl border-muted/60">
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center gap-2 text-base"><Braces className="h-4 w-4 text-primary" /> JSON-LD</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  <p className="text-sm font-bold">WebApplication</p>
                  <StatusBadge tone="ok">Homepage</StatusBadge>
                </CardContent>
              </Card>
            </div>
            <Alert>
              <ShieldCheck className="h-4 w-4" />
              <AlertTitle>Score volontairement omis</AlertTitle>
              <AlertDescription>
                Les contrôles vérifiables sont affichés directement. Aucun score Google, trafic, impression, CTR ou position n’est simulé.
              </AlertDescription>
            </Alert>
          </section>

          <Separator />

          <section aria-labelledby="homepage-title" className="grid gap-6 xl:grid-cols-[minmax(0,1.25fr)_minmax(18rem,0.75fr)]">
            <Card className="rounded-2xl border-muted/60">
              <CardHeader>
                <CardTitle id="homepage-title">Homepage</CardTitle>
                <CardDescription>Résumé des textes et metadata actuellement publiés.</CardDescription>
              </CardHeader>
              <CardContent>
                <dl>
                  <InfoRow label="Title" value="Un Instant Ici | Carte interactive pour vos événements" />
                  <InfoRow label="Description" value="Créez et partagez la carte interactive de votre événement : lieux, points d’intérêt, informations, avis et accès public ou privé. Un Instant Ici est une création Anava Studio." />
                  <InfoRow label="Canonical" value={SITE_URL} />
                  <InfoRow label="H1" value="Chaque événement, tous ses lieux, sur une carte." />
                  <InfoRow label="Sous-titre" value="Découvrez les événements autour de vous, leurs lieux utiles, leurs informations et les avis directement sur une carte interactive." />
                  <InfoRow label="Social" value="Open Graph et Twitter summary_large_image avec og-default.png" />
                </dl>
              </CardContent>
            </Card>

            <Card className="rounded-2xl border-muted/60">
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><ListChecks className="h-5 w-5 text-primary" /> Contrôles validés</CardTitle>
                <CardDescription>État de configuration constaté dans le code.</CardDescription>
              </CardHeader>
              <CardContent>
                <ul className="space-y-3">
                  {technicalChecks.map((check) => (
                    <ChecklistItem key={check} label={check} done />
                  ))}
                </ul>
              </CardContent>
            </Card>
          </section>

          <section aria-labelledby="pages-title" className="space-y-4">
            <div>
              <h2 id="pages-title" className="text-xl font-bold">Pages suivies</h2>
              <p className="text-sm text-muted-foreground">Lecture par famille de pages ; aucun état n’est issu d’une API externe.</p>
            </div>
            <div className="grid gap-4 lg:grid-cols-2">
              {trackedPages.map((page) => (
                <Card key={page.name} className="min-w-0 rounded-2xl border-muted/60">
                  <CardHeader className="gap-3 sm:flex-row sm:items-start sm:justify-between sm:space-y-0">
                    <div className="min-w-0 space-y-1">
                      <CardTitle className="text-lg">{page.name}</CardTitle>
                      <CardDescription className="break-all font-mono text-xs">{page.scope}</CardDescription>
                    </div>
                    <StatusBadge tone={page.indexationTone}>{page.indexation}</StatusBadge>
                  </CardHeader>
                  <CardContent>
                    <dl>
                      <InfoRow label="Canonical" value={page.canonical} />
                      <InfoRow label="Metadata" value={page.metadata} />
                      <InfoRow label="Open Graph" value={page.openGraph} />
                      <InfoRow label="JSON-LD" value={page.jsonLd} />
                      <InfoRow label="Sitemap" value={page.sitemap} />
                    </dl>
                    <p className="mt-3 rounded-xl bg-muted/40 p-3 text-sm leading-6 text-muted-foreground">{page.note}</p>
                  </CardContent>
                </Card>
              ))}
            </div>
          </section>

          <section aria-labelledby="canonical-title" className="grid gap-6 xl:grid-cols-2">
            <Card className="rounded-2xl border-muted/60">
              <CardHeader>
                <CardTitle id="canonical-title" className="flex items-center gap-2"><Link2 className="h-5 w-5 text-primary" /> Contrôle canonical</CardTitle>
                <CardDescription>Références publiques et points de vigilance.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-3">
                  <div className="flex items-start gap-3"><Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" /><p className="text-sm"><strong>metadataBase, homepage, contact, sitemap et robots</strong> utilisent {SITE_URL}.</p></div>
                  <div className="flex items-start gap-3"><Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" /><p className="text-sm"><strong>Events et POI</strong> construisent leurs URLs publiques dynamiquement avec le domaine du site.</p></div>
                  <div className="flex items-start gap-3"><Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" /><p className="text-sm"><strong>Preview privée</strong> produit un og:url sans token.</p></div>
                  <div className="flex items-start gap-3"><CircleDashed className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" /><p className="text-sm"><strong>Production :</strong> maintenir NEXT_PUBLIC_SITE_URL alignée sur {SITE_URL}.</p></div>
                </div>
                <Alert>
                  <AlertTriangle className="h-4 w-4" />
                  <AlertTitle>Ancien domaine</AlertTitle>
                  <AlertDescription>Aucune référence à l’ancien domaine n’a été trouvée dans les zones SEO publiques auditées.</AlertDescription>
                </Alert>
              </CardContent>
            </Card>

            <Card className="rounded-2xl border-muted/60">
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><Share2 className="h-5 w-5 text-primary" /> Open Graph / Partage social</CardTitle>
                <CardDescription>Indexation Google et aperçu social restent deux sujets distincts.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <InfoRow label="Homepage" value="OG + Twitter + image og-default.png" />
                <InfoRow label="Event public" value="OG + Twitter dynamiques avec image Event ou fallback" />
                <InfoRow label="POI" value="OG + Twitter dynamiques, tout en restant noindex, follow" />
                <InfoRow label="Event privé" value="Preview autorisée par token valide, sinon fallback générique ; noindex, nofollow" />
                <InfoRow label="Bots HTML" value="htmlLimitedBots: /.*/ conservé pour les previews WhatsApp" />
              </CardContent>
            </Card>
          </section>

          <section aria-labelledby="crawl-title" className="grid gap-6 xl:grid-cols-2">
            <Card className="rounded-2xl border-muted/60">
              <CardHeader>
                <CardTitle id="crawl-title" className="flex items-center gap-2"><FileSearch className="h-5 w-5 text-primary" /> Sitemap</CardTitle>
                <CardDescription>Version statique actuelle, sans lecture Firestore.</CardDescription>
              </CardHeader>
              <CardContent>
                <dl>
                  <InfoRow label="Domaine" value={SITE_URL} />
                  <InfoRow label="Inclus" value="/ et /contact" />
                  <InfoRow label="Exclus" value="Pages admin, auth, événements privés et POI paramétrés" />
                  <InfoRow label="Events publics" value="Non inclus en V1 — ajout pertinent à étudier" />
                </dl>
              </CardContent>
            </Card>

            <Card className="rounded-2xl border-muted/60">
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><Globe2 className="h-5 w-5 text-primary" /> Robots</CardTitle>
                <CardDescription>Directives publiées par robots.ts.</CardDescription>
              </CardHeader>
              <CardContent>
                <dl>
                  <InfoRow label="User-agent" value="*" />
                  <InfoRow label="Allow" value="/" />
                  <InfoRow label="Sitemap" value={`${SITE_URL}/sitemap.xml`} />
                  <InfoRow label="Ancien domaine" value="Absent" />
                </dl>
              </CardContent>
            </Card>
          </section>

          <section aria-labelledby="keywords-title" className="grid gap-6 xl:grid-cols-2">
            <Card className="rounded-2xl border-muted/60">
              <CardHeader>
                <CardTitle id="keywords-title" className="flex items-center gap-2"><Tags className="h-5 w-5 text-primary" /> Mots-clés cibles</CardTitle>
                <CardDescription>Repères éditoriaux internes — aucune balise meta keywords n’est générée.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-5">
                <div className="space-y-2">
                  <h3 className="text-sm font-semibold">Principaux</h3>
                  <div className="flex flex-wrap gap-2">
                    {primaryKeywords.map((keyword) => <Badge key={keyword}>{keyword}</Badge>)}
                  </div>
                </div>
                <Separator />
                <div className="space-y-2">
                  <h3 className="text-sm font-semibold">Secondaires</h3>
                  <div className="flex flex-wrap gap-2">
                    {secondaryKeywords.map((keyword) => <Badge key={keyword} variant="secondary">{keyword}</Badge>)}
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="rounded-2xl border-muted/60">
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><Braces className="h-5 w-5 text-primary" /> Branding et données structurées</CardTitle>
                <CardDescription>Cohérence des éléments publics indexables.</CardDescription>
              </CardHeader>
              <CardContent>
                <dl>
                  <InfoRow label="Marque" value="Un Instant Ici" />
                  <InfoRow label="Créateur" value="Anava Studio" />
                  <InfoRow label="JSON-LD" value="WebApplication présent sur la homepage" />
                  <InfoRow label="Creator" value="Organization — Anava Studio — anavastudio.fr" />
                  <InfoRow label="Publisher" value="Organization — Anava Studio — anavastudio.fr" />
                  <InfoRow label="Event / POI" value="Aucune donnée structurée dédiée actuellement" />
                </dl>
              </CardContent>
            </Card>
          </section>

          <section aria-labelledby="lifecycle-title" className="space-y-4">
            <div>
              <h2 id="lifecycle-title" className="text-xl font-bold">Cycle de vie SEO des événements</h2>
              <p className="text-sm text-muted-foreground">Politique constatée à partir de status et visibility.</p>
            </div>
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <Card className="rounded-2xl border-emerald-200 bg-emerald-50/40">
                <CardHeader><CardTitle className="text-base">published + public</CardTitle></CardHeader>
                <CardContent><StatusBadge tone="ok">Techniquement indexable</StatusBadge></CardContent>
              </Card>
              <Card className="rounded-2xl border-muted/60">
                <CardHeader><CardTitle className="text-base">private</CardTitle></CardHeader>
                <CardContent><StatusBadge tone="info">noindex, nofollow</StatusBadge></CardContent>
              </Card>
              <Card className="rounded-2xl border-muted/60">
                <CardHeader><CardTitle className="text-base">draft</CardTitle></CardHeader>
                <CardContent><StatusBadge tone="info">noindex, nofollow</StatusBadge></CardContent>
              </Card>
              <Card className="rounded-2xl border-muted/60">
                <CardHeader><CardTitle className="text-base">paused</CardTitle></CardHeader>
                <CardContent><StatusBadge tone="info">noindex, nofollow</StatusBadge></CardContent>
              </Card>
            </div>
            <Alert>
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>Définir la politique SEO des événements terminés</AlertTitle>
              <AlertDescription className="space-y-2">
                <p>Le modèle possède bien startDate et endDate, mais ces champs ne déclenchent aucune règle SEO automatique.</p>
                <p>À arbitrer plus tard : noindex après la fin, période de grâce, archive si le contenu reste utile, suppression, ou redirection seulement lorsqu’elle est réellement pertinente.</p>
              </AlertDescription>
            </Alert>
          </section>

          <section aria-labelledby="checklist-title" className="space-y-4">
            <div>
              <h2 id="checklist-title" className="text-xl font-bold">Checklist SEO</h2>
              <p className="text-sm text-muted-foreground">Actions de contenu, cycle Event et opérations Google à piloter manuellement.</p>
            </div>
            <div className="grid gap-4 lg:grid-cols-3">
              <Card className="rounded-2xl border-muted/60">
                <CardHeader><CardTitle className="text-base">Contenu</CardTitle></CardHeader>
                <CardContent><ul className="space-y-3">{contentChecklist.map((item) => <ChecklistItem key={item.label} {...item} />)}</ul></CardContent>
              </Card>
              <Card className="rounded-2xl border-muted/60">
                <CardHeader><CardTitle className="text-base">Cycle Events</CardTitle></CardHeader>
                <CardContent><ul className="space-y-3">{eventChecklist.map((item) => <ChecklistItem key={item} label={item} />)}</ul></CardContent>
              </Card>
              <Card className="rounded-2xl border-muted/60">
                <CardHeader><CardTitle className="text-base">Google</CardTitle></CardHeader>
                <CardContent><ul className="space-y-3">{googleChecklist.map((item) => <ChecklistItem key={item} label={item} />)}</ul></CardContent>
              </Card>
            </div>
          </section>

          <section aria-labelledby="search-console-title">
            <Card className="rounded-2xl border-muted/60">
              <CardHeader>
                <CardTitle id="search-console-title">Google Search Console</CardTitle>
                <CardDescription>Accès manuels uniquement : aucune API Google n’est connectée à ce dashboard.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-5">
                <Alert>
                  <FileSearch className="h-4 w-4" />
                  <AlertTitle>Prochaines vérifications</AlertTitle>
                  <AlertDescription>Soumettre sitemap.xml, vérifier l’indexation du domaine puis inspecter les URLs publiques utiles après production.</AlertDescription>
                </Alert>
                <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
                  <Button asChild variant="outline" className="justify-between sm:justify-center">
                    <a href="https://search.google.com/search-console/about" target="_blank" rel="noopener noreferrer">Search Console <ExternalLink className="h-4 w-4" /></a>
                  </Button>
                  <Button asChild variant="outline" className="justify-between sm:justify-center">
                    <a href="https://search.google.com/test/rich-results" target="_blank" rel="noopener noreferrer">Rich Results Test <ExternalLink className="h-4 w-4" /></a>
                  </Button>
                  <Button asChild variant="outline" className="justify-between sm:justify-center">
                    <a href="https://pagespeed.web.dev/" target="_blank" rel="noopener noreferrer">PageSpeed Insights <ExternalLink className="h-4 w-4" /></a>
                  </Button>
                </div>
              </CardContent>
            </Card>
          </section>
        </main>
      </div>
    </AppLayout>
  )
}
