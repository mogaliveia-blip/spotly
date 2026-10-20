# D6.4 — CORS des photos de programme

`getBlob()` télécharge directement depuis le SDK Firebase Storage. Le navigateur exige CORS ; les droits restent contrôlés par `storage.rules`. Ce fichier de configuration n'est pas appliqué par le code ni par App Hosting.

Bucket configuré par `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET` : `spotly-app-events.firebasestorage.app`. Le domaine canonique est `https://uninstantici.com` ; le serveur local du dépôt utilise le port 9002. Vérifier toute autre origine réellement utilisée avant publication. La configuration n'autorise que `GET`, sans origine générique.

Lors de la publication contrôlée, sauvegarder d'abord la configuration existante :

```sh
gsutil cors get gs://spotly-app-events.firebasestorage.app > /tmp/uninstantici-cors-before-d6.json
gsutil cors set storage-cors.program-photos.json gs://spotly-app-events.firebasestorage.app
gsutil cors get gs://spotly-app-events.firebasestorage.app
```

L'investigation D6.4 a trouvé le bucket sans CORS. Avant l'application, vérifier que le fichier de sauvegarde contient du JSON valide ; si `cors get` signale toujours l'absence de configuration, enregistrer `[]` dans ce fichier. Ne pas utiliser un fichier vide pour le retour arrière.

Vérifier ensuite `getBlob()` sur le site public, depuis une origine autorisée, pour une photo publiée ; vérifier aussi un brouillon, une prestation dépubliée et un Event privé. Le refus d'accès doit provenir des Storage Rules, indépendamment de CORS.

Pour revenir à la configuration sauvegardée :

```sh
gsutil cors set /tmp/uninstantici-cors-before-d6.json gs://spotly-app-events.firebasestorage.app
gsutil cors get gs://spotly-app-events.firebasestorage.app
```

Une image déjà téléchargée peut avoir été conservée ou copiée. Dépublier la prestation ou rendre l'Event privé bloque les nouvelles lectures par le SDK ; cela n'efface pas ces copies.
