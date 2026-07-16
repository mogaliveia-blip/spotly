# Migration CTA marketing

Les nouveaux événements utilisent désormais un overlay marketing sans CTA par défaut :

```json
{
  "heroCtaMode": "none",
  "heroCtaText": ""
}
```

Les événements existants peuvent encore avoir les anciennes valeurs dans Firestore :

```text
events/{eventId}/config/marketing
```

Pour supprimer le bouton CTA existant sans changer le reste de la configuration marketing, mettre à jour uniquement ces champs :

```json
{
  "heroCtaMode": "none",
  "heroCtaText": ""
}
```

Cette migration doit être faite événement par événement depuis la console Firestore ou via une opération admin ciblée. Ne pas exécuter de migration automatique globale sans validation préalable des événements concernés.
