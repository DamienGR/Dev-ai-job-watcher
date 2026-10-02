# Journal des changements de la taxonomie

Toute modification de [`taxonomy.yaml`](taxonomy.yaml) incrémente `version`, met à jour
`updated` et ajoute ici une entrée, de la plus récente à la plus ancienne (SPEC.md §0, §9.2) :

- titre `## v<N> — <AAAA-MM-JJ>`, avec la même date que `updated` (vérifié par `npm test`) ;
- chaque changement et sa justification chiffrée : n observé, exemples d'intitulés, source
  externe pour un nouveau rôle ;
- les cas ajoutés dans `tests/fixtures/titles.json` pour chaque motif ajouté ou modifié.

Un `id` n'est jamais supprimé ni renommé : un rôle abandonné passe en `status: deprecated`.

## v1 — 2026-10-02

Taxonomie initiale, validée avec la spec de cadrage : 9 groupes, 51 rôles, 118 technologies,
signaux `genai`, `ai_any`, `remote`, `tjm` et `travel`, 5 types d'employeurs. Motifs testés sur
les cas de l'annexe B de SPEC.md, repris dans `tests/fixtures/titles.json`.
