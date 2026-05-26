# SPOTLY – CONTEXTE TECHNIQUE COMPLET DU PROJET

## Objectif

Spotly est une plateforme de découverte de lieux (POI) organisée par événements.

Exemples :

* Sicile 2026
* Rome 2027
* Festival Jazz 2026

Chaque événement possède :

* sa propre configuration
* ses propres membres
* ses propres rôles
* ses propres POI
* sa propre landing page marketing

L'application repose sur :

* Next.js App Router
* React
* TypeScript
* Firebase Authentication
* Firestore
* Firebase Storage
* Tailwind CSS
* Shadcn UI

---

# Architecture multi-événement

## Collection principale

```text
/events/{eventId}
```

Document :

```ts
{
  name: string
  slug: string
  status: "draft" | "published"
  adminId: string
  createdAt: Timestamp
  updatedAt: Timestamp
}
```

Le slug est utilisé dans les URLs :

```text
/sicile-2026
/rome-2027
```

---

# Configuration événement

Collection :

```text
/events/{eventId}/config
```

Documents :

```text
main
marketing
```

main :

```ts
{
  isLandingPageActive: boolean
  reviewsEnabled: boolean
}
```

marketing :

```ts
{
  heroEnabled: boolean
  heroTitle: string
  heroSubtitle: string
  heroImageUrl: string
  heroCtaText: string
  heroCtaMode: "auth" | "external" | "close" | "none"
  heroCtaLink?: string
}
```

---

# Landing page événement

Si :

```ts
config.main.isLandingPageActive === true
```

Alors :

visiteur :

```text
/eventSlug
```

affiche :

```text
HeroOverlay
```

et bloque l'accès au dashboard.

Seuls :

```text
owner
admin local
editor local
```

peuvent accéder directement au dashboard.

---

# Gestion des rôles

## Rôle global

Collection :

```text
/users/{uid}
```

Champ :

```ts
role: "owner" | "user"
```

IMPORTANT :

Les rôles globaux :

```text
admin
editor
viewer
```

n'existent plus.

Ils sont strictement locaux aux événements.

---

# Rôles événement

Collection :

```text
/events/{eventId}/members/{uid}
```

Document :

```ts
{
  uid: string
  role: "admin" | "editor" | "viewer"
}
```

---

# Permissions

owner :

* accès plateforme
* accès supervision
* accès utilisateurs globaux
* accès tous événements

admin événement :

* gestion membres
* gestion paramètres événement
* gestion POI
* gestion landing page

editor :

* gestion POI
* gestion contenu

viewer :

* lecture uniquement

---

# Gestion des membres

Page :

```text
/[eventSlug]/admin/members
```

Fonctions :

```ts
fetchEventMembers()
inviteMemberToEvent()
updateEventMemberRole()
removeEventMember()
```

Les invitations utilisent :

```text
email utilisateur existant
```

Aucun compte n'est créé automatiquement.

L'utilisateur doit déjà exister.

---

# Firestore

Collections utilisées

```text
/users
/events
/events/{eventId}/members
/events/{eventId}/pois
/events/{eventId}/pois_public
/events/{eventId}/config
/events/{eventId}/pois/{poiId}/reviews
/config
```

---

# Modèle POI

```ts
{
  id: string
  title: string
  description: string

  headerPhotoUrl?: string

  galleryUrls: [
    {
      url: string
    }
  ]

  location: {
    lat: number
    lng: number
  }

  sponsor?: Sponsor
}
```

---

# Images

Stockage :

Firebase Storage

Dossier :

```text
poi-images/
```

Upload :

```ts
uploadFile()
```

Suppression :

```ts
deleteFileByPath()
```

---

# Galerie POI

Composants :

```text
src/components/poi/poi-gallery.tsx
src/components/poi/poi-details.tsx
```

Responsabilités :

poi-gallery :

* grille miniature

poi-details :

* image principale
* lightbox plein écran
* navigation précédent / suivant

---

# Lightbox

Le problème historique :

```text
zoom excessif
images tronquées
```

Correction appliquée :

```html
<div className="relative w-full h-full flex items-center justify-center px-10 py-16">
```

```html
<img
className="
w-auto
h-auto
max-w-[80vw]
max-h-[75vh]
object-contain
"
/>
```

Objectif :

* toujours afficher l'image entière
* aucune découpe
* conserver les proportions

---

# Authentification

Firebase Auth

Connexion :

```ts
signInWithEmailAndPassword()
```

Page :

```text
/src/app/login/page.tsx
```

Après connexion :

```ts
router.push("/admin")
```

---

# Bug historique rencontré

Erreur :

```text
auth/api-key-expired
```

Cause :

variable d'environnement production incorrecte.

Ne pas modifier le code.

Vérifier :

```env
NEXT_PUBLIC_FIREBASE_API_KEY
```

sur l'hébergeur.

---

# Fichiers critiques

Configuration Firebase :

```text
src/lib/firebase/config.ts
firebase/config.ts
```

Vérifier les doublons.

---

Données :

```text
src/lib/data.ts
```

Contient :

```ts
fetchUserEvents()
createEvent()

fetchEventMembers()
inviteMemberToEvent()

fetchReviewsByPoiId()

fetchAppConfig()
```

---

Providers :

```text
src/providers/event-provider.tsx
src/providers/geolocation-provider.tsx
```

---

POI :

```text
src/components/poi/*
```

---

Administration :

```text
src/app/admin/*
src/app/[eventSlug]/admin/*
```

---

# Conventions importantes

Toujours privilégier :

* architecture multi-événement
* rôles locaux par événement
* owner unique au niveau plateforme
* aucune dépendance aux anciens rôles globaux admin/editor

Ne jamais réintroduire :

```text
role global = admin
role global = editor
```

Ils ont été supprimés volontairement.

---

# Mission de l'IA reprenant le projet

Avant toute modification :

1. analyser l'architecture existante
2. vérifier la compatibilité multi-événement
3. vérifier les règles Firestore
4. rechercher les régressions sur les rôles locaux
5. vérifier les permissions Firestore
6. proposer un plan avant modification
7. produire les patchs fichier par fichier

Ne jamais refactoriser massivement sans validation.
