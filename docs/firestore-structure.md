# Structure Firestore - Projet Spotly

Ce document détaille l'arborescence des collections et les schémas de données utilisés dans l'architecture multi-événement de l'application.

## 1. Utilisateurs Globaux
**Collection :** `/users/{userId}`  
Gère l'accès à la plateforme et les rôles de haut niveau.

*   `uid` (string) : ID unique Firebase Auth.
*   `email` (string) : Adresse e-mail de l'utilisateur.
*   `displayName` (string) : Nom d'affichage.
*   `photoURL` (string | null) : URL de l'avatar.
*   `role` (enum) : `'user' | 'editor' | 'admin' | 'owner'`.
*   `isApproved` (boolean) : Statut de validation par un Owner.
*   `createdAt` (timestamp) : Date de création du compte.
*   `lastLogin` (timestamp) : Date de dernière connexion.

---

## 2. Événements (Multi-Event)
**Collection :** `/events/{eventId}`  
Chaque document représente un festival ou un espace unique.

*   `name` (string) : Nom de l'événement.
*   `slug` (string) : Identifiant unique pour l'URL (ex: `sicile-2026`).
*   `adminId` (string) : UID de l'utilisateur ayant créé l'événement.
*   `status` (enum) : `'draft' | 'published' | 'paused'`.
*   `visibility` (enum) : `'private' | 'public'`.
*   `createdAt` (timestamp) : Date de création.
*   `updatedAt` (timestamp) : Dernière mise à jour.
*   `poiCategories` (array) : Catégories POI configurées pour l'événement. Chaque entrée contient `{ id, label, icon }`.

### Contrat temporel Event — Discovery V1-A

Deux modes exclusifs, avec un `timezone` IANA validé côté serveur :

*   `timePrecision: 'date'` : `startDay` et `endDay` sont des chaînes `YYYY-MM-DD`, jours calendaires inclusifs, avec `startDay <= endDay`. Aucun `startDate` ou `endDate` n'est stocké.
*   `timePrecision: 'datetime'` : `startDate` et `endDate` sont des Firestore Timestamps représentant des instants, avec `startDate <= endDate`. Aucun `startDay` ou `endDay` n'est stocké. L'application les lit en `Date` et les affiche dans le fuseau du contenu.

La création et l'édition actuelles saisissent uniquement des jours. L'édition de la période passe par `updateEventCalendarTime` (admin Event, `adminId` historique ou owner) ; la même transaction synchronise désormais sa projection Discovery, si elle est éligible. Les règles interdisent les changements temporels directs côté client, y compris pour l'owner. La validation réelle du calendrier et du fuseau appartient aux mutations serveur ; les règles vérifient également la forme du document.

Les instants précis sont reconnus et conservés, mais leur saisie/édition locale est différée. Aucun Timestamp historique ne prouve une précision horaire.

Sans `timePrecision`, un Event reste administrable mais apparaît avec « Dates à vérifier ». Il ne participe pas aux filtres temporels tant que sa période n'a pas été confirmée. Pour les quelques Events de démonstration : vérifier manuellement les jours et le fuseau, puis utiliser « Enregistrer la période ». Cette action retire uniquement les anciens champs temporels et ne touche ni aux Points, ni aux memberships, ni aux droits commerciaux. Aucune migration automatique n'est prévue.

Les helpers communs (`functions/src/event-time.ts`, réexportés dans `src/lib/event-time.ts`) préparent : Aujourd'hui et Date choisie par chevauchement de jours dans le fuseau du contenu ; Ce week-end = samedi/dimanche à venir en semaine, en cours le samedi/dimanche ; Maintenant = uniquement un mode `datetime` valide avec `startDate <= now <= endDate`. Un Event à la journée n'est jamais implicitement « en cours maintenant ».

Lors d'une mise en service ultérieure, coordonner les Functions, les règles et le client : le nouveau payload de création utilise `startDay`/`endDay`, et l'édition exige la nouvelle Function. Aucun déploiement n'est réalisé par ce sprint.

### Paramètres de découverte Event — Discovery V1-B

```ts
discoveryPosition?: { lat: number; lng: number }
typeId?: string
categoryId?: string
tags?: string[]
```

Ces champs optionnels appartiennent au document Event. Les Events historiques restent valides sans eux, sans migration ni nouvelle condition de publication. La création reste un brouillon simple ; l’enrichissement se fait dans la section « Découverte » de l’administration.

`defaultMapCenter ≠ discoveryPosition` : le premier cadre la Carte Event ; le second est un choix explicite de l’administrateur pour représenter l’Event par un marqueur unique sur la future Carte Découverte. Le cadrage initial de l’éditeur peut utiliser `defaultMapCenter`, mais ne l’enregistre jamais comme position. Aucun Point, ville ou GPS ne détermine automatiquement cette position. Le serveur exige deux nombres finis : latitude entre -90 et 90 et longitude entre -180 et 180.

La classification Event est indépendante des catégories des Points (`poiCategories` et `pois/{pointId}.categoryId`). Le catalogue central partagé (`functions/src/event-discovery.ts`, réexporté dans `src/lib/event-discovery.ts`) utilise des identifiants stables indépendants des libellés :

* Types Event : `festival` (Festival), `concert` (Concert), `market` (Marché), `trail` (Trail), `other` (Autre).
* Catégories : `music` (Musique), `culture` (Culture), `gastronomy` (Gastronomie), `sport` (Sport), `nature` (Nature), `other` (Autre).
* Tags : `family` (En famille), `outdoor` (Plein air), `free` (Gratuit).

Les identifiants inconnus et le texte libre sont refusés. Les tags sont dédupliqués et stockés dans l’ordre du catalogue, sans signification métier liée à cet ordre. Les types Event sont séparés des futurs types Place ; catégories et tags peuvent être réutilisés.

La callable `updateEventDiscoverySettings` accepte `{ eventId, discoveryPosition?, typeId?, categoryId?, tags? }`. Un champ omis reste inchangé ; `null` supprime explicitement ce champ ; `tags: []` conserve une liste vide. Seuls admin Event, `adminId` historique et owner sont autorisés, selon le modèle existant. `createdBy` n’accorde aucun droit. Autorisation et mise à jour sont transactionnelles. Sur la source Event, la mutation ne touche que ces quatre champs et `updatedAt` ; elle synchronise aussi la projection dans la même transaction. Elle ne modifie jamais les Points, avis, photos, memberships, données commerciales, capabilities ou champs temporels V1-A.

Les Rules interdisent toute addition, modification ou suppression directe des quatre champs par le client, y compris l’owner. Les métadonnées non projetées restent modifiables selon les règles existantes et doivent conserver ces champs. `updateEventDetails` accepte uniquement ses champs métier habituels, avec une garde à l’exécution contre les payloads élargis. Les autres mutations serveur utilisent des mises à jour ciblées qui préservent la découverte.

Le portail n’utilise pas ces champs ; aucune collection métier `/places` ni Carte Découverte n’est créée. Lors d’une mise en service ultérieure, coordonner Functions, Rules et client ; aucun déploiement n’est réalisé ici.

### Projection publique Event — Discovery V1-C / V1-D D1

`/events/{eventId}` reste l'unique source métier. `/discovery_public/event_{eventId}` est une projection publique dérivée minimale, sans champ `id`. Le préfixe réserve la possibilité future de `place_{placeId}` sans créer de Places.

Le builder serveur `buildEventDiscoveryProjection(eventId, event)` centralise l'éligibilité :

* `status === 'published'` et `visibility === 'public'` ; aucun nettoyage de suppression en cours.
* Nom et slug valides selon les invariants de création existants (nom de 3 à 120 caractères, slug normalisé de 3 à 80 caractères).
* `discoveryPosition` valide et explicite ; `typeId` et `categoryId` connus du catalogue V1-B.
* Contrat V1-A explicite et valide, avec `timePrecision` et fuseau IANA. Un Event historique sans précision n'est pas projeté.
* Droit commercial existant `canCommercialPublishPublic(commercial)` : offre `public`, état `active`. La matrice est partagée, sans modification des offres. Un résumé absent, révoqué ou d'une autre offre ne donne aucun droit public Discovery.

Tags et image restent facultatifs ; ni description, ni galerie, ni nombre de Points ne conditionnent l'éligibilité. Les tags présents doivent être contrôlés. Aucune position/classification n'est déduite des Points. Aucune éligibilité ne dépend du temps courant : un Event terminé peut rester projeté, les filtres temporels viendront dans V1-D.

```ts
{
  contentType: 'event',
  sourceId: string,
  title: string,              // Event.name
  slug: string,
  position: { lat: number; lng: number }, // discoveryPosition uniquement
  geohash: string,            // index dérivé serveur, exactement 10 caractères
  typeId: string,
  categoryId: string,
  tags?: string[],
  timePrecision: 'date' | 'datetime',
  timezone: string,
  startDay?: string,          // présents uniquement pour timePrecision === 'date'
  endDay?: string,            // copies des jours métier, absents pour datetime
  windowStartAt: Timestamp,
  windowEndAt: Timestamp,
  thumbnail?: string,         // Event.eventCoverUrl, pas la galerie
  updatedAt: Timestamp       // dernière synchronisation matérielle de la projection
}
```

La projection est construite par allowlist explicite : aucun `adminId`, `createdBy`, e-mail, membre, token, lien privé, commercial, capability, configuration interne, Point, avis, galerie complète ou paiement. Elle se lit sans charger l'Event source.

Pour `datetime`, les bornes sont exactement `startDate`/`endDate`, nanosecondes conservées. Pour `date`, elles représentent le début de `startDay` local et la fin inclusive de `endDay` local (dernière microseconde stockable dans Firestore avant le jour suivant), convertis en UTC dans le fuseau du contenu, avec les changements DST. Un jour local inexistant suite à un changement de fuseau n'a pas de borne inventée et reste non projeté. Ces bornes servent aux futures requêtes ; elles ne remplacent jamais les jours métier. `timePrecision: 'date'` reste explicite et ne prouve pas « Maintenant ».

Chaque mutation concernée lit la source et les permissions dans une transaction Firestore, produit son nouvel état, puis écrit la source et remplace **complètement** la projection (`set` sans merge) ou la supprime physiquement si l'Event n'est plus éligible. Aucun drapeau `eligible:false` ni trigger différé ne maintient cette collection.

* `updateEventCalendarTime` : période V1-A et projection temporelle.
* `updateEventDiscoverySettings` : position/classification V1-B et projection.
* `updateEventPublicDetails` : patch borné `{ eventId, name?, status?, visibility?, eventCoverUrl? }` ; champ omis conservé, `eventCoverUrl: null` supprime la couverture. Admin Event, `adminId` historique ou owner. L'interface existante utilise ce chemin pour ces champs, et conserve le chemin client pour les autres métadonnées. La publication source n'exige pas les données Discovery.
* `updateEventCommercial` : owner plateforme uniquement ; remplace le résumé commercial existant ou le supprime avec `commercial: null`, puis synchronise la projection. Le payload reprend les champs du modèle actuel (`offerCode`, `offerVersion`, `state`, `grantedAt` et les dates commerciales facultatives), avec dates en instants ISO UTC. Aucun paiement, prix ou nouvelle offre. Il remplace l'ancienne écriture directe owner du résumé, sans nouvelle interface commerciale.
* `deleteEventCompletely` : retrait de la projection et marqueur de suppression atomiques **avant** le nettoyage Storage/sous-collections ; le builder refuse ensuite toute recréation pendant ce nettoyage. La suppression finale de la source/réservations supprime aussi la projection dans sa transaction. Les retries gardent le mécanisme d'autorisation existant.

Le slug reste réservé dans `/eventSlugs` à la création ; aucun nouveau flux de changement de slug n'est introduit. Les Rules empêchent les clients, même owner, de changer directement nom, slug, statut, visibilité, couverture, résumé commercial et marqueurs de suppression, en plus des champs temporels et Discovery. La suppression directe Event est refusée. Les autres champs ne sont pas durcis par principe.

Les Rules de `/discovery_public` autorisent la lecture publique d'un document et les listes limitées à 100 résultats, sans lecture de la source. Toutes les écritures client sont interdites, y compris owner. Les métadonnées non projetées peuvent changer sans rafraîchir `updatedAt` de la projection : ce timestamp décrit sa synchronisation, pas toutes les éditions de la source.

Pour les quelques Events de démonstration, vérifier manuellement temporalité, position, classification et droit commercial ; ne rien déduire ni migrer automatiquement. Une sauvegarde autoritaire manuelle (période, Découverte ou détails publics) recalcule la projection enrichie une fois les données complètes. Les anciennes projections sans géohash ne sont pas interrogées par le moteur D1 : toutes les projections existantes doivent être remises à niveau avant sa mise en service. Aucun endpoint de migration ou script de production n'est ajouté. Le portail reste sur son fonctionnement actuel.

#### Recherche publique — Discovery V1-D D1

`searchDiscovery` est une callable V2 anonyme en `europe-west1`. Elle lit uniquement `discovery_public`, jamais les sources Event, Points ou memberships. Les clients ne contrôlent ni rayon, ni limites, ni budgets. Les Rules sont inchangées ; l'Admin SDK applique ces bornes dans le moteur lui-même.

Entrée : `{ area, when, categoryId?, typeIds?, tags? }`.

* `area: { kind: 'radius', center: { lat, lng } }` : rayon fixe de 25 000 mètres ; distance Haversine à vol d'oiseau calculée côté serveur, filtre final `<= 25 km`, tri par distance puis ID.
* `area: { kind: 'bounds', north, south, east, west }` : rectangle réel, antiméridien géré par découpage. Étendues latitude/longitude contrôlées ; rejet des vues de 180° de longitude ou plus et des dimensions conservatrices dont la diagonale dépasse 200 km. Aucune réduction silencieuse de la zone.
* Le géohash sert seulement de présélection. Le rayon de couverture est multiplié par `max(1, a / sqrt(1-e²) / R, 110574 / (R*pi/180))`, avec les constantes exportées par GeoFire et `R=6371000` pour la sphère D1. Le maximum `a/sqrt(1-e²)` majore les échelles méridienne et longitudinale de son modèle : une trajectoire sphérique de longueur `r` a donc une longueur majorée par ce facteur dans le modèle de couverture. Le rayon final reste exactement 25 000 m.
* Les préfixes de couverture perdent un bit par axe : leurs cellules doublent de taille, ce qui évite les lignes sautées par les neuf sondes GeoFire aux seuils de précision (`2*110574 > C_meridian/360`). Lorsque la boîte conservative couvre toutes les longitudes, celles-ci sont explicitement échantillonnées des deux côtés du globe, y compris aux pôles. La précision est plafonnée pour les petites zones ; le filtre exact final conserve les bounds originaux. Ces élargissements peuvent augmenter les faux positifs, toujours soumis au budget de 500 et aux filtres exacts.
* `when` : `{ kind: 'now' | 'today' | 'weekend' }` ou `{ kind: 'date', day: 'YYYY-MM-DD' }`. Le serveur fige un seul instant par recherche et évalue chaque contenu dans son fuseau.
* Maintenant accepte uniquement datetime et ses bornes exactes inclusives. Aujourd'hui exclut les datetime déjà terminés, mais conserve les contenus date toute leur journée locale. Week-end : samedi et dimanche le samedi ; uniquement le reste du dimanche le dimanche ; prochain samedi/dimanche les autres jours. Une date choisie n'a aucun horizon futur supplémentaire.
* Pour datetime, le chevauchement civil utilise les portions UTC réelles du jour, y compris les interruptions historiques. Un jour inexistant n'a aucune portion. Les bornes englobantes V1-C servent uniquement à la présélection temporelle conservative.
* Catégorie : égalité Firestore. Types : OR après présélection. Tags : AND après présélection. IDs contrôlés V1-B uniquement ; au maximum cinq types et trois tags reçus, puis déduplication.
* Racine, zone, coordonnées et période : champs propres de données, clés requises et autorisées exactes. Prototypes personnalisés, champs hérités et accesseurs sont refusés par `invalid-argument` avant utilisation géographique. Le handler inspecte également les clés du JSON original conservé dans `request.rawRequest.body.data` avant d'utiliser `request.data` : toute clé `__proto__` est refusée, même si le décodeur Firebase la perd. Les valeurs texte ne sont pas scannées. Les validateurs métier V1-A/B restent inchangés.

Chaque plage géohash reçoit son quota avant les requêtes. Budget global : **500 documents retournés par Firestore**, doublons compris, avant tout filtre ; pages internes de 100 au maximum. Une plage est `exhausted` seulement après une page plus courte que sa limite ; si son quota est atteint sans preuve d'épuisement, elle est `budget_limited`. Aucun document de vérification supplémentaire ne dépasse le budget.

Réponse : `{ results, meta: { complete, truncated, partialFailure, returnedCount } }`, avec au maximum **100 résultats**. `complete` signifie que tous les résultats correspondants sont retournés : toutes les plages épuisées, aucune erreur et aucun résultat omis par le plafond. Une limite de candidats ou plus de 100 correspondances donne `truncated: true`. Une plage échouée donne `partialFailure: true`, `complete: false` ; si toutes échouent, erreur callable `unavailable`. Une projection malformée rend la plage défaillante ; elle ne certifie jamais un faux zéro exhaustif. Les erreurs internes ne sont pas exposées.

Les résultats reprennent une allowlist explicite : `id` (document ID), `contentType`, `sourceId`, `title`, `slug`, `position`, `typeId`, `categoryId`, `tags?`, `timePrecision`, `timezone`, `windowStartAt`, `windowEndAt`, jours pour date, `thumbnail?` et `distanceMeters?` seulement pour radius. Géohash, commercial, configuration, administrateurs et données internes ne sont pas retournés. Aucune distance n'est persistée.

Firestore conserve les `Timestamp` ; le réseau transporte `{ seconds: number, nanoseconds: number }`. Le décodeur application construit explicitement les Timestamp du SDK navigateur, sans arrondi ni dépendance à une méthode présente sur le JSON. L'adaptateur n'introduit aucun composant React.

Les quatre index composites déclarés dans `firestore.indexes.json` sont : `contentType`, éventuellement `categoryId`, éventuellement `timePrecision`, puis `geohash`, `windowEndAt`, `windowStartAt` (ASC). Les deux inégalités temporelles filtrent les documents mais ne plafonnent pas les entrées d'index parcourues. Aucun index n'est déployé par le sprint.

App Check n'est pas initialisé dans le client actuel ; aucun enforcement isolé n'est activé. Son durcissement reste à préparer avec le client public avant production. CORS conserve les origines existantes, sans constituer un mécanisme anti-abus.

#### Validation Query Explain sur un projet de test réel

Les tests émulateur vérifient exactitude, contrats et budgets, pas la performance des index composites. Le script `functions/scripts/discovery-query-explain.mjs` exige une autorisation positive indépendante : la variable dédiée `DISCOVERY_QUERY_EXPLAIN_TEST_PROJECT_ID` doit désigner exactement le projet demandé. `--project-id` et `--confirm-test-project` doivent aussi être identiques. Aucun projet de test n'est actuellement configuré. Sans autorisation ou en cas de mismatch, refus avant import Firebase, initialisation, lookup des credentials et accès Firestore. La denylist production reste une protection supplémentaire. Aucun accès externe n'est lancé automatiquement.

Procédure manuelle, après identification d'un projet de test distinct et d'identifiants IAM limités à ce projet :

1. Identifier et autoriser explicitement un projet de test distinct : renseigner `DISCOVERY_QUERY_EXPLAIN_TEST_PROJECT_ID` dans le shell de cette opération uniquement. Utiliser des credentials IAM limités à ce projet. Construire Functions et rendre disponibles les index **dans le projet de test uniquement**.
2. Préparer une base de test dédiée vide. Mode `seed` : fixtures synthétiques seulement, via le builder, sans import de production. Le seed refuse une collection déjà remplie. Chaque lot utilise `batch.create` : une collision au commit fait échouer atomiquement tout ce lot avec `DISCOVERY_SEED_COLLISION`, sans overwrite ni merge. Le script s'arrête sans annoncer de succès et ne supprime rien ; des lots précédemment validés peuvent rester présents si un lot ultérieur échoue.
3. Mode `explain` séparé, en lecture seule : réutilise exactement le constructeur de requêtes du moteur, quotas et curseurs compris. Les cas couvrent les quatre familles d'index, bounds et antiméridien.
4. Inspecter les métriques brutes par page/plage (`indexesUsed`, `index_entries_scanned`, `documents_scanned`, lectures facturées, résultats et durée). Comparer les recherches denses avec le volume d'historique conservé. Réévaluer l'ordre ou la stratégie avant validation définitive si le coût mesuré est disproportionné.

Exemples (ne pas exécuter sans projet de test explicitement fourni) :

```sh
node functions/scripts/discovery-query-explain.mjs seed --project-id TEST_PROJECT_ID --confirm-test-project TEST_PROJECT_ID
node functions/scripts/discovery-query-explain.mjs explain --project-id TEST_PROJECT_ID --confirm-test-project TEST_PROJECT_ID
```

Ces commandes échouent tant que la variable d'autorisation dédiée n'est pas renseignée. `npm run test:query-explain:guards` vérifie les gardes locales, y compris le CLI refusé avant tout import SDK ; son cas positif teste uniquement la fonction pure et ne lance pas Firebase.

Query Explain avec analyse exécute réellement les lectures dans le projet de test. Sans projet identifié, le statut reste **PRÊT MAIS NON EXÉCUTÉ — PROJET DE TEST REQUIS**. Aucun travail de carte ou contrôleur D2 n'est inclus.

### Sous-collection : Membres
**Chemin :** `/events/{eventId}/members/{userId}`  
Définit qui peut gérer cet événement spécifique.

*   `uid` (string) : UID du membre.
*   `role` (enum) : `'admin' | 'editor' | 'viewer'`.
*   `joinedAt` (timestamp) : Date d'ajout à l'événement.

### Sous-collection : Configuration
**Chemin :** `/events/{eventId}/config/{docId}`  
Contient les paramètres spécifiques de l'événement.

*   **Document `main` :**
    *   `isLandingPageActive` (boolean) : Affiche la page d'attente.
    *   `reviewsEnabled` (boolean) : Active/Désactive les commentaires.
    *   `festivalMode` (boolean) : Paramètres UI spécifiques.
*   **Document `marketing` :**
    *   `heroEnabled` (boolean) : Active l'overlay de bienvenue.
    *   `heroTitle` (string) : Titre marketing.
    *   `heroSubtitle` (string) : Sous-titre.
    *   `heroImageUrl` (string) : Image de fond.
    *   `heroCtaText` (string) : Libellé du bouton.
    *   `heroCtaMode` (enum) : `'auth' | 'external' | 'none' | 'close'`.

### Sous-collection : Points d'Intérêt (Privé)
**Chemin :** `/events/{eventId}/pois/{poiId}`  
Données complètes des lieux (réservé aux membres ou visiteurs si publié).

*   `title` (string) : Nom du lieu.
*   `description` (string) : Description détaillée.
*   `headerPhotoUrl` (string) : Image principale.
*   `location` (geopoint/obj) : `{ lat: number, lng: number }`.
*   `categoryId` (string) : Identifiant stable d'une catégorie définie dans `events/{eventId}.poiCategories`.
*   `averageRating` (number) : Note moyenne.
*   `reviewCount` (number) : Nombre total d'avis.
*   `galleryUrls` (array) : Liste d'objets `{ url: string, path: string }`.
*   `sponsor` (object | null) : Données de partenariat (level, priority, dates).

#### Sous-sous-collection : Avis
**Chemin :** `/events/{eventId}/pois/{poiId}/reviews/{reviewId}`

*   `userId` (string) : UID de l'auteur.
*   `userDisplayName` (string) : Nom de l'auteur.
*   `userPhotoURL` (string) : Photo de l'auteur.
*   `rating` (number) : Note (1-5).
*   `comment` (string) : Texte de l'avis.
*   `createdAt` (timestamp) : Date de publication.

### Sous-collection : Points d'Intérêt (Public / Lite)
**Chemin :** `/events/{eventId}/pois_public/{poiId}`  
Projection allégée synchronisée pour un chargement rapide de la carte par les visiteurs.
Contient notamment `categoryId` pour résoudre label et icône via le document Event déjà chargé.

---

## 3. Collections Legacy (Mode Global)
**Chemin :** Root `/pois`, `/pois_public` et `/config`  
Utilisées uniquement lorsque l'application est en mode global (hors événement spécifique). Schéma identique aux sous-collections événementielles correspondantes.
