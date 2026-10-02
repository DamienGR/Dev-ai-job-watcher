# Décisions d'implémentation

Choix faits là où [SPEC.md](../SPEC.md) laisse une latitude ou une ambiguïté (SPEC.md §0).
Chaque décision est aussi signalée dans la PR du lot concerné. Les plus récentes en bas.

## Lot 0 — Socle (2026-10-02)

### D1. Outillage

- **TypeScript 6.0** (et non 7.0, la dernière version publiée) : `typescript-eslint` 8.71 ne
  supporte que TypeScript < 6.1. À remonter quand il supportera TypeScript 7.
- **Résolution de modules `Bundler`** : imports relatifs sans extension, JSON importables. Le code
  passe toujours par un bundler (esbuild pour les fonctions Netlify, Vite pour le dashboard,
  Vitest pour les tests).
- Vitest 5, ESLint 10 (configuration « flat » + `typescript-eslint`), zod 4, `yaml` 2. Avec
  YAML 1.2, `updated: 2026-10-02` reste une chaîne de caractères.
- Node : `.nvmrc` à `22` (CI et `NODE_VERSION` du build Netlify), `engines` à `>=22.13`,
  minimum exigé par ESLint 10 et Vitest 5.
- CI GitHub Actions sur chaque PR et sur `main` : lint, typecheck, tests, build.

### D2. Page d'attente dans `web/`

`netlify.toml` publie `web/dist`, produit par Vite. Une page d'attente statique permet de
connecter le site à Netlify dès le lot 0 ; le dashboard du lot 4 la remplacera.

### D3. Taxonomie lue à l'exécution

`loadTaxonomy()` lit `taxonomy.yaml` dans le répertoire courant (racine du dépôt en local et en
test). Les fonctions Netlify l'embarquent via `included_files`. **À vérifier au lot 1** sur un
vrai déploiement : chemin du fichier dans le bundle.

### D4. Validation de la taxonomie

- Schéma zod **strict** : une clé inconnue est refusée, pour qu'une faute de frappe (`prority`)
  ne passe pas inaperçue lors d'une revue mensuelle.
- `status: deprecated` est accepté sur les rôles et les technologies (absent = actif).
- `employer_types[].id` est limité aux cinq valeurs du type `Offer.employerType` (§6.1).
- Contrôles ajoutés à ceux du §13 (`npm test` les exécute) : id réservé `non_classe`, cible de
  requalification non dépréciée, famille de technologie existante, héritage de signaux sans
  cycle, codes ROME uniques et au plus 200 (limite de `codeROME`), préfixe NAF `*` réservé au
  dernier type d'employeur, `keywords` présents pour tout rôle actif d'un groupe
  `keyword_pass: true` (sinon la passe B l'ignorerait), entrée `## v<version> — <updated>` dans
  `TAXONOMY_CHANGELOG.md`.

### D5. Classification

- **Priorités égales** : le rôle défini le plus tôt dans `taxonomy.yaml` l'emporte. Le cas
  existe (88 : `ai_solutions_engineer`, `ai_devrel` ; 80 : `chef_projet_ia`,
  `referent_coach_ia`, `formateur_ia`, `ai_ops_manager` ; 74 : `rag_engineer`,
  `llmops_platform`, `ai_evaluation`, `context_engineer`…).
- **Rôles et technologies dépréciés** : ignorés à la classification et à la détection ; leurs id
  restent valides pour l'historique et les libellés.
- **Requalification** : le signal est cherché dans la description seule (§6.5). Le rôle cible
  est retiré des rôles secondaires ; le rôle d'origine n'y est pas ajouté (`requalified=true`
  suffit à le retrouver).

### D6. Portée des signaux

- `genai`, `aiAny` (§6.6), `tjm` (§6.3) et technologies (§6.6) : intitulé + description.
- `remote` et `travel` : description seule, règle par défaut de `taxonomy.yaml` (« appliqués à
  la DESCRIPTION, sauf mention contraire »). Conséquence : « Développeur full remote » sans
  mention dans la description donne `remote='unknown'`. À réévaluer au lot 3 (descriptions
  Adzuna tronquées).

### D7. Extraction du TJM livrée dès le lot 0

Le cas de signaux de l'annexe B attend « TJM 550 » : `parseTjm` (`src/core/salary.ts`) est livré
au lot 0 avec les cas TJM de l'annexe C ; l'analyse des salaires reste au lot 2. Règles :

- montants qui suivent un mot-clé (`tjm`, `taux journalier`, `tarif journalier`, `daily rate`)
  ou précèdent une unité par jour avec une devise (`€/jour`, `€ HT/j`, `per day`) ;
- espace ou point comme séparateur de milliers (« 2 500 », « 1.200 »), décimales ignorées ;
- montants hors de 150 à 2 000 € écartés ; sans montant valable, `{ min: null, max: null }`.

L'extraction n'a de sens que si le signal `tjm` est présent ; sinon `Offer.tjm` vaut `null`.

### D8. Référentiel départements → régions

`src/refs/departements.json` (101 entrées) et `src/refs/regions.json` (18 régions) ont été
comparés le 2026-10-02 à l'API Géo d'Etalab (`geo.api.gouv.fr`) : aucun écart sur les codes,
les noms et les rattachements.

### Vérifications du §15 faites au lot 0

- **§15.1 — plan Netlify** : l'API Netlify donne l'équipe « DamienGR's team » en plan **Free**,
  un plan à crédits (l'ancien plan gratuit s'appelait Starter). D'après la documentation
  Netlify, les background functions sont disponibles sur les plans à crédits Free, Personal et
  Pro. À confirmer au premier déploiement d'une fonction background (lot 1).
- **§15.3 — codes M18 du ROME 4.0** (le commentaire de `taxonomy.yaml` le place au lot 0, le
  §15 au lot 1) : M1811 (Data engineer) existe bien ; la liste complète n'a pas pu être
  confirmée par une source officielle sans identifiants France Travail. Reporté au lot 1 (API
  ROME 4.0), `taxonomy.yaml` inchangé.

### Points relevés sur la taxonomie

Observés en écrivant les tests du lot 0, laissés en l'état dans ce lot, puis **corrigés en
taxonomie v2** (voir `TAXONOMY_CHANGELOG.md`) :

1. **Formes féminines non reconnues** : la normalisation retire l'écriture inclusive (`·e`,
   `(e)`, `.e`) mais pas les formes féminines pleines. « Développeuse Python », « Ingénieure
   logiciel », « Ingénieure IA », « Cheffe de projet IA » et « Programmeuse » sont classés
   `non_classe`. Les motifs couvrent déjà `formatrice`, `chercheuse`, `testeuse`,
   `consultante`… mais pas `developpeuse`, `ingenieure`, `cheffe`, `programmeuse`,
   `conceptrice`. Effet aggravant : une offre trouvée seulement en passe B et non classée est
   écartée par la règle de rétention (§4.1).
2. **Télétravail** : l'ordre `full_remote` > `hybrid` > `on_site` et le motif hybride
   `\bteletravail\b.*\b\d ?(j|jours?)\b`, qui peut couvrir toute la description, donnent
   `hybrid` pour « Pas de télétravail. Formation de 3 jours à l'arrivée. » ou « Télétravail :
   non. […] 5 jours de RTT ».

## Taxonomie v2 — formes féminines et télétravail (2026-10-02)

### D9. Formes féminines traitées dans les motifs, pas dans la normalisation

La normalisation de référence (SPEC.md §6.4, exigée) reste inchangée : ramener les formes
féminines au masculin (« -euse » → « -eur »…) modifierait le texte sur lequel tous les motifs
sont écrits. Les motifs portent donc les deux formes, convention ajoutée en tête de
`taxonomy.yaml`. Les mots-clés de collecte (passe B) restent au masculin : la sémantique de
`motsCles`, à vérifier au lot 1, dira s'il faut aussi les décliner.

### D10. Négations du télétravail traitées dans les motifs

L'ordre `full_remote` > `hybrid` > `on_site` est fixé par SPEC.md §6.6. Les formes niées sont
donc exclues des motifs `full_remote` et `hybrid` par un lookbehind
(`(?<!(pas de|pas en|sans|aucun) )`), et le motif « télétravail … N jours » reste dans la
phrase. Les négations anglaises (« not fully remote ») ne sont pas traitées : elles sont rares
dans les offres France Travail.
