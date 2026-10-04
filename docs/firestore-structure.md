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
*   `status` (enum) : `'draft' | 'published' | 'archived'`.
*   `createdAt` (timestamp) : Date de création.
*   `updatedAt` (timestamp) : Dernière mise à jour.
*   `poiCategories` (array) : Catégories POI configurées pour l'événement. Chaque entrée contient `{ id, label, icon }`.

### Contrat temporel Event — Discovery V1-A

Deux modes exclusifs, avec un `timezone` IANA validé côté serveur :

*   `timePrecision: 'date'` : `startDay` et `endDay` sont des chaînes `YYYY-MM-DD`, jours calendaires inclusifs, avec `startDay <= endDay`. Aucun `startDate` ou `endDate` n'est stocké.
*   `timePrecision: 'datetime'` : `startDate` et `endDate` sont des Firestore Timestamps représentant des instants, avec `startDate <= endDate`. Aucun `startDay` ou `endDay` n'est stocké. L'application les lit en `Date` et les affiche dans le fuseau du contenu.

La création et l'édition actuelles saisissent uniquement des jours. L'édition de la période passe par `updateEventCalendarTime` (admin Event, `adminId` historique ou owner) ; les autres informations gardent leur parcours existant. Les règles interdisent les changements temporels directs côté client, y compris pour l'owner. La validation réelle du calendrier et du fuseau appartient aux mutations serveur ; les règles vérifient également la forme du document.

Les instants précis sont reconnus et conservés, mais leur saisie/édition locale est différée. Aucun Timestamp historique ne prouve une précision horaire.

Sans `timePrecision`, un Event reste administrable mais apparaît avec « Dates à vérifier ». Il ne participe pas aux filtres temporels tant que sa période n'a pas été confirmée. Pour les quelques Events de démonstration : vérifier manuellement les jours et le fuseau, puis utiliser « Enregistrer la période ». Cette action retire uniquement les anciens champs temporels et ne touche ni aux Points, ni aux memberships, ni aux droits commerciaux. Aucune migration automatique n'est prévue.

Les helpers communs (`functions/src/event-time.ts`, réexportés dans `src/lib/event-time.ts`) préparent : Aujourd'hui et Date choisie par chevauchement de jours dans le fuseau du contenu ; Ce week-end = samedi/dimanche à venir en semaine, en cours le samedi/dimanche ; Maintenant = uniquement un mode `datetime` valide avec `startDate <= now <= endDate`. Un Event à la journée n'est jamais implicitement « en cours maintenant ».

Lors d'une mise en service ultérieure, coordonner les Functions, les règles et le client : le nouveau payload de création utilise `startDay`/`endDay`, et l'édition exige la nouvelle Function. Aucun déploiement n'est réalisé par ce sprint.

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
