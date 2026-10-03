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

## Lot 1 — Collecte France Travail (2026-10-02)

### D11. Points [À VÉRIFIER] : valeurs de la spec, tranchées par une sonde

La documentation de l'API sur francetravail.io est une application web qui ne livre son
contenu qu'à un navigateur : elle n'a pas pu être lue d'ici. Une documentation tierce
(bibliothèque `api-offres-emploi`) indique pour `range` un premier indice ≤ 1000, un dernier
≤ 1149 et 150 résultats par page, ce qui concorde avec la borne prudente de la spec. Le code
retient donc les valeurs de la spec : plafond de 1 150 résultats par requête, dates au format
`2026-10-05T00:00:00Z`, 8 appels/s. Le script `npm run probe:ft` interroge l'API réelle et
tranche chaque point (pagination, dates, `motsCles`, `region`, champs, codes ROME M18) ; il
doit être lancé avant la mise en service, dès que les identifiants sont disponibles. Lancé le
2026-10-03 : résultats et ajustements en D18 et D19.

### D12. Un objet d'état par étape

`state/runs/<runId>/<étape>.json` (ex. `runs/2026-W41/collect-ft.json`) au lieu d'un seul
`runs/<runId>.json` (SPEC.md §3.4) : les deux collecteurs tournent en parallèle et
s'écraseraient. L'état est lu en cohérence forte (`consistency: 'strong'`).

### D13. Découpage adaptatif

- Passe A : partition nationale → code ROME → dates de création (D19) ; passe B : mot-clé →
  région → département → dates. Une région d'un seul département passe directement aux dates.
- Dates : division en deux de la fenêtre [2000-01-01, début du run], puis des moitiés, jusqu'à
  passer sous le plafond. La borne haute est l'instant de référence enregistré dans l'état :
  une reprise recalcule les mêmes clés.
- Une partition impossible à découper (fenêtre de moins de 2 s) est lue jusqu'au plafond,
  marquée `truncated` et signalée dans les erreurs du run.
- Une partition vide (HTTP 204) est quand même écrite dans `raw` (total 0) : la couverture de
  la collecte reste lisible.

### D14. Données personnelles retirées avant écriture

Outre l'objet `contact` (exigé, §11), l'objet `agence` (coordonnées de l'agence France
Travail) est retiré. Par précaution, les e-mails et numéros de téléphone cités dans
`description` et `entreprise.description` sont masqués (`[e-mail masqué]`,
`[téléphone masqué]`) ; les montants, codes postaux et SIRET sont laissés intacts (testé).

### D15. Erreurs, nouvelles tentatives et reprise

- Client HTTP : 5 nouvelles tentatives (1, 2, 4, 8, 16 s) sur 429, 5xx et erreurs réseau ;
  `Retry-After` respecté, plafonné à 60 s. Un 401 renouvelle le jeton une fois.
- Partition : une erreur 4xx (hors 429) la met en échec tout de suite ; une erreur transitoire
  est retentée une fois dans la même exécution. Les partitions en échec sont retentées à la
  relance suivante (`api-admin`, puis `weekly-process` au lot 5).
- Jeton refusé : la collecte échoue avant toute écriture.
- Échéance : la fonction background rend la main à 13 min, état enregistré ; la reprise
  automatique (rappel de la fonction, 5 enchaînements au plus) arrive au lot 5 avec la
  planification. Un run complet n'est pas refait, sauf `reset`.
- 4 partitions traitées en parallèle, sous un limiteur commun de 8 appels/s.

### D16. Fixtures synthétiques

`fixtures/francetravail/` contient des offres fictives au format de l'API, pas de réponses
réelles : la licence de réutilisation des offres (§15.4) n'est pas encore vérifiée et le dépôt
ne doit contenir aucune donnée collectée.

### D17. Outillage

- `npm run collect:ft` lance la collecte en local, stockage sur disque (`.data/`, ignoré par
  git), en mode `live` ou `fixtures` ; `npm run probe:ft` lance la sonde. Les deux lisent
  `.env` s'il existe et s'exécutent avec `tsx`.
- La logique des fonctions Netlify est dans `src/functions/` (testable) ; les fichiers
  `netlify/functions/*.mts` ne font que la brancher. `allowImportingTsExtensions` permet aux
  tests d'importer ces `.mts`.
- `api-admin` : corps `{ step, runId, reset? }` ; les étapes des lots suivants répondent 501.
  L'URL du site vient du contexte Netlify (`context.site.url`), à défaut de `URL`.

### D18. Résultats de la sonde (2026-10-03)

`npm run probe:ft` et deux sondes complémentaires (300 appels au total, aucune nouvelle
tentative) sur l'API réelle :

- **Pagination** : premier indice de `range` ≤ 3000 (« La position de début doit être
  inférieure ou égale à 3000. »), 150 résultats par page au plus (« La plage de résultats
  demandée est trop importante. » au-delà). Sur `departement=75` (14 753 offres), les pages
  jusqu'à l'indice 3149 renvoient des offres distinctes. `FT_MAX_RESULTS` passe de 1 150 à
  **3 150**.
- **Dates** : `YYYY-MM-DDTHH:MM:SSZ` sans millisecondes ; une date seule ou des millisecondes
  donnent un HTTP 400, et `minCreationDate` / `maxCreationDate` sont obligatoirement fournis
  ensemble. Le code était déjà conforme.
- **`motsCles`** : plusieurs mots, séparés par une espace ou une virgule, sont combinés en ET
  (`data` 1 137, `engineer` 731, `data engineer` 465), recherchés dans l'intitulé et la
  description. Un mot-clé de plusieurs mots ramène donc un sur-ensemble de l'expression exacte ;
  la règle de rétention de la passe B fait le tri.
- **`region`** : accepté (codes INSEE, DROM compris) ; `departement` accepte plusieurs valeurs.
  Les offres localisées à la seule région ou au seul pays échappent aux filtres plus fins (D19).
- **Champs** : tous les champs de SPEC.md §4.1 existent sous le nom prévu. `codeNAF` n'est
  renseigné que sur 47 % des offres (format `62.02A`) ; `lieuTravail.libelle` vaut
  « département - commune » (`75 - Paris 7e Arrondissement`) et `commune` le code INSEE ;
  `typeContrat` observés : `CDI`, `LIB`, `CDD`, `MIS`. `contact` est présent sur toutes les
  offres : son retrait (D14) est indispensable.
- **Codes ROME** : M1801 à M1820 existent. M1818 (ingénieur d'étude informatique : ingénieur
  logiciel, architecte logiciel) est ajouté au `core` de la taxonomie (v3, détail dans
  `TAXONOMY_CHANGELOG.md`).
- **Volumes** : la passe A compte environ 2 900 offres avec M1818 (2 714 sans), loin des 15 à
  30 k annoncés par SPEC.md §4.1. La passe B compte 2 070 offres avant dédoublonnage, pour
  75 mots-clés dont 22 ne renvoient rien ; aucun ne dépasse 536 résultats.

### D19. Passe A en une partition nationale

Écart à SPEC.md §4.1 (passe A, point 2, non marqué « exigé »), validé par Damien le
2026-10-03. Partitionner par département perd les offres qui n'en ont pas : sur les codes ROME
de la taxonomie v2, 2 714 offres au niveau national contre 2 623 en additionnant les 101
départements, soit 91 offres (3,4 %) jamais collectées. Les découpages par code ROME et par
dates, eux, ne perdent rien.

La passe A part donc d'une seule partition nationale (`a-fr`), redécoupée par code ROME puis
par dates si elle dépasse le plafond, ce qui reste un partitionnement adaptatif (exigé). Avec
le volume actuel, elle tient sous le plafond : une vingtaine d'appels au lieu de 120 environ.
Contrepartie : un échec rejoue la partition entière, soit une vingtaine de pages.

La passe B garde le découpage de la spec (région puis département), qui a la même perte
(`motsCles=data` : 1 137 au national, 1 117 en additionnant les régions). Il ne se déclenche
pas aujourd'hui, aucun mot-clé n'approchant le plafond.

### D20. Licence de réutilisation des offres France Travail (§15.4)

Validée par Damien le 2026-10-03, après la fusion du lot 1 : l'usage du projet, des
statistiques agrégées sur les offres, lui convient au regard de la licence. En conséquence :

- la collecte France Travail peut tourner en production dès que le site Netlify est configuré ;
- le dashboard (lot 4) affiche la mention de la source, « Source : France Travail », comme le
  demande SPEC.md §11 ;
- rien ne change pour le dépôt : il ne contient toujours aucune donnée collectée (CLAUDE.md),
  et les fixtures restent fictives (D16).

## Lot 2 — Traitement et agrégats (2026-10-03)

D21 est réservé à la décision d'hébergement de la collecte et du traitement (Netlify ou
serveur de Damien), en cours de discussion.

### D22. Traitement indépendant de l'hébergement

Le plan Netlify du compte pourrait ne pas offrir de fonctions background (D21 en attente). Le
traitement est donc une fonction `processRun(runId, { stores, log, taxonomy })`
(`src/pipeline/process.ts`) qui ne dépend que de l'interface des stores : le script
`npm run process` l'appelle sur le disque, une fonction Netlify ou un cron pourra l'appeler sur
Netlify Blobs. La fonction `process-background` et le branchement de l'étape `process` dans
`api-admin` attendront D21 (l'étape répond toujours 501).

- **Pas de checkpoint ni d'auto-relance** (§12) : le traitement d'une semaine réelle prend 7 s
  (D29), loin des 13 minutes d'une fonction background.
- **Verrou** : le verrou global (`state/locks/…`) arrive au lot 5 avec la planification. En
  attendant, un traitement refuse de démarrer si le même run est « en cours » depuis moins de
  20 minutes (TTL de §12).
- **Rejouable** (§12) : avant le premier traitement d'un run, l'index `seen` est copié sous
  `index/seen-before/<run>.json.gz` ; une relance repart de cette copie et réécrit les mêmes
  clés. Un run plus ancien que le dernier traité est refusé : il effacerait les suivants. Le
  retraitement de tout l'historique relève de la reclassification (lot 6).
- Compte rendu dans `state/runs/<run>/process.json` (compteurs, état de la collecte, erreur),
  source de `quality.json`.

### D23. Salaires

Règles exigées de §6.3 appliquées telles quelles ; latitudes prises :

- `salaire.libelle` : seul le début est lu (`Annuel|Mensuel|Horaire de X Euros [à Y Euros]
  [sur N mois]`) ; la suite (« - Mutuelle + TR ») est un commentaire libre de l'employeur. Le
  nombre de mois d'un salaire mensuel est aussi cherché dans cette suite (« - sur 13 mois »).
- Repli sur `salaire.commentaire` si le libellé est absent ou non reconnu (« Salaire selon
  profil »). Montant suivi de « k » = milliers, le « k » final valant pour les deux bornes ;
  sans « k », un montant ≥ 10 000 est annuel, un montant de 1 000 à 9 999 est mensuel (× 12)
  si le texte parle de mois et pas d'année ; tout montant plus petit est ignoré, ce qui écarte
  les TJM (« 500 € par jour ») et les durées (« 3 à 5 ans »).
- Le commentaire de salaire porte souvent un TJM (« 500 € par jour » : 175 offres retenues du
  run W40, presque tous les TJM trouvés) : il est ajouté au texte du signal `tjm` et de
  `parseTjm`.
- Hors bornes : la borne est écartée et l'offre comptée dans `salaryOutOfBounds`
  (`quality.json`). Sur le run W40, 73 offres sont concernées, dont 21 salaires annuels saisis
  comme mensuels (« Mensuel de 45000 Euros ») : la règle exigée (mensuel × 12) les écarte. Un
  correctif (mensuel ≥ 10 000 lu comme annuel) reste à décider.

### D24. Localisation

- Ordre de précision : code commune (`lieuTravail.commune`) ; sinon préfixe département du
  libellé (« 75 - Paris ») ; sinon nom de région (« Île-de-France », graphies sans accent et
  anciennes régions comprises) ; sinon « France » → `pays`. Sans libellé ni commune :
  `aucune`.
- Collectivités d'outre-mer hors des 18 régions (977 Saint-Barthélemy…) : en France, mais
  `precision='pays'`, comptées au seul niveau national.
- Hors de France (§6.2) : tout autre libellé (« Luxembourg », « Belgique », « Montréal, QC,
  Canada »…) et le code pays INSEE 99. Écartées avant classification, comptées dans
  `quality.json` ; leurs libellés les plus fréquents sont gardés dans le compte rendu du run
  pour repérer une erreur d'exclusion.

### D25. Correspondances France Travail (§6.1)

- Contrat : `CDI`, `CDD`, `MIS` → intérim, `LIB` → freelance, autres codes (`CCE`, `DDI`,
  `SAI`…) → `autre`. Alternance : drapeau `alternance` ou `natureContrat` d'apprentissage ou de
  professionnalisation (les deux coïncident sur le run W40). Le signal TJM ne fait passer en
  `freelance` que les contrats `autre` ou inconnus, jamais un CDI.
- Expérience : `D` → `debutant` ; sinon durée de `experienceLibelle` (« 3 An(s) », « 18
  Mois ») en années : moins d'un an → `debutant`, puis `1_3`, `3_5`, `5_plus` ; « Expérience
  exigée » sans durée → `unknown`.
- `cadre` : `qualificationCode` 9 (« Cadre ») ; autre code → `false` ; absent (68 % des
  offres) → `null`. `fullTime` : `dureeTravailLibelleConverti`. `companySizeBand` :
  `trancheEffectifEtab` tel quel.
- Champs lus avec un schéma zod permissif ; une offre sans `id`, `intitule` ou date de
  création valide est écartée et comptée (`invalid`).

### D26. Employeurs

`companyNorm` suit §6.7 (normalisation, ponctuation, formes juridiques, `groupe`, `group`,
`france`). Les motifs de nom des types d'employeur sont essayés sur `companyNorm` **et** sur le
nom normalisé avec sa ponctuation : sans cela, `ap-hp` et `ernst ?& ?young` de la taxonomie ne
pourraient jamais matcher. Le type `client_final` (`*`) ne vaut que si le NAF est connu (47 %
des offres, D18).

La clé de dédoublonnage inter-sources (§6.8) est calculée dès maintenant
(`sha1(titreClé|companyNorm|département ou région)`, `null` sans entreprise) ; son usage
arrive avec Adzuna au lot 3. Le dédoublonnage intra-source se fait par `uid` : une offre
présente dans les deux passes n'est comptée qu'une fois, avec `collectedVia: ['keyword', 'rome']`.

### D27. Nouveauté, disparition, premier run (§6.9)

- L'index ne garde que les offres retenues (après règle de rétention et exclusion des offres
  étrangères), avec `closedRun` en plus des champs de §3.4.
- Disparition : une offre France Travail vue avant et absente du run est fermée
  (`closedRun = run`), **seulement si la collecte est complète et sans partition tronquée** ;
  sinon une absence peut venir d'une partition manquante. Une offre fermée puis revue est
  rouverte.
- `isBackfill` : offre découverte au premier run et créée une semaine ISO antérieure.
- Le stock actif d'un run est le contenu de `offers/<run>.jsonl.gz` : `closedRun` n'est pas
  réécrit dans les fichiers des semaines passées, l'index fait foi pour la durée de vie (v2).

### D28. Agrégats (§7)

- **Flux** (nouvelles offres, intitulés, technos, salaires, conditions, employeurs, carte,
  émergence) : chaque offre compte une fois (dernière version de son `uid`, tous runs
  confondus), dans sa semaine ou son mois de création (Europe/Paris). Les doublons
  inter-sources (`duplicateOf`) sont exclus. Le mois d'une semaine est celui de son jeudi.
- **Format** : tables `{ columns, rows }` ; un fichier peut en contenir plusieurs
  (`timeseries.json` : `newOffers` et `stock`). Les tables additives (comptages par groupe)
  n'ont pas de lignes « tous » : le dashboard somme. Les tables non additives (quantiles, top)
  ont des lignes `*` : `region='*'` = France entière, `group='*'`, `role='*'`,
  `experience='*'`, et `month='*'` = les 12 derniers mois (`meta.rollingMonths`).
- **Salaires** : cellules de moins de 5 offres omises (le dashboard affiche « n < 5 ») ;
  `nSalary / n` donne le taux de renseignement. Prime IA = médiane des groupes collectés par
  mots-clés (g3 à g8) − médiane de `g1_dev`, par mois × expérience.
- **Semaines partielles** (`meta.partialWeeks`) : semaines de création antérieures au premier
  run (rattrapage), semaine du dernier run (pas terminée), et toute semaine dont le run de la
  semaine suivante manque, a échoué ou n'a pas eu une collecte complète. `meta.partialMonths`
  : mois touchés par une semaine partielle.
- **Carte** : `nCore` = groupes du périmètre (hors `hors_perimetre` et `non_classe`), densité
  = `nCore` pour 100 000 actifs (D29). Points : seules les offres avec coordonnées (24 % sur le
  run W40, France Travail ne les donne pas toujours) ; aucun référentiel communal n'est ajouté
  (§3.4).
- **Émergence** : moyenne des mois précédents couverts par les données (3 au plus) ; le
  premier mois n'a pas de tendance. Rôles : `seuil` (≥ 5 offres alors que le mois précédent en
  avait moins), `baisse` (moitié ou moins de la moyenne, si celle-ci atteint 5), `stable`.
  Non classés : offres du filet ROME seulement (§9.1).
- `quality.json` : une ligne par run et par source, colonnes de compteurs de §7.1 ; la passe
  se lit dans `collectedA` / `collectedB`.

### D29. Population active INSEE (§7.1, indicateur 11a ; décision ouverte §16.4)

Choisie par Damien le 2026-10-03 : population active de 15 à 64 ans par région, recensement
2023 (dossiers complets INSEE, tableau EMP T1), dans `src/refs/population-active.json` avec
source et méthode. Mayotte n'a pas ce tableau : densité non calculée (`null`).

### D30. Premier traitement réel (run 2026-W40)

Traitement de la collecte nationale du 2026-10-03 en local : 7 s, dont la relecture et les
agrégats. 4 997 offres lues, 3 654 distinctes, 103 lectures écartées hors de France
(Luxembourg 89), 443 écartées par la règle de rétention, **3 211 retenues**. Salaire
exploitable : 36 % ; TJM : 179 offres ; coordonnées : 24 % ; sans région : 17. Agrégats de
3 à 135 Ko par fichier (`salaries.json` : 119 Ko), loin des 2 Mo.

À signaler pour la revue de taxonomie (non corrigé ici, `taxonomy.yaml` inchangée) :
classification à 57 % (1 819 offres classées) ; télétravail inconnu pour 85 % des offres ;
« Coach en développement personnel (PNL / NLP) » classé `nlp_engineer` (offre FX00008 des
fixtures, désormais retenue en passe B).
