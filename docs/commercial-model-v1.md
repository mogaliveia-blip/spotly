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

## Transition et création autonome

`AppEvent.commercial`, `AppEvent.createdBy` et `AppEvent.capabilities` sont
optionnels afin de ne pas casser les démonstrations. Depuis le Sprint 2, la
callable `createEventDraft` crée chaque nouvel Event autonome avec :

- `createdBy` immuable, uniquement historique et sans aucun pouvoir RBAC ;
- `adminId` conservé provisoirement pour compatibilité ;
- un membre `members/{uid}` de rôle `admin` ;
- `status = draft` et `visibility = private` ;
- depuis Discovery V1-A, une période calendrier `timePrecision = date`, avec
  `startDay` et `endDay` obligatoires, inclusifs et `endDay >= startDay`, et un
  `timezone` IANA valide ;
- un `commercial` actif, versionné ;
- des `capabilities` explicites ou sémantiquement désactivées par défaut ;
- un `creationRequestId` UUID v4 servant également d'identifiant Event ;
- la réservation atomique de `/freeDraftSlots/{uid}` et
  `/eventSlugs/{normalizedSlug}`.

Ces deux collections de réservation sont interdites à tous les clients par les
Rules. Elles sont écrites uniquement par la callable via Admin SDK. La création
directe de `/events/{eventId}` par un SDK client est interdite, y compris pour le
global owner.

### Flux serveur Sprint 2

Le flux effectif est :

`CreateEventDialog` → callable `createEventDraft` (`europe-west1`) → validation
Auth et payload → transaction Firestore → Event + membership admin + configs +
réservation slug + éventuel free draft slot.

Le client n'envoie que `requestId`, `name`, `slug`, `timezone`, `startDay`,
`endDay` et les champs de localisation facultatifs. Le serveur impose
`createdBy`, `adminId`, `status = draft`, `visibility = private`, le membership
`admin`, `commercial`, les timestamps de traçabilité, `timePrecision = date`
et `partnershipEnabled = false`.

Pour un rôle global `user`, le token Auth doit porter
`email_verified === true`. `isApproved` n'intervient pas. Le global owner dispose
d'un bypass explicite de cette vérification et du verrou `/freeDraftSlots/{uid}`
afin de pouvoir créer plusieurs Events internes ou de démonstration. Les slugs et
les autres validations restent obligatoires pour l'owner.

L'UUID v4 `requestId` est l'ID déterministe de l'Event. Un retry du même
créateur avec le même ID retourne l'Event déjà créé ; les appels concurrents sont
sérialisés par la transaction. Aucun registre d'idempotence supplémentaire n'est
nécessaire.

`/eventSlugs/{normalizedSlug}` garantit l'unicité sans requête préalable. Une
réservation pointant vers un Event absent est remplacée atomiquement. Une
réservation pointant vers un Event existant produit `SLUG_TAKEN`.

Pour un `user`, `/freeDraftSlots/{uid}` bloque uniquement un Event dont
`commercial.offerCode === free_draft`, `commercial.state === active` et
`createdBy === uid`. `event.status` n'intervient pas. Un slot absent ou pointant
vers un Event absent, payé, révoqué ou appartenant à un autre créateur est stale
et remplacé atomiquement.

La suppression complète efface la réservation slug et le free draft slot
seulement si leur `eventId` correspond à l'Event supprimé. Les démonstrations sans
`createdBy` ou sans réservation restent supprimables.

## Autorité et champs protégés

`adminId` est encore une source d'autorité héritée dans les Rules, Storage Rules
et Functions. La cible est de faire de `events/{eventId}/members/{uid}.role` la
source d'autorité Event, tout en conservant le bypass transversal du global
owner. `createdBy` ne doit jamais accorder une permission.

Les updates client d'un event admin ne peuvent plus changer les racines
`createdBy`, `creationRequestId`, `adminId`, `commercial`, `capabilities`, les
champs commerciaux top-level réservés, ni les marqueurs internes de suppression.
Le global owner conserve cette capacité via les Rules actuelles ; les Functions
passent par l'Admin SDK.

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

Discovery V1-A distingue deux modes temporels exclusifs, avec un `timezone`
IANA valide :

- calendrier : `timePrecision: 'date'`, `startDay` et `endDay` au format
  `YYYY-MM-DD`, jours inclusifs avec `startDay <= endDay`, sans `startDate/endDate` ;
- horaire précis : `timePrecision: 'datetime'`, `startDate` et `endDate`
  comme instants exacts (`Timestamp` Firestore / `Date` application), avec
  `startDate <= endDate`, sans `startDay/endDay`.

Les périodes métier de l'Event et commerciale
(`commercial.coveredFrom`, `commercial.coveredEndDate`) sont indépendantes. Une
modification de la fin métier (`endDay` ou `endDate`) ne doit jamais prolonger automatiquement la
couverture payée. Aucune tolérance de report arbitraire n'est encodée au Sprint 1.

La création actuelle transmet `startDay/endDay` sous forme stricte `YYYY-MM-DD`.
La Function vérifie les jours réels, leur ordre et le fuseau, puis enregistre
directement les chaînes, sans conversion à minuit ou midi UTC. L'édition
calendrier utilise le même contrat via `updateEventCalendarTime`. La saisie et
l'édition des heures précises sont différées ; les instants renseignés sont conservés.

Sans `timePrecision`, un Event reste historique et doit être vérifié manuellement.
Ses anciens Timestamps ne permettent pas d'inférer des heures précises ni une
compatibilité avec « Maintenant ». Aucune migration automatique n'est introduite.
Les timestamps imbriqués présents dans `commercial` sont
reconvertis en `Date` par la couche de lecture applicative.

## Démonstrations et activation future

Les Events existants sont des données de démonstration non commerciales. Aucune
migration legacy complexe n'est nécessaire. Ils seront adaptés manuellement
avant l'activation de l'enforcement commercial.

Aucun backfill, fallback commercial permanent, paiement, checkout, webhook ou
code fournisseur n'est introduit ici.

Le quota de 20 POI reste une constante non appliquée. La policy commerciale
n'est toujours pas reliée à la publication, et la homepage conserve ses critères
actuels.

La card Marketing reste inchangée. Elle sera plus tard repositionnée comme
« Message organisateur », distinct de Partnership POI et de la publicité
annonceur plateforme.
