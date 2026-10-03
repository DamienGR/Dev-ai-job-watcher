# Fixtures

Réponses d'API simulées, lues quand `SOURCE_MODE=fixtures` (SPEC.md §13) : la collecte, le
pipeline et le dashboard tournent sans clé d'API ni réseau.

## France Travail (`francetravail/`)

Chaque fichier décrit des offres renvoyées à toute requête portant les paramètres `match` :

```json
{ "description": "…", "match": { "codeROME": "M1805" }, "offers": [ { "id": "FX00002", … } ] }
```

Une requête reçoit les offres de toutes les fixtures dont chaque paramètre `match` figure parmi
les valeurs, séparées par des virgules, du paramètre de même nom : la passe A nationale
(`codeROME=M1805,M1811,…`) reçoit ainsi les offres de tous les fichiers `rome-*.json`. Sans
correspondance, le résultat est vide (comme un HTTP 204).

Les offres sont **fictives** (identifiants `FX…`, entreprises `EXEMPLE …`) et reprennent le
format documenté de l'API, y compris de faux champs `contact` et `agence` pour vérifier qu'ils
sont retirés avant écriture. Aucune réponse réelle n'est versionnée tant que la licence de
réutilisation des offres (SPEC.md §15.4) n'est pas vérifiée.
