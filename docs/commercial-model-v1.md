# Schéma économique V1 — fondations Sprint 1

Ce document décrit les invariants préparés par le Sprint 1. Il ne branche encore
aucun contrôle commercial sur le parcours utilisateur.

## Axes indépendants

- statut éditorial : `draft | published | paused` ;
- visibilité : `private | public` ;
- droit commercial : `free_draft | private | public` avec un état
  `active | revoked`.

Le droit commercial n'est jamais déduit de `status` ou de `visibility`. En
particulier, un Event payé peut rester `draft` ou être `paused` sans perdre son
droit, et un free draft actif est défini par `commercial.offerCode ===
'free_draft'` et `commercial.state === 'active'`.

## Transition et création autonome future

`AppEvent.commercial`, `AppEvent.createdBy` et `AppEvent.capabilities` sont
optionnels pendant le Sprint 1 afin de ne pas casser les démonstrations. Le futur
flux transactionnel `createEventDraft` devra toutefois créer chaque Event réel
avec :

- `createdBy` immuable, uniquement historique et sans aucun pouvoir RBAC ;
- `adminId` conservé provisoirement pour compatibilité ;
- un membre `members/{uid}` de rôle `admin` ;
- `status = draft` et `visibility = private` ;
- `startDate` et `endDate` obligatoires, avec `endDate >= startDate` ;
- un `commercial` actif, versionné ;
- des `capabilities` explicites ou sémantiquement désactivées par défaut ;
- la réservation atomique de `/freeDraftSlots/{uid}` et
  `/eventSlugs/{normalizedSlug}`.

Ces deux collections de réservation sont interdites à tous les clients par les
Rules. Elles seront écrites uniquement par une Function/Admin SDK. Aucun document
n'est créé dans ce Sprint.

## Autorité et champs protégés

`adminId` est encore une source d'autorité héritée dans les Rules, Storage Rules
et Functions. La cible est de faire de `events/{eventId}/members/{uid}.role` la
source d'autorité Event, tout en conservant le bypass transversal du global
owner. `createdBy` ne doit jamais accorder une permission.

Les updates client d'un event admin ne peuvent plus changer les racines
`createdBy`, `adminId`, `commercial`, `capabilities`, les champs commerciaux
top-level réservés, ni les marqueurs internes de suppression. Le global owner
conserve cette capacité via les Rules actuelles ; les futures Functions passent
par l'Admin SDK.

Le document Event est publiquement lisible dans certains contextes. Son objet
`commercial` est donc un résumé fonctionnel uniquement. Il ne doit jamais
contenir de numéro de carte, données de facturation, payload fournisseur, secret,
signature webhook ou donnée personnelle de paiement.

## Politique V1 centralisée

`src/lib/commercial-policy.ts` fixe :

- `COMMERCIAL_OFFER_VERSION = 1` ;
- `FREE_DRAFT_POI_LIMIT = 20` ;
- `free_draft` : aucune publication ;
- `private` : publication privée seulement ;
- `public` : publication privée ou publique ;
- un entitlement `revoked` : aucune publication ;
- Partnership absent ou différent de `true` : désactivé.

Cette politique est pure et testée, mais n'est appelée ni par la publication ni
par la création POI dans ce Sprint.

## Dates

Le modèle actuel `Date` côté application / `Timestamp` dans Firestore reste en
place. Les périodes métier (`event.startDate`, `event.endDate`) et commerciale
(`commercial.coveredFrom`, `commercial.coveredEndDate`) sont indépendantes. Une
modification de `event.endDate` ne doit jamais prolonger automatiquement la
couverture payée. Aucune tolérance de report arbitraire n'est encodée au Sprint 1.

Le flux actuel utilise notamment `new Date(`${value}T00:00:00`)` puis, dans
certaines interfaces, `date.toISOString().slice(0, 10)`. Cette combinaison peut
décaler le jour calendaire selon le fuseau. Le problème doit être traité dans un
sprint dates dédié avant de rendre les dates obligatoires à grande échelle ; le
Sprint 1 ne modifie pas ces conversions.

## Démonstrations et activation future

Les Events existants sont des données de démonstration non commerciales. Aucune
migration legacy complexe n'est nécessaire. Ils seront adaptés manuellement
avant l'activation de l'enforcement commercial.

Aucun backfill, fallback commercial permanent, paiement, checkout, webhook ou
code fournisseur n'est introduit ici.

La card Marketing reste inchangée. Elle sera plus tard repositionnée comme
« Message organisateur », distinct de Partnership POI et de la publicité
annonceur plateforme.
