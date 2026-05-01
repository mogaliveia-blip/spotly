# Audit Firestore - Architecture Spotly Multi-Événement

**Date de l'audit :** Juin 2024  
**Statut :** En cours de transition (Legacy -> Multi-Event)

## 1. État des Collections Racine

| Collection | Rôle Actuel | État | Utilisation par le Code | Recommandation |
| :--- | :--- | :--- | :--- | :--- |
| `/users` | Gestion globale des comptes et accès plateforme. | **ACTIF** | Indispensable (Auth + Rôles). | Conserver (Global). |
| `/events` | Registre central de tous les événements/festivals. | **ACTIF** | Utilisé pour la résolution des slugs. | Conserver (Global). |
| `/config` | Paramètres par défaut de la plateforme. | **LEGACY** | Fallback pour le "Mode Global" (`/dashboard`). | Migrer le contenu vers `/events/.../config`. |
| `/pois` | Points d'intérêt hors événement (global). | **LEGACY** | Fallback pour le "Mode Global" (`/pois`). | Supprimer après migration des POIs racine. |
| `/pois_public` | Projections allégées des POIs globaux. | **LEGACY** | Fallback pour le "Mode Global". | Supprimer après migration. |

---

## 2. Structure Multi-Événement (Sous-collections)

Chemin cible : `/events/{eventId}/...`

| Sous-collection | Rôle | État | Observations |
| :--- | :--- | :--- | :--- |
| `members` | Permissions spécifiques à l'événement. | **ACTIF** | Lie un UID à un rôle (`admin`, `editor`, `viewer`). |
| `config` | Paramètres locaux (Landing, Marketing). | **ACTIF** | Documents `main` et `marketing` par événement. |
| `pois` | Données complètes des lieux du festival. | **ACTIF** | Stockage compartimenté par `eventId`. |
| `pois_public` | Projections synchronisées pour la carte. | **ACTIF** | Utilisé par `fetchPoisLite` pour la performance. |
| `reviews` | Avis utilisateurs par lieu. | **ACTIF** | Situé dans `/events/{eventId}/pois/{poiId}/reviews`. |

---

## 3. Analyse Spécifique : /config vs /events/{eventId}/config

Une confusion majeure a été identifiée entre ces deux niveaux :
*   **Root `/config/main`** : Détermine si la plateforme entière est en maintenance ou en mode landing. Actuellement utilisé quand aucun slug n'est présent.
*   **Sub `/events/{eventId}/config/main`** : Détermine les paramètres propres à un festival (ex: désactiver les avis pour *Sicile-2026* uniquement).

**Verdict :** Le code privilégie désormais le scope spécifique. La collection racine ne sert plus que de "valeur par défaut" sécurisante.

---

## 4. Incohérences et Points de Confusion

### A. Terminologie Propriétaire
*   **Ancien (Legacy)** : Le champ `ownerId` était présent dans certains documents `events`.
*   **Nouveau (Multi-Event)** : Le code utilise désormais exclusivement `adminId` pour désigner le créateur/gestionnaire de l'événement. 
*   *Action :* Les anciens documents Firestore contenant `ownerId` doivent être mis à jour manuellement vers `adminId`.

### B. Hiérarchie des Rôles
*   **Global (`/users/{uid}`)** : Rôles `owner`, `admin`, `editor`, `user`.
*   **Local (`/events/{id}/members`)** : Rôles `admin`, `editor`, `viewer`.
*   *Point critique :* Un `admin` local ne peut pas modifier un `admin` global. Seul un `owner` global peut gérer le tableau `/admin` de la plateforme.

---

## 5. Audit de Migration des Données (Diagnostic)

1.  **Données POI Fantômes** : Des documents existent probablement encore dans `/pois` (racine) suite à la résolution d'une ancienne *race condition* où le `eventId` n'était pas encore résolu lors de la sauvegarde.
2.  **Synchronisation** : Les nouveaux POIs sont correctement écrits en transaction dans :
    *   `events/{eventId}/pois` (Source de vérité)
    *   `events/{eventId}/pois_public` (Cache de lecture)

---

## 6. Recommandations de Nettoyage

1.  **Uniformisation** : Passer un script pour renommer tous les `ownerId` en `adminId` dans la collection `events`.
2.  **Désactivation Global** : Une fois la phase multi-événement stabilisée, désactiver l'accès aux routes `/pois` et `/pois/new` (sans slug) pour forcer l'usage d'un contexte événement.
3.  **Audit de Schéma** : S'assurer que chaque document dans `events` possède bien les deux documents de config (`main` et `marketing`) dès sa création (géré actuellement par `createEvent` dans `data.ts`).
