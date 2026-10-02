# Fixtures

Réponses d'API simulées, lues quand `SOURCE_MODE=fixtures` (SPEC.md §13) : la collecte, le
pipeline et le dashboard tournent sans clé d'API ni réseau.

## France Travail (`francetravail/`)

Chaque fichier décrit des offres renvoyées à toute requête portant les paramètres `match` :

```json
{ "description": "…", "match": { "departement": "31" }, "offers": [ { "id": "FX00001", … } ] }
```

Une requête reçoit les offres de toutes les fixtures dont les paramètres `match` sont présents
avec la même valeur ; sans correspondance, le résultat est vide (comme un HTTP 204).

Les offres sont **fictives** (identifiants `FX…`, entreprises `EXEMPLE …`) et reprennent le
format documenté de l'API, y compris de faux champs `contact` et `agence` pour vérifier qu'ils
sont retirés avant écriture. Aucune réponse réelle n'est versionnée tant que la licence de
réutilisation des offres (SPEC.md §15.4) n'est pas vérifiée.
