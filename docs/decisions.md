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

## Hébergement (2026-10-03)

### D21. Collecte et traitement sur le VPS de Damien, dashboard sur Netlify

Écart à un point **exigé** de SPEC.md §3.2 (« un site Netlify unique : dashboard + fonctions »),
validé par Damien le 2026-10-03. SPEC.md passe en version 1.1.

**Constat (§15.1).** Le site Netlify `dev-ai-job-watcher` a été créé le 2026-10-03 dans l'équipe
« DamienGR's team ». Le compte date de 2019, et les comptes ouverts avant le 4 septembre 2025
sont sur un plan legacy (Free, Starter ou Pro), même quand le plan s'appelle « Free ». L'API
Netlify donne pour l'équipe et ses sites le plan interne `nf_team_dev`, celui de l'offre
gratuite historique (déduction : l'API n'affiche pas le libellé du plan). La vérification du
lot 0, qui concluait à un plan à crédits sur le seul nom « Free », est donc corrigée. Or les
plans Free et Starter legacy n'ont pas de fonctions background. Le site `vps-stock-watch` du même
compte tourne avec une fonction planifiée, disponible sur ces plans, ce qui ne contredit pas le
constat.

**Options écartées**

- Passer l'équipe au plan Free à crédits : changement définitif, et les 74 autres sites de
  l'équipe, dont des sites clients, partageraient 300 crédits par mois. Une fois ces crédits
  épuisés, Netlify met tous les sites de l'équipe en pause jusqu'au mois suivant.
- Équipe dédiée au plan Free à crédits : 15 crédits par déploiement de production, soit une
  vingtaine de fusions par mois au plus. La documentation Netlify ne dit pas non plus si un
  compte peut posséder une deuxième équipe gratuite.
- Tout en fonctions planifiées (30 s) : la collecte tient en 20 s aujourd'hui (D18), sans marge,
  et le reclassement de tout l'historique dépassera vite cette limite.

**Choix**

- Le VPS OVH de Damien exécute la collecte, le traitement et le reclassement : scripts Node
  lancés par des timers systemd, stores sur son disque (`src/storage/filesystem.ts`, déjà
  utilisé par les scripts), relances et reprise par l'état de run.
- Le site Netlify garde le dashboard et des fonctions synchrones (`api-ingest`, `api-data`,
  `api-export`) plus une fonction planifiée (`watchdog`). Le plan legacy ne change pas : aucune
  fonction background, aucun crédit consommé.
- Le VPS envoie les seuls agrégats au site par `api-ingest`, protégée par `INGEST_SECRET`. Pas
  de jeton personnel Netlify sur le VPS : il donnerait accès à tout le compte, et Netlify ne
  permet pas d'en restreindre la portée. Les agrégats pèsent quelques centaines de Ko au plus,
  loin des 6 Mo d'un corps de requête.
- Le VPS n'expose aucun port pour le projet : il appelle France Travail, Adzuna et le site.
  L'administration (`admin`) passe par SSH.
- `watchdog` vérifie sur Netlify qu'un run a réussi dans les 8 derniers jours : l'alerte
  « aucun run réussi » (§10) fonctionne même si le VPS est arrêté.

**Conséquences**

- SPEC.md 1.1 : §3 réécrit (vue d'ensemble, choix techniques, jobs et fonctions, stockage,
  variables, arborescence), §9.3, §10, §11, §12, §13, §14 (lots 4 à 6), §15 et §16.
- Variables : `INTERNAL_SECRET` et `ADMIN_TOKEN` disparaissent ; `INGEST_SECRET`, `SITE_URL`
  et `DATA_DIR` apparaissent. `.env.example` et le README suivront au lot qui les utilise.
- Code du lot 1 : `collect-francetravail-background` et `api-admin` restent en place jusqu'au
  lot 5, qui les remplace par les jobs `weekly-run` et `admin`. Sans `INTERNAL_SECRET` ni
  `ADMIN_TOKEN` côté Netlify, ces deux fonctions refusent toute requête.
- Lot 4 : `api-ingest` et l'envoi des agrégats arrivent avec le dashboard, qui en a besoin.
- Lot 6 : le reclassement ne suit plus le déploiement mais le job quotidien `update`. Une
  taxonomie fusionnée est appliquée au plus tard le lendemain.
- Nouveau risque : `raw` n'existe que sur le disque du VPS. Une sauvegarde hebdomadaire hors du
  VPS est exigée (§3.4), son moyen est une décision ouverte (§16.6).
- La maintenance du VPS (système, Node 22, timers) revient à Damien.
- D20 : « la collecte peut tourner en production dès que le site Netlify est configuré » se lit
  désormais « dès que le VPS est installé (lot 5) ».

## Lot 2 — Traitement et agrégats (2026-10-03)

### D22. Traitement lancé par script

Conformément à D21, le traitement ne tourne pas dans une fonction Netlify background : c'est
une fonction `processRun(runId, { stores, log, taxonomy })` (`src/pipeline/process.ts`),
lancée par `npm run process -- --run-id <run>` après la collecte, sur les stores du disque. Elle
ne dépend que de l'interface des stores et ne sait pas où elle tourne. Il n'y a pas de fonction
`process-background`. Suivent SPEC.md 1.1 : l'envoi des agrégats par `api-ingest` (lot 4) et
le job `admin` (lot 5), qui remplacera l'étape `process` d'`api-admin` (elle répond toujours
501).

- **Pas de reprise partielle** : le traitement d'une semaine réelle prend environ 8 s (D30) ;
  un traitement interrompu est rejoué en entier (§12).
- **Verrou** : le verrou du VPS (`flock`, §12) arrive au lot 5 avec les jobs. En attendant, un
  traitement refuse de démarrer si le même run est « en cours » depuis moins de 20 minutes.
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
- **Écart à la règle exigée « mensuel × nombre de mois », validé par Damien le 2026-10-03** :
  un montant mensuel d'au moins 18 000 € est un salaire annuel saisi dans le mauvais champ
  (« Mensuel de 45000 Euros », soit 540 000 € par an une fois multiplié par 12) et il est lu
  tel quel. Sur le run W40, cela récupère 21 salaires que les bornes de cohérence écartaient. Le seuil s'applique à chaque borne :
  « Mensuel de 2500 Euros à 30000 Euros » donne 30 000 € dans les deux cas.
- Hors bornes : la borne est écartée et l'offre comptée dans `salaryOutOfBounds`
  (`quality.json`) : 47 offres sur le run W40 (salaires d'alternance ou de temps partiel sous
  18 000 €, montants horaires ou mensuels incohérents).

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

Traitement de la collecte nationale du 2026-10-03 en local : 7 à 8 s, dont la relecture et les
agrégats. 4 997 offres lues, 3 654 distinctes, 103 lectures écartées hors de France
(Luxembourg 89), 443 écartées par la règle de rétention, **3 211 retenues**. Salaire
exploitable : 37 % (1 177 offres, médiane 42 000 €) ; TJM : 179 offres ; coordonnées : 24 % ; sans région : 17. Agrégats de
3 à 135 Ko par fichier (`salaries.json` : 119 Ko), loin des 2 Mo.

À signaler pour la revue de taxonomie (non corrigé ici, `taxonomy.yaml` inchangée) :
classification à 57 % (1 819 offres classées) ; télétravail inconnu pour 85 % des offres ;
« Coach en développement personnel (PNL / NLP) » classé `nlp_engineer` (offre FX00008 des
fixtures, désormais retenue en passe B).

## Lot 4 — Dashboard MVP (2026-10-03)

### D31. Le lot 4 passe avant le lot 3

Choisi par Damien le 2026-10-03. Le lot 3 (Adzuna) attend des actions de sa part : créer le
compte développeur et ses clés, et dire si le projet relève de la « recherche personnelle »,
que les conditions d'Adzuna autorisent, ou d'un usage professionnel, qui demande leur accord
écrit même pour des agrégats. Le dashboard ne dépend que des données France Travail.

- La règle « un lot à la fois » (CLAUDE.md, SPEC.md §0) vaut toujours : le lot 3 démarrera
  après la fusion du lot 4.
- Le dashboard n'affiche que France Travail. Le filtre « source » propose Adzuna, grisé
  (« à venir ») ; `api-ingest` accepte déjà `adzuna-stats.json`.
- La mention d'Adzuna exigée par ses conditions pour des agrégats (« The Adzuna API », avec un
  lien vers adzuna.fr) sera ajoutée au pied de page avec le lot 3.
- Inchangé : aucune collecte réelle sur le VPS avant le lot 5.

### D32. Dashboard public (§16.1, §15.6)

Choisi par Damien le 2026-10-03. Vérifié sur la documentation Netlify (§15.6) : sur les plans
legacy, la protection par mot de passe intégrée est réservée au plan Pro, absent du compte
(D21). Le dashboard et `api-data` sont donc publics ; la page garde `noindex`. Seul l'envoi
(`api-ingest`) est protégé. Le domaine reste `dev-ai-job-watcher.netlify.app` (§16.5) tant
que Damien n'en choisit pas un autre.

### D33. Envoi et lecture des agrégats

- `api-ingest` : `PUT /api/ingest/*`, la route à joker acceptant aussi
  `review/AAAA-MM.json` (lot 6). Le nom doit figurer dans la liste du §3.4
  (`src/pipeline/aggregateFiles.ts`), le corps être un objet JSON de 4 Mo au plus ; il est
  écrit tel quel dans le store Blobs `aggregates`. Secret absent côté Netlify : tout est refusé.
- `api-data` : `GET /api/data/*`, réponse compressée en gzip si le client l'accepte.
  Cache (précision du §3.3) : `meta.json` sans cache (`no-cache`), puisqu'il annonce le run ;
  les autres fichiers en `max-age=3600`, demandés par le dashboard avec `?v=<generatedAt>`,
  une adresse propre à chaque envoi. Un nouvel envoi est donc visible au rechargement suivant,
  sans déploiement ni purge.
- `push` : `src/pipeline/push.ts`, lancé par `npm run push`. Fichiers envoyés par ordre
  alphabétique, `meta.json` en dernier, avec les relances du §12 ; une erreur arrête l'envoi
  avant `meta.json`, et le dashboard reste sur le run précédent. Le lot 5 l'intègre au job
  `weekly-run` et à `admin`.
- Mise en service : Damien saisit `INGEST_SECRET` dans Netlify ; le VPS reçoit `SITE_URL` et
  le même secret dans son fichier d'environnement au lot 5. D'ici là, le site affiche « Tableau
  de bord en préparation ».

### D34. Indicateurs et règles d'affichage

- **n < 5** (§8.3) : masque les statistiques calculées sur moins de 5 observations
  (quantiles, parts, densités, variations, base 100). Les comptages s'affichent tels quels :
  ce sont les `n` eux-mêmes.
- **Filtres** (§8.2) : appliqués là où l'agrégat a la dimension. Sinon, une note sous le titre
  dit lesquels ne s'appliquent pas (par exemple, `techs.json` n'a ni région ni contrat).
  Périmètre par défaut : groupes `dashboard: true` (g1 à g8). « Inclure le périmètre élargi »
  ajoute g9 et les offres non classées.
- **Période** : 3, 6 ou 12 derniers mois, ou tout l'historique, jusqu'au dernier run (courbes
  hebdomadaires : jusqu'à la semaine de référence, D44). Les
  quantiles ne s'additionnent pas : salaires, prime IA et TJM restent sur les 12 derniers mois
  (lignes `*` de D28), ce que la page indique.
- **Tuiles** : semaine de référence = celle qui précède le dernier run, la plus récente que la
  collecte du lundi couvre en entier. Écart = rapport à la moyenne des 4 semaines précédentes.
  Part IA = g3 à g8 / g1 à g8, hors filtres de groupe et de rôle. Médiane IA / dev = prime IA
  de `salaries.json` (12 derniers mois, France entière). Rôles émergents actifs = rôles des
  groupes `emergent` ayant au moins une offre sur les 4 dernières semaines complètes.
- **Ce qui bouge** : rôles, 4 dernières semaines complètes contre les 4 précédentes (au moins
  10 offres sur les 8) ; technos, part des descriptions complètes qui les citent au mois de
  référence contre la moyenne des 3 mois précédents (mois d'au moins 5 offres).
- **Métiers** : variation sur 3 mois = 13 dernières semaines complètes contre les 13
  précédentes ; base 100 = première période d'au moins 5 offres ; part du total = part des
  offres de tout le périmètre affiché. En vue « rôles », les 8 plus fréquents ont leur courbe,
  les autres sont regroupés. Part de télétravail : parmi les offres qui le précisent (85 %
  ne le précisent pas sur le run W40, D30), avec son `n`.
- **Périodes partielles** : hachurées sur les courbes, badge « partiel » sur les tuiles et
  listes. Avec un seul run, toutes les semaines passées sont du rattrapage : c'est attendu.

### D35. `conditions.json` gagne la dimension rôle

La part de télétravail du tableau des rôles (§8.1) demande le rôle, absent de l'indicateur 9
(D28). Colonnes : `month, group, role, dimension, value, n`. Les comptages restant additifs,
le dashboard somme les rôles d'un groupe. 114 Ko sur le run W40, loin des 2 Mo.

### D36. Technique du dashboard

- Vite + TypeScript sans framework, pages en hash (`#/metiers?region=11`) : aucune redirection
  Netlify. Les calculs vivent dans `web/src/lib/` (sans DOM), testés dans `tests/web/`.
- **ECharts** importé module par module (courbes, infobulles, légende, hachures, marqueurs) ;
  tableaux HTML pour les salaires, avec une bande p25–p75 en CSS.
- **Carte** : Leaflet et `leaflet.markercluster`, chargés à la demande sur la seule page Carte,
  plutôt que MapLibre (plus lourd, tuiles vectorielles inutiles ici). Fond de tuiles
  OpenStreetMap avec attribution, acceptable pour un trafic faible (politique d'usage des
  tuiles OSM) ; à remplacer si le trafic grandit. Contours des 13 régions métropolitaines :
  france-geojson (IGN Admin Express, Licence ouverte), simplifiés à 0,001° (25 Ko compressés,
  `web/public/geo/`). Les 5 DROM figurent dans le tableau des régions.
- **Couleurs** : palette catégorielle à 8 places dans l'ordre fixe des groupes g1 à g8,
  validée pour les daltonismes en clair et en sombre ; gris pour g9 et les non classés ; rampe
  bleue séquentielle pour les régions. Vue par rôles : les 8 rôles affichés prennent chacun une
  place de la palette, dans l'ordre de la taxonomie (une couleur fixe par rôle est impossible
  avec plus de 60 rôles pour 8 places, et deux courbes de même couleur seraient illisibles). Thème clair, sombre ou système, mémorisé dans le
  navigateur.
- **Performance** (critère du lot) : Vue d'ensemble affichée en 0,9 s en 4G simulée
  (9 Mbit/s, 170 ms) et en 2,4 s en 4G lente avec un processeur 4 fois plus lent
  (1,6 Mbit/s, 150 ms), données du run W40, transfert de 208 Ko. `meta.json` est préchargé
  par `index.html`.
- En local, `npm run dev:web` et `npm run preview:web` servent `/api/data/*` depuis
  `.data/aggregates` (ou `DATA_DIR`).

## Lot 5 — VPS, planification et alertes (2026-10-07)

### D37. Le lot 5 passe avant le lot 3

Demandé par Damien le 2026-10-07, après la fusion du lot 4. Le lot 3 (Adzuna) attend toujours
son compte développeur et sa réponse sur l'usage (D31) ; la collecte France Travail peut tourner
chaque semaine sans lui, et l'historique ne se constitue qu'à partir du premier run (§2).

- `weekly-run` ne comprend que la collecte France Travail, le traitement et l'envoi ; le lot 3
  y ajoutera la collecte Adzuna et le job `monthly-adzuna-stats`.
- `admin collect-adzuna` répond que l'étape arrive au lot 3, `admin reclassify` au lot 6.
- L'alerte « budget Adzuna épuisé » (§10) arrive avec le lot 3.

### D38. Alertes par ntfy (§16.2)

Choisi par Damien le 2026-10-07, parmi ntfy, e-mail et Slack. `src/pipeline/alert.ts` publie en
JSON à la racine du serveur (`https://ntfy.sh/`), seule forme qui transporte un titre accentué
sans encodage particulier ; format vérifié sur la documentation ntfy (« Publish as JSON ») et
par une publication réelle relue avec `GET /<sujet>/json?poll=1` le 2026-10-07.

- Variables : `ALERT_NTFY_URL` (adresse du sujet, sur le VPS et dans Netlify) et, si le sujet
  est protégé, `ALERT_NTFY_TOKEN` (`Authorization: Bearer`). Sur ntfy.sh, le sujet public est
  protégé par son nom aléatoire ; les alertes ne contiennent aucun secret.
- Une alerte n'échoue jamais bruyamment : relances du §12, puis `alert.failed` au journal.
  Sans `ALERT_NTFY_URL`, l'alerte va au journal (`alert.unconfigured`).
- Priorité 4 par défaut, 5 pour « zéro offre » et « aucun run depuis 8 jours ». Titre préfixé
  par l'émetteur (`[VPS]` ou `[Netlify]`).

### D39. Sauvegarde par restic vers Cloudflare R2 (§16.6, §3.4)

Proposé par Damien le 2026-10-07 (à la place d'un bucket OVH, même code). Vérifié sur la
documentation Cloudflare : formule gratuite de 10 Go-mois en stockage Standard, 1 million
d'opérations d'écriture et 10 millions de lecture par mois, sortie gratuite ; R2 accepte la
région `us-east-1` de restic comme alias de `auto`. Volume : environ 9 Mo par run (run W40),
quelques centaines de Mo par an.

- restic chiffre, déduplique et versionne ; il lit `RESTIC_REPOSITORY`, `RESTIC_PASSWORD`,
  `AWS_ACCESS_KEY_ID` et `AWS_SECRET_ACCESS_KEY` dans l'environnement. Le mot de passe est
  aussi rangé hors du VPS par Damien, sinon la sauvegarde est illisible après une perte du VPS.
- Job `backup` le lundi à 09:00 UTC, après la dernière relance de `weekly-run`, sous le même
  verrou : `restic backup DATA_DIR` (sans le fichier de verrou), puis `restic forget --prune`
  en gardant 12 instantanés hebdomadaires et 24 mensuels. Comme `raw` n'est jamais effacé, le
  dernier instantané contient tout l'historique.
- Alerte si la sauvegarde échoue, et chaque semaine tant qu'elle n'est pas configurée.
  Dernier résultat dans `state/backup.json`, affiché par `admin status`.
- Testé en local avec restic 0.16.4 sur un dépôt fichier : sauvegarde, liste, restauration
  identique à `DATA_DIR` (hors verrou).

### D40. Job `weekly-run`

`src/pipeline/weeklyRun.ts`, lancé par `scripts/weekly-run.ts`. État dans
`state/runs/{runId}/weekly-run.json` : étapes faites, tentatives, alertes délivrées, historique.

- Chaque lancement reprend à la première étape non faite (collecte, traitement, envoi) et ne
  fait rien si le run est complet. 3 tentatives (05:00, 06:00, 07:00 UTC) ; au-delà, les
  lancements sont ignorés sauf `admin weekly-run --force`, qui remet le compteur à zéro.
- Collecte incomplète (partitions en échec) : attente de la relance suivante ; à la 3e
  tentative, alerte puis traitement de ce qui a été collecté (option la plus utile : quelques
  partitions manquantes ne doivent pas priver la semaine de chiffres ; le traitement ne clôt
  alors aucune offre, D27). Collecte interrompue avec des partitions en attente : jamais
  traitée, le traitement refuserait une collecte en cours.
- Zéro offre collectée : alerte immédiate et traitement bloqué, sinon toutes les offres
  actives seraient déclarées disparues.
- Erreur du traitement : alerte dès la première tentative. Toute autre erreur (OAuth, envoi au
  site) : alerte « run en échec » après la 3e tentative.
- Une alerte de chaque type au plus par run ; une alerte non délivrée est retentée au
  lancement suivant.
- La collecte rend la main à 50 minutes (`deadline`), pour rester sous les 60 minutes du job.

### D41. Installation sur le VPS : unités systemd utilisateur et lanceur

- Unités **utilisateur** de `veille` (`~/.config/systemd/user/`, modèles dans
  `deploy/vps/systemd/`) plutôt que des unités système : `veille` les installe sans `sudo`, et
  `Linger=yes` (procédure du 3 octobre) les fait tourner sans session ouverte. Les heures sont
  écrites en UTC dans `OnCalendar` (le VPS est à l'heure de Paris), `Persistent=true` rattrape
  un lancement manqué au redémarrage, `TimeoutStartSec=60min` (§12).
- `deploy/vps/veille-job` : charge le fichier d'environnement
  `~/.config/dev-ai-job-watcher/env` (droits 600 exigés, sinon refus), fixe `DATA_DIR`
  (`~/data` par défaut, hors du dépôt), puis lance le job sous `flock DATA_DIR/.lock` : un job
  qui trouve le verrou pris attend (§12). Les timers et les commandes `admin` passent par lui.
- Le fichier d'environnement est lu par le shell (`set -a; . fichier`) et non par
  `EnvironmentFile=` : une seule syntaxe pour les timers et pour les commandes à la main.
- Le store sur disque écrit désormais chaque clé de façon atomique (fichier temporaire puis
  renommage, §3.4) : un job tué par le délai ne laisse pas de fichier tronqué.
- `admin` (`scripts/admin.ts`) remplace `api-admin` : `collect-ft [--reset]`, `process`,
  `push`, `weekly-run [--force]`, `status`, et `simulate-failure`, qui joue un run fictif en
  mémoire et envoie la vraie alerte (critère « alerte déclenchée sur un échec simulé »).
- Remote Control peut tourner en service (`veille-remote-control.service`, session tmux
  `claude`, `claude remote-control --spawn worktree`), facultatif et à vérifier au premier
  démarrage sur le VPS.
- Mise à jour du code à la main (`git pull --ff-only`, `npm ci`) jusqu'au job `update` du
  lot 6.

### D42. `watchdog` et retrait des fonctions de collecte

- `watchdog` : fonction planifiée Netlify (`0 9 * * *`). Elle lit `meta.json` dans Blobs et
  alerte si le dernier run publié a plus de 8 jours, comptés depuis son lundi 05:00 UTC :
  après un lundi en échec, l'alerte part le mardi à 09:00, puis chaque jour. Un run « réussi »
  est donc un run dont les agrégats ont été envoyés. `meta.json` absent : alerte aussi.
- Retirés : `collect-francetravail-background`, `api-admin`, leurs modules et
  `src/pipeline/internal.ts` (appels internes). `INTERNAL_SECRET` et `ADMIN_TOKEN`
  disparaissent ; `FT_CLIENT_ID` et `FT_CLIENT_SECRET` sont à supprimer des variables Netlify.
  `safeEqual` rejoint `src/functions/http.ts`. `netlify.toml` n'embarque plus `taxonomy.yaml`
  ni les fixtures : aucune fonction restante ne les lit.
- Rappel (documentation Netlify) : une variable modifiée n'atteint les fonctions qu'au
  déploiement suivant. `ALERT_NTFY_URL`, et `INGEST_SECRET` s'il a été saisi après le
  déploiement du lot 4, prennent effet au déploiement de ce lot.

### D43. Alertes du VPS envoyées en IPv4

- Constat à l'installation (2026-10-07) : le premier `admin simulate-failure` a reçu HTTP 429
  de ntfy.sh à chaque tentative. ntfy compte ses limites par adresse IPv4 et par bloc IPv6 /64
  (`visitor-prefix-bits-ipv6`, 64 par défaut, documentation ntfy) ; le VPS OVH partage son /64
  avec d'autres clients, et le quota du jour de ce bloc était épuisé, celui de son IPv4 intact.
  Node essaie l'IPv6 en premier.
- `veille-job` exporte `NODE_OPTIONS=--dns-result-order=ipv4first` (en tête d'une valeur
  éventuelle du fichier d'env) : tous les jobs Node passent par l'IPv4, qui fonctionne aussi
  pour France Travail et Netlify. Vérifié sur le VPS : alerte délivrée en IPv4.
- Limite connue : `watchdog` publie depuis les adresses partagées de Netlify, comptées de la
  même façon par ntfy.sh. Un échec y est journalisé (`alert.failed`) sans autre signal. À
  revoir si une alerte du watchdog se perd (compte ntfy avec jeton, ou autre serveur ntfy).

## Après le lot 5 — Corrections du dashboard (2026-11-20)

### D44. La semaine du dernier run n'est plus dessinée

- Constat en production (run 2026-W47, 2026-11-16) : les nouvelles offres sont comptées dans
  leur semaine de création, et le run du lundi 05:00 UTC ne voit que les quelques heures déjà
  écoulées de sa propre semaine (5 offres pour W47, contre 830 à 990 pour les semaines
  complètes). Hachuré, ce point proche de zéro faisait quand même croire à une chute.
- Les courbes hebdomadaires (`chartWeeks` : vue d'ensemble et Métiers) s'arrêtent à la semaine
  de référence (D34), celle qui précède le dernier run. La semaine du dernier run apparaît au
  run suivant, une fois collectée. Les points de la carte prennent la même fenêtre : « les 4
  dernières semaines » sont 4 semaines complètes.
- §8.3 (exigé, semaines partielles hachurées) s'applique toujours aux semaines dessinées
  (rattrapage avant le premier run, collecte incomplète) ; la semaine du dernier run n'est
  simplement pas dessinée tant qu'elle n'a pas de données.
- Inchangé : les courbes mensuelles gardent le mois du dernier run, hachuré. Il n'est pas
  proche de zéro (plusieurs semaines complètes) et le masquer retirerait jusqu'à 4 semaines
  de données. Les agrégats ne changent pas : correction du seul dashboard, sans nouveau
  traitement sur le VPS.

## Site public — Cadrage (lot S1, 2026-11-21)

### D45. Le dashboard devient un site public vitrine

Demandé par Damien le 2026-11-21 : faire de l'outil un site web public et professionnel,
montrable dans son portfolio, qui met en avant les usages de l'IA du projet. Plan détaillé
proposé le même jour, recommandations validées par Damien le 2026-11-21.

- Nouvel objectif O5 et nouveau §17 de la spec (version 1.2) : pages, principes, technique,
  référencement, résumé de la semaine, lancement.
- Six lots ajoutés au §14 : S1 (ce cadrage), S2 (socle), S3 (accueil), S4 (pages
  éditoriales), S5 (résumé de la semaine, optionnel), S6 (analyses). Le lot 6 garde son
  contenu et ajoute la page « Journal de la taxonomie ».
- Le tableau de bord ne change pas de fonctionnement : il déménage sous `/tableau-de-bord/`
  au lot S2, et les anciens liens en `/#/<page>` y redirigent (exigé, §17.4).
- Origine du projet, à dire tel quel sur la page « L'IA dans ce projet » (S4) : `SPEC.md` et
  `taxonomy.yaml` ont été rédigés par Claude au fil de discussions avec Damien, qui les a
  validés puis ajoutés au commit initial du 2026-10-02 (précisé par Damien le 2026-11-21).
  Tout le code a ensuite été écrit par Claude Code, lot par lot, chaque PR fusionnée par
  Damien.

### D46. Nom et adresse du site (§16.5)

- Adresse : un sous-domaine de `dg-tech.dev`, le domaine professionnel de Damien, qui en
  héberge déjà un autre projet (`strates.dg-tech.dev`). Branchement au lancement (§17.8) ;
  d'ici là, le site reste sur `dev-ai-job-watcher.netlify.app`.
- Nom : « Baromètre emploi Dev & IA », adresse `barometre.dg-tech.dev`, choisi par Damien le
  2026-11-21 (préféré à « Veille emploi Dev & IA », qui sonne comme un outil interne, et à un
  nom court sans sous-titre).
- Le dépôt garde son nom, `Dev-ai-job-watcher` (révisé par D64 : renommé et transféré le
  2026-11-21).

### D47. Référencement par les moteurs (révise D32)

D32 gardait le dashboard en `noindex`. Il le reste pendant la construction du site ; au
lancement, tout le site est indexé, avec `robots.txt`, `sitemap.xml` et des métadonnées par
page (§17.5). Les données publiées restent des agrégats sans données personnelles.

### D48. Technique : Vite multi-pages, sans framework

Prolonge D36. Une dizaine de pages ne justifie pas de migrer vers un générateur de sites
(Astro a été écarté : il ne vaudrait la peine que pour un blog tenu dans la durée). Pages HTML
d'entrée multiples dans Vite, gabarit commun injecté au build, textes en Markdown dans
`web/content/`, convertis au build. Le code du tableau de bord et ses tests ne bougent pas.

### D49. Langue, audience, contact

- Français seul, comme le reste de l'activité de Damien et le public visé.
- Aucune mesure d'audience au lancement, donc aucun cookie ni bandeau de consentement.
- Pas de formulaire de contact : la page À propos renvoie vers LinkedIn, GitHub et
  `dg-tech.dev`, ce qui évite tout traitement de données personnelles.

### D50. Ordre des lots, place des lots 3 et 6

- Ordre : S1 à S4, lancement, puis lot 6, S5 et S6, un lot à la fois (§0, CLAUDE.md).
- Le lot 6 passe juste après le lancement : la revue mensuelle par Claude, validée par
  Damien, est l'usage de l'IA le plus démonstratif du projet.
- Le lot 3 sort du chemin critique. Les conditions d'Adzuna (constat du 2026-10-03)
  autorisent la recherche personnelle mais exigent un accord écrit pour un usage
  professionnel, même agrégé ; un site vitrine de l'activité de Damien en relève. Le site se
  lance avec France Travail seul ; Damien écrira à Adzuna s'il veut cette deuxième source.

### D51. Contenus écrits avec l'IA, chiffres dans les contenus

- Un texte rédigé par un modèle porte une mention visible ; chaque chiffre qu'il cite est
  confronté aux agrégats par du code ; un texte de repli sans IA le remplace en cas d'écart
  (exigé, §17.1, §17.6).
- Le résumé de la semaine (S5) est retenu : Claude, appelé depuis le VPS après le
  traitement. Coût estimé sur les tarifs publiés de l'API (relevé du 2026-11-03) : environ
  12 000 jetons en entrée et 4 000 en sortie par semaine, soit moins de 1 $ par mois.
- Deux analyses au lancement de la rubrique (S6), signées par Damien avec la mention
  « préparé avec Claude ».
- Citer dans un article des chiffres agrégés, figés à sa date, est du contenu éditorial : la
  règle « aucune donnée dans le dépôt » (CLAUDE.md) vise les données collectées et les
  agrégats, pas ces citations.

### D52. Passage du dépôt en public

Audit du 2026-10-30 : rien de bloquant. Choix de Damien :

- Licence MIT pour le code (`LICENSE`). Les données collectées ne sont pas dans le dépôt et ne
  sont pas concernées.
- L'adresse e-mail des commits existants reste telle quelle (réécrire l'historique n'efface
  pas les SHA déjà cités par les PR) ; Damien passe sur l'adresse `noreply` de GitHub pour la
  suite.
- Le nom d'hôte du VPS est retiré de `deploy/vps/README.md` (il résout vers son adresse
  publique). Aucun nom d'hôte ni aucune adresse IP dans les fichiers de déploiement à venir.
- Avant la bascule : politique Netlify des variables sensibles sur « Require approval »
  (exigé, §17.8), puis nouveau balayage du dépôt.

## Site public — Socle (lot S2, 2026-11-21)

### D53. Pages multiples et gabarit commun (§17.2 à §17.4, D48)

- Les pages sont déclarées dans `web/site/config.ts` (adresse, fichier d'entrée, titre,
  description, place dans la navigation, texte Markdown). Chaque page a un fichier HTML
  d'entrée sous `web/`, entrée du build Vite ; le tableau de bord passe de `web/index.html` à
  `web/tableau-de-bord/index.html`, son code ne change pas.
- Gabarit : un plugin Vite (`web/site/plugin.ts`, `transformIndexHtml`) remplace les marqueurs
  `<!-- site:head -->`, `<!-- site:header -->`, `<!-- site:content -->` et
  `<!-- site:footer -->`, chacun sur sa propre ligne, en développement comme au build. Un
  marqueur manquant ou en trop fait échouer le build.
- Markdown converti par `marked` (dépendance de développement, version 18.1.3, sortie depuis
  plus de deux semaines) plutôt que par le petit convertisseur du journal de la taxonomie :
  les pages éditoriales du lot S4 auront besoin de liens et de tableaux. Les textes sont du
  contenu du dépôt, non assaini.
- La navigation ne montre que les pages livrées : « Tableau de bord » au lot S2, les autres
  rubriques avec leur lot. `appType: 'mpa'` : en local, une adresse inconnue répond 404 au
  lieu de servir l'accueil.
- En-tête, thème et pied de page quittent le code du tableau de bord pour le gabarit
  (`web/src/site/`). Le pied de page lit la date du dernier run dans `meta.json` sur toutes
  les pages ; `loadMeta` ne fait qu'une requête par page.
- Corrigé au passage : le lien d'évitement « Aller au contenu » mettait `#contenu` dans le
  fragment, que le tableau de bord lisait comme une page inconnue (retour à la vue d'ensemble,
  filtres perdus). Il donne désormais le focus au contenu sans toucher au fragment.
- `#app` réserve la hauteur de l'écran : sans cela, le pied de page, devenu statique, était
  repoussé au chargement du tableau de bord (CLS de 0,27 mesuré, 0 après correction).

### D54. Anciens liens du tableau de bord (§17.4, exigé)

`/#/<page>?<filtres>` mène à `/tableau-de-bord/#/<page>?<filtres>` : le script de l'accueil
appelle `location.replace` (pas d'entrée dans l'historique), au chargement et sur
`hashchange`. Seuls les fragments commençant par `#/` sont concernés. Le script est un module,
exécuté après l'analyse de la page : l'accueil peut s'afficher un instant avant la
redirection, accepté pour ces seuls anciens liens. Règle testée (`tests/site/site.test.ts`),
redirection vérifiée dans Chromium.

### D55. Identité (§17.3)

- Nom D46 partout (titres, en-tête, images de partage) ; le dépôt garde le sien.
- Logotype : une jauge de baromètre, en SVG dans l'en-tête et en favicon ; icône 180 × 180
  pour l'écran d'accueil des téléphones.
- Images de partage 1200 × 630 : une pour l'accueil, une pour le tableau de bord ; les pages
  sans image propre reprennent celle de l'accueil. Générées par `npm run site:images`
  (`scripts/site-images.ts`) avec Playwright, qui n'est pas une dépendance du projet : outil
  ponctuel, relancé quand une page en gagne une ou change de titre.
- Thème partagé par tout le site. Le choix enregistré est appliqué avant le premier affichage
  par `public/theme.js`, script classique bloquant de 0,3 Ko, plutôt qu'un script en ligne
  qu'il faudrait autoriser par une empreinte dans la CSP.
- Couleur des liens : nouveau jeton `--link` (`#256abf` en clair, 4,9:1 sur le fond ; inchangé
  en sombre). L'accent `#2a78d6`, à 3,97:1, échouait au contraste de Lighthouse ; il reste la
  couleur des séries et du logotype. Le bouton de l'accueil prend aussi `#256abf`.

### D56. Référencement technique (§17.5, D47)

- `noindex` sur toutes les pages tant que `SITE.indexable` est faux, c'est-à-dire jusqu'au
  lancement ; `SITE_INDEXABLE=1` au build sert à mesurer le site tel qu'il sera indexé. La
  page 404 reste toujours `noindex`, sans URL canonique.
- Titre, description, URL canonique et balises Open Graph sur chaque page. L'adresse de base
  vient de la variable `URL` que Netlify fournit au build (adresse principale du site) ; elle
  deviendra `https://barometre.dg-tech.dev` quand le domaine sera branché comme adresse
  principale, sans changement de code. En local : `https://barometre.dg-tech.dev`.
- `robots.txt` et `sitemap.xml` arrivent au lancement, avec l'indexation (§17.5).
- Le lien « Code source sur GitHub » du pied de page mène à un dépôt encore privé : il
  fonctionnera au passage en public (§17.8).

### D57. En-têtes de sécurité (lot S2)

Dans `netlify.toml`, pour tout le site :

- CSP : scripts du seul site ; styles en ligne permis (infobulles d'ECharts écrites en HTML
  avec des attributs `style`, positionnement de Leaflet) ; images du site, `data:` et tuiles
  `tile.openstreetmap.org` ; requêtes vers le seul site ; ni objets, ni cadres, ni
  formulaires. Un test vérifie que l'hôte des tuiles de `carte.ts` est autorisé.
- `Strict-Transport-Security`, `X-Content-Type-Options`, `X-Frame-Options`,
  `Referrer-Policy`, `Permissions-Policy`, `Cross-Origin-Opener-Policy`.
- `/assets/*` (noms de fichiers tirés du contenu) : cache d'un an, `immutable`.
- Vérifié dans Chromium avec cette CSP, en local puis sur l'aperçu Netlify de la PR (vraies
  données) : les cinq pages du tableau de bord, la carte et ses tuiles, l'accueil, les
  mentions légales et la 404, sans erreur de la page dans la console.
- Seule erreur, sur les aperçus Netlify uniquement : la barre d'outils que Netlify y ajoute
  ouvre un cadre vers `app.netlify.com`, bloqué par la CSP. La production n'a pas cette barre ;
  la CSP n'est pas élargie pour elle.

### D58. Mentions légales (§17.2)

- Éditeur repris des mentions légales de `dg-tech.dev`, le même éditeur (relevé du
  2026-11-21) : nom, statut, SIREN, TVA, adresse, contact.
- Hébergeur : Netlify, Inc., à l'adresse de ses conditions d'utilisation relevée le
  2026-11-21 (101 2nd Street, San Francisco). Les mentions de `dg-tech.dev` donnent une
  ancienne adresse (44 Montgomery Street).
- Le serveur OVHcloud de la collecte est cité sans nom d'hôte ni adresse (D52).
- Sources et licences (France Travail, Insee, IGN via france-geojson, OpenStreetMap), absence
  de cookies et de mesure d'audience, thème gardé dans le navigateur, journaux de
  l'hébergeur, adresse IP transmise aux serveurs de tuiles par la page Carte.

### D59. Mesures Lighthouse du lot S2 (§17.4)

Lighthouse 13.6.0, mobile simulé, build de production servi par `vite preview` avec
`SITE_INDEXABLE=1`, le 2026-11-21 :

| Page | Performance | Accessibilité | Bonnes pratiques | Référencement |
|---|---|---|---|---|
| Accueil | 100 | 100 | 100 | 100 |
| Tableau de bord | 96 | 100 | 100 | 100 |
| Mentions légales | 100 | 100 | 100 | 100 |
| Page 404 | 100 | 100 | 100 | 60 |

La 404 perd des points de référencement par son `noindex`, voulu. Tant que le site reste en
`noindex` (D47), toutes les pages perdent ces points de la même façon.

## Site public — Accueil (lot S3, 2026-11-21)

### D60. Contenu et données de l'accueil (§17.2, §17.4)

- Accroche, quatre chiffres de la semaine de référence, mini-courbe, « ce qui bouge », schéma
  du pipeline et encart « L'IA dans ce projet ». Le lien vers la page du même nom arrive avec
  elle au lot S4 : pas de lien mort d'ici là.
- Les quatre chiffres (nouvelles offres, part IA, prime IA, rôles émergents actifs) viennent
  de `headline()` (`web/src/lib/headline.ts`), que la vue d'ensemble du tableau de bord
  utilise aussi pour ses tuiles : mêmes fichiers (`timeseries.json`, `salaries.json`), mêmes
  calculs, filtres par défaut du tableau de bord, même mise en forme (`fmtPremium`,
  `fmtRoleMove`, `fmtTechMove`). Testé dans `tests/web/headline.test.ts`. L'écart à la
  moyenne des 4 semaines n'est pas repris (voir D61).
- Mini-courbe : nouvelles offres g1 à g8 par semaine, du premier run à la semaine de
  référence. Dessinée en SVG sans ECharts (l'accueil charge 7 Ko de JavaScript compressé
  contre 190 Ko pour le tableau de bord) ; semaines partielles hachurées et changements de
  taxonomie marqués comme dans le tableau de bord (§8.3) ; tableau des valeurs pour les
  lecteurs d'écran. Axes de courbe déplacés dans `web/src/lib/axis.ts`, sans ECharts.
- « Ce qui bouge » : les trois premières hausses et baisses des métiers et des technologies,
  calculées comme dans la vue d'ensemble (`roleMovers`, `techMovers`).
- Hauteurs réservées pour les chiffres, la courbe et les listes : la page ne bouge pas à
  l'arrivée des données (CLS 0).
- Schéma du pipeline en texte (quatre étapes), sans chiffre qui vieillirait : les chiffres de
  qualité des runs iront sur la page Méthodologie (S4).

### D61. Constat : la semaine de référence est sous-comptée à sa publication (mesuré, clos)

Les nouvelles offres sont comptées par semaine de création (§6.9), mais une partie des offres
n'apparaît dans l'API qu'une ou plusieurs semaines après leur date de création. Agrégats de
production du 2026-11-21 :

| Semaine de création | Offres créées (aujourd'hui) | Nouvelles offres du run suivant (toutes semaines) |
|---|---|---|
| 2026-W41 | 983 | 540 (run W42) |
| 2026-W43 | 1 422 | 1 224 (run W44) |
| 2026-W45 | 962 | 830 (run W46) |

Le run suivant ne peut pas avoir vu plus d'offres de la semaine qu'il n'a trouvé d'offres
nouvelles en tout : chaque semaine a donc gagné au moins 13 à 45 % après sa première
publication. La semaine de référence des tuiles est la plus touchée ; l'écart de −35 % de la
semaine 46 en vient probablement en partie. L'accueil reprend les chiffres du tableau de bord
(§17.4) ; la correction est à décider par Damien.

Choix de Damien le 2026-11-21 : mesurer d'abord sur le VPS, en lecture seule, le délai entre
la création d'une offre et son premier run (`firstSeenRun` de `offers/*`), puis proposer la
correction adaptée.

Mesure du 2026-11-21 sur le VPS (script en lecture seule sur `offers/*`, doublons exclus,
runs W41 à W47) : nombre d'offres d'une semaine de création à sa publication comme semaine
de référence (offres vues par le run de la semaine elle-même ou par celui du lundi suivant),
puis aujourd'hui.

| Semaine de création | Dev g1 à g8 : publication → aujourd'hui | Toutes : publication → aujourd'hui |
|---|---|---|
| 2026-W40 | 228 → 231 (+1,3 %) | 748 → 756 (+1,1 %) |
| 2026-W41 | 313 → 317 (+1,3 %) | 968 → 983 (+1,5 %) |
| 2026-W42 | 322 → 327 (+1,6 %) | 1 001 → 1 009 (+0,8 %) |
| 2026-W43 | 472 → 474 (+0,4 %) | 1 413 → 1 422 (+0,6 %) |
| 2026-W44 | 290 → 290 (0 %) | 970 → 978 (+0,8 %) |
| 2026-W45 | 277 → 320 (+15,5 %) | 826 → 962 (+16,5 %) |
| 2026-W46 | 228 (pas encore de run suivant) | 846 |

La borne « au moins 13 à 45 % » était fausse : elle supposait qu'aucune offre d'une semaine
n'est vue par le run de cette même semaine. Or le premier run (mercredi 7 octobre) a vu
451 offres de la semaine 41, et le run du lundi 19 octobre 235 offres créées le matin même.
Hors la semaine 45, une semaine gagne moins de 2 % après sa publication. La semaine 45 a
gagné 136 offres (43 dev) d'un coup au run W47, une semaine après sa publication : seule
exception à ce jour. L'écart de −35 % de la semaine 46 au tableau de bord est donc surtout
réel (vers −25 % même avec un rattrapage comme celui de la semaine 45).

Correction retenue : les textes seulement. La limite « La dernière semaine peut encore
bouger » de la page Méthodologie et le récit de la page « L'IA dans ce projet » donnent les
chiffres mesurés ; aucun calcul ne change. Un rattrapage comme celui de la semaine 45 se voit
dans les agrégats publics (le compte d'une semaine passée augmente d'un run à l'autre).

## Site public — Pages éditoriales (lot S4, 2026-11-21)

### D62. « L'IA dans ce projet », Méthodologie, À propos (§17.2, §17.3)

- Trois pages en Markdown (`web/content/ia.md`, `methodologie.md`, `a-propos.md`) sous `/ia/`,
  `/methodologie/` et `/a-propos/`. Navigation dans l'ordre du §17.3 : Tableau de bord, L'IA
  dans ce projet, Méthodologie, À propos ; Analyses s'y ajoutera au lot S6. Chaque page a son
  image de partage (`npm run site:images`).
- **Mention de rédaction (exigé, §17.1, D51)** : le gabarit place sous le titre de chaque page
  de texte « Texte rédigé avec Claude, relu et validé par Damien Gros. Mis à jour le … », daté
  par le champ `updated` de `web/site/config.ts`. Un texte sans date ou sans titre de niveau 1
  fait échouer le build (test). Les mentions légales, rédigées de la même façon au lot S2,
  reçoivent la mention ; leur phrase « Les textes sont de Damien Gros » est corrigée. Le pied
  de page de tout le site ajoute « écrit avec Claude », avec un lien vers `/ia/`, ce qui couvre
  les textes de l'accueil et du tableau de bord.
- **Chiffres datés ou lus en direct (critère du lot S4)** : la page Méthodologie lit
  `quality.json` en direct (`web/src/methodologie.ts`) pour les six derniers runs France
  Travail : offres lues, retenues, nouvelles, parts classées, avec salaire et localisées,
  durée. Mêmes calculs que la page « Données & qualité » du tableau de bord, dont le type et
  le tri passent dans `web/src/lib/quality.ts`. Les autres chiffres des textes décrivent la
  méthode (seuils, 51 métiers et 9 groupes de la taxonomie v3, 75 mots-clés, 8 codes ROME) ou
  sont datés : « au 21 novembre 2026 » pour 13 PR fusionnées, plus de 60 décisions, plus de
  500 tests et 93 cas de classement. Ils ne se mettent pas à jour seuls ; la date de révision
  de la page change avec eux.
- **Liens vers le dépôt** : vers `blob/main/<fichier>`. Un test vérifie que chaque fichier
  existe et que chaque lien interne mène à une page du site. Tant que le dépôt est privé, ces
  liens répondent 404 aux visiteurs : le lancement (§17.8) le rend public.
- « L'IA dans ce projet » reprend l'origine du projet telle que D45 la consigne, les règles de
  SPEC.md §0 et CLAUDE.md, la sonde du 2026-10-03 (D18, D19), les décisions de Damien (D20,
  D21, D46, D52), l'exploitation et ses garde-fous (§11, lot 5), trois incidents réels (D43,
  D44, D61), le classement sans IA et ses raisons (§6.5), puis le lot 6 et le lot S5 au futur.
- Méthodologie : source et couverture, collecte (D18, D19, règle de rétention), classement
  (§6.4, §6.5), indicateurs, règles d'affichage (§8.3, D44), limites, dont la dernière semaine
  provisoire (D61), avec les ordres de grandeur connus à ce jour : à mettre à jour après la
  mesure sur le VPS (fait le 2026-11-21, voir D61).
- À propos : à la première personne, d'après la présentation de `dg-tech.dev` ; liens
  LinkedIn, GitHub et `dg-tech.dev`, sans formulaire (D49).
- Accueil : lien vers `/ia/` dans l'encart « L'IA dans ce projet » (D60) et vers
  `/methodologie/` sous le schéma du pipeline.
- Les styles des tableaux passent de `styles.css` à `site.css`, partagés par le tableau de
  bord et les pages de texte. La durée des runs s'écrit à la française (« 12,8 s ») sur la page
  « Données & qualité ».
- Lighthouse 13.6.0, mobile simulé, en local avec un build indexable et les agrégats de
  production : 100 / 100 / 100 / 100 pour `/ia/`, `/methodologie/`, `/a-propos/` et l'accueil,
  LCP sous 1 s, CLS 0.
- Textes à relire et valider par Damien avant la fusion (critère du lot S4, §14).

## Site public — Lancement (§17.8, 2026-11-21)

### D63. Préparation du lancement

- **Balayage du dépôt** avant son passage en public, sur tout l'historique (35 commits de
  `main`, toutes les branches du dépôt y étant fusionnées) : aucun secret (motifs de clés
  Anthropic, GitHub, Slack, AWS, Netlify, JWT, clés privées, affectations de variables
  sensibles), aucune adresse IP réelle, aucune donnée collectée (seuls fichiers non textuels :
  images du site et contours GeoJSON des régions), adresses e-mail fictives dans les tests et
  les fixtures. Deux points connus restent dans l'historique, sans réécriture (même choix que
  pour l'e-mail, D52) : l'adresse Gmail de Damien dans 15 commits faits sur GitHub, et le nom
  d'hôte OVH du VPS dans l'ancienne version de `deploy/vps/README.md` (retiré au lot S1). Ce
  nom résout vers l'adresse publique du VPS, qui n'expose aucun port pour le projet.
- **`robots.txt`** est écrit à chaque build (`web/site/seo.ts`) : il laisse les robots lire
  les pages, qui portent `noindex` jusqu'au lancement. Avec `SITE_INDEXABLE=1`, il annonce
  `sitemap.xml`, qui liste les pages hors page d'erreur avec leur URL canonique et, pour les
  pages de texte, la date de leur dernière révision. Le build refuse d'ouvrir l'indexation
  tant que l'adresse principale du site est en `netlify.app` (variable `URL` de Netlify) : le
  domaine se branche d'abord.
- **Indexation par une variable Netlify** plutôt que par un changement de code : Damien (ou
  Claude, avec son accord) pose `SITE_INDEXABLE=1` pour la production, puis relance un
  déploiement. Le retour en arrière est aussi simple. Les aperçus de PR gardent l'en-tête
  `X-Robots-Tag: noindex` que Netlify leur ajoute.
- **README** réécrit en vitrine : présentation, lien vers le site, capture de l'accueil
  (`docs/images/accueil.png`, agrégats publics du 21 novembre 2026, contenu éditorial au sens
  de D51), résumé de l'usage de l'IA et état du projet ; la documentation technique suit.
- **Envoi des agrégats après le branchement du domaine** : la documentation de Netlify ne dit
  pas si l'adresse `netlify.app` redirige alors vers le domaine principal. Si elle le fait, un
  `PUT` du VPS vers l'ancienne adresse perdrait son en-tête `Authorization` (redirection vers
  une autre origine) et l'envoi du lundi échouerait. `SITE_URL` passe donc à
  `https://barometre.dg-tech.dev` dans le fichier d'environnement du VPS dès que le domaine
  répond, avant le run suivant.
- **Ordre du lancement** : politique Netlify des variables sensibles sur « Require approval »
  (exigé), domaine branché et principal, `SITE_URL` du VPS, dépôt public, indexation, plan du
  site déclaré dans Google Search Console, liens depuis le portfolio et LinkedIn.

## Site public — Renommage du dépôt (2026-11-21)

### D64. Dépôt renommé et transféré (révise D46)

- Le dépôt devient `Dg-tech-dev/barometre-emploi-dev-ia` : même nom que le site, dans
  l'organisation GitHub de DG Tech, l'activité de Damien (demande de Damien, nom choisi par lui
  le 2026-11-21). Transfert et renommage faits par Damien dans GitHub, qui redirige l'ancienne
  adresse `DamienGR/Dev-ai-job-watcher` (pages, `git clone`, `git fetch`) tant qu'aucun dépôt
  ne reprend ce nom.
- Les liens du site (pied de page, textes, page À propos), le nom du paquet npm et le test des
  liens visent la nouvelle adresse. La page À propos pointe vers l'organisation `Dg-tech-dev`,
  où le code est publié, au lieu du profil personnel.
- Inchangés, pour ne rien casser en production : le dossier du dépôt sur le VPS
  (`~/Dev-ai-job-watcher`, cité par les unités systemd), le fichier d'environnement
  (`~/.config/dev-ai-job-watcher/env`), le nom du site Netlify (`dev-ai-job-watcher`) et les
  mentions historiques des décisions précédentes.
- Sur le VPS, l'adresse du dépôt distant passe à la nouvelle (`git remote set-url`, étape 6 de
  `deploy/vps/README.md`) : la redirection suffit, mais elle cesserait si un dépôt reprenait
  l'ancien nom. La clé de déploiement suit le dépôt lors d'un transfert.

## Lot 6 — Revue mensuelle de la taxonomie (2026-11-21)

### D65. Export de revue mensuelle (§9.1)

- Le VPS prépare la revue avec les agrégats, à chaque traitement : `review/AAAA-MM.json` pour
  le mois du dernier run (celui du jeudi de sa semaine) et pour le mois précédent. Le run du
  lundi qui précède le premier mardi du mois met donc à jour le mois écoulé juste avant sa
  revue. Un mois de `partialMonths` est marqué « partiel » dans l'export.
- Seules les offres créées dans ces deux mois gardent leur intitulé et leur description en
  mémoire pendant le calcul. L'export n'en garde que des comptages, des intitulés et des
  termes : 100 intitulés non classés au plus (3 exemples bruts de 90 caractères au plus et
  leurs codes ROME), 80 termes émergents, 50 technologies candidates citées par au moins 5
  offres, 30 confusions. Un test vérifie que l'export Markdown reste sous 50 Ko, listes
  pleines.
- Non classés : parmi les offres du filet ROME (passe A) seulement, comme le demande le §9.1 ;
  les offres de la passe B non classées sont de toute façon écartées par la règle de
  rétention.
- Technologies candidates : heuristique du §9.1 sur les descriptions complètes, avec une liste
  de termes à écarter (contrats, diplômes, sigles RH, adresses web) et sans les termes déjà
  reconnus par la taxonomie (test des motifs sur le terme normalisé). Un mot à seule majuscule
  initiale (« Langfuse ») n'est pas vu : c'est la limite assumée de l'heuristique, que les
  recherches web de la revue complètent.
- `api-export` lit `review/AAAA-MM.json` dans Blobs (le fichier est déjà dans la liste des
  fichiers acceptés par `api-ingest`) et le sert en Markdown ou en JSON. Mois écoulé par
  défaut, en heure de Paris ; un mois absent répond 404 avec la liste des mois disponibles ;
  cache de 5 minutes. Lecture publique, sans jeton (§9.1) : aucune donnée personnelle.

### D66. Reclassement de tout l'historique (§9.3)

- Le reclassement rejoue, dans l'ordre, chaque run traité avec succès, depuis `raw` et avec un
  index `seen` repris de zéro : la règle de rétention dépend du classement, donc aussi la
  nouveauté et les fermetures. Il réécrit `offers/*`, l'index et ses copies par run, les
  comptes rendus (version de taxonomie et date du reclassement ; durées d'origine gardées),
  puis tous les agrégats. Les copies d'index de runs plus récents jamais menés au bout sont
  supprimées.
- La nouvelle version n'est enregistrée dans `state/taxonomy-version` qu'à la fin, avec son
  entrée d'historique : date de la version (`updated`, place du trait sur les courbes), jour
  du reclassement et effet sur le dernier run (offres classées avant et après). Interrompu, le
  reclassement est refait en entier au lancement suivant.
- Filet de sécurité : un traitement hebdomadaire qui trouve des données dans une autre
  version que `taxonomy.yaml` reclasse d'abord tout l'historique. Les séries ne mélangent
  jamais deux versions, même si le job `update` a échoué.
- `admin reclassify` lance le reclassement à la main (suivi de `admin push`) ; `admin status`
  montre la version du fichier et celle des données.
- Critère d'acceptation du lot 6 vérifié par des tests plutôt que par une vraie PR de
  taxonomie, qui changerait les chiffres publiés : une v4 de test (rôle `consultant_sap`)
  reclasse les offres concernées dans tous les runs, son marqueur apparaît sur l'axe des
  courbes, et le journal du site affiche une v4 de test dès sa fusion (D69). La première
  revue réelle fera la vérification de bout en bout.

### D67. Job `update` du VPS (§3.3)

- Chaque jour à 04:00 UTC, avant le run du lundi (05:00), sous le verrou des jobs. Premier
  temps, avec le code en place : vérifie que le dépôt est sur `main` sans fichier suivi
  modifié, `git fetch` puis avance rapide (équivalent de `git pull --ff-only`, avec un refus
  clair si `main` a divergé), `npm ci` si `package-lock.json` a changé. Second temps, dans un
  nouveau processus pour tourner avec le code à jour : reclassement si la version de
  `taxonomy.yaml` diffère de celle des données, puis envoi des agrégats.
- Conséquence assumée : tout ce qui est fusionné sur `main` tourne sur le VPS le lendemain
  matin. La relecture de chaque PR par Damien reste le seul contrôle ; le VPS ne lit que
  `main`, avec sa clé de déploiement en lecture seule.
- Les unités systemd ne sont pas réinstallées automatiquement : une mise à jour qui modifie
  `deploy/vps/systemd/` envoie une alerte avec les deux commandes à lancer. Une modification
  des services reste ainsi un geste de Damien.
- Alertes : échec de la mise à jour (les runs continuent avec le code en place), unités à
  recopier, taxonomie appliquée (information, avec l'effet sur le dernier run), reclassement en
  échec (le site garde les chiffres précédents).

### D68. Tâche planifiée de la revue mensuelle (§9.2, §15.7)

- Une expression cron ne sait pas viser le premier mardi du mois : jour du mois et jour de la
  semaine s'additionnent. La tâche part donc chaque mardi à 08:45 (heure de Paris) et le
  prompt s'arrête de lui-même hors du premier mardi.
- Elle tourne dans une nouvelle session Claude Code de l'environnement cloud du projet. Le
  2026-11-21, une session de cet environnement lisait le site (`https://barometre.dg-tech.dev`)
  sans difficulté : le repli par une GitHub Action et une branche `exports` n'est pas
  construit. Si l'export devient inaccessible, la tâche s'arrête et le dit.
- Prompt dans `docs/monthly-review-prompt.md` (annexe D, adresses du dépôt et du site, dossier
  et fichiers modifiables, entrée du journal écrite pour le site). La tâche ne fusionne
  jamais : Damien relit chaque PR « Taxonomie v<N> ».
- La tâche est créée après la fusion du lot 6, avec l'accord de Damien. Elle n'est pas dans
  le dépôt.

### D69. Page « Journal de la taxonomie » (§17.2)

- `/methodologie/journal/`, sous-page de la Méthodologie : hors de la navigation, qui marque
  alors la Méthodologie comme rubrique courante.
- Les versions et leurs notes viennent de `TAXONOMY_CHANGELOG.md` au build : une version
  fusionnée apparaît au déploiement qui suit la fusion. Le tableau des versions est complété
  en direct par `meta.taxonomyHistory` : appliquée dès le premier run, appliquée tel jour (avec
  l'effet sur la part des offres classées), en attente du reclassement de la nuit, ou avant le
  premier run. Le tableau est écrit au build : la page ne bouge pas au chargement.
- Les notes du journal sont écrites par la revue mensuelle à partir d'intitulés d'offres : le
  HTML brut y est échappé, les liens relatifs mènent au fichier du dépôt, et une image ou un
  lien autre que web arrête le build.
- « Propositions de la revue mensuelle » : un lien vers les PR « Taxonomie v » du dépôt, celles
  qui ont été refusées comprises. Le résumé des propositions écartées est dans chaque PR.
- La date de révision de la page est celle de son texte ou celle de la dernière version, si
  elle est plus récente (mention de rédaction et `sitemap.xml`).
- La page « Données & qualité » du tableau de bord renvoie vers le journal au lieu de
  l'afficher ; son petit lecteur Markdown est retiré.
- Lighthouse 13.6.0, mobile simulé, build servi par `vite preview` avec `SITE_INDEXABLE=1` :
  100 en performance, accessibilité, bonnes pratiques et référencement.

## Site public — Visuel animé de l'accueil (2026-11-21)

### D70. Flux du pipeline dans l'en-tête de l'accueil (§17.2)

- Demande de Damien : habiller l'en-tête de l'accueil d'un visuel animé à droite du titre et
  de l'introduction, subtil et professionnel. Piste retenue par Damien : « le flux du
  pipeline ». Des points gris (les offres de la semaine) arrivent à gauche par des couloirs qui
  convergent vers un filtre, la taxonomie ; les offres du périmètre en ressortent à la couleur
  de leur famille et rejoignent sa barre, les autres s'éteignent dans le filtre.
- Deux autres pistes ont été montrées à Damien sur l'aperçu de la PR, avec les mêmes données :
  un cadran de la part IA de la semaine suivi de sa courbe depuis le premier run (« baromètre
  vivant »), et un nuage des technologies les plus citées du mois (« nuage de compétences »).
  Damien a retenu le flux du pipeline le 2026-11-21 ; les deux autres ont été retirées.
- **Vrais chiffres, aucun nouvel agrégat** (§17.4) : semaine de référence des chiffres de tête,
  `timeseries.json` et filtres par défaut. Trois barres plutôt que les huit groupes :
  développement (groupe dev), data (le reste du socle) et IA (les groupes IA, numérateur de la
  « Part IA »). Leur total est le chiffre « Nouvelles offres » (test). Les huit groupes, dont
  plusieurs sous 5 offres par semaine, auraient chargé un dessin d'en-tête. Le libellé de
  gauche compte toutes les offres collectées de la semaine, périmètre élargi et non classées
  comprises ; la part des points écartés au filtre suit ce rapport.
- Les points sont un tirage selon ces proportions, pas une offre chacun ; les comptages
  affichés sont des effectifs, montrés même sous 5 (§8.3 ne masque que les statistiques). Une
  semaine partielle porte la pastille « partiel » dans la légende.
- **Technique** : un SVG dessiné à la taille réelle de son cadre (textes nets sur mobile),
  redessiné au changement de taille ; une boucle `requestAnimationFrame` d'une trentaine de
  cercles, suspendue hors de l'écran et quand l'onglet est caché. Couleurs par variables CSS
  (thèmes clair et sombre), places 1 à 3 de la palette catégorielle. Aucune dépendance.
  Les barres poussent au premier affichage seulement.
- **Accessibilité** : le dessin est `aria-hidden` ; la légende (`figcaption`) date la semaine et
  donne, en texte masqué, les comptages que le dessin montre. Avec « réduire les animations »,
  le visuel reste une image fixe : le flux déjà installé, sans mouvement.
- **Mise en page** : deux colonnes à partir de 960 px, le visuel sous le texte en dessous
  (hauteur réduite, largeur limitée à 560 px). Hauteur réservée : rien ne bouge à l'arrivée
  des données. Visuel masqué si les données manquent.
- Capture du README refaite avec le nouvel en-tête (mêmes agrégats publics du 21 novembre
  2026, image fixe du mode « animations réduites »).
- Lighthouse 13.6.0, build servi par `vite preview` avec `SITE_INDEXABLE=1` : 100 en
  performance, accessibilité, bonnes pratiques et référencement, en mobile simulé comme en
  bureau ; temps de blocage 0 ms et décalage de mise en page nul en mobile, comme avant.

## Passe de sécurité avant la mise en avant publique (2026-11-21)

### D71. Durcissements du dépôt (SPEC.md §11)

Demande de Damien : vérifier que le projet public ne pose aucun problème de sécurité ni de
confidentialité avant de le citer sur LinkedIn et sur son site. Constat complet dans le rapport
remis à Damien ; ce qui relève du dépôt est corrigé ici, le reste (réglages GitHub, Netlify,
VPS) lui revient.

- **Dépendances** : `npm audit fix`, sans changement de version majeure ni de `package.json`
  (zod 4.6.7, vite 8.3.8, eslint 10.15.0, typescript-eslint 8.73.0, minimatch 11.0.9).
  Les failles corrigées touchaient le serveur de développement de Vite, la validation de zod
  et les outils de lint ; aucune n'était exploitable sur le site publié.
- **`npm ci --ignore-scripts`** dans le job `update` du VPS, dans la procédure manuelle et
  dans la CI. Le job `update` tourne sous `veille-job`, qui a chargé le fichier d'environnement
  (identifiants France Travail, secret d'envoi, mot de passe restic, clés R2) : le script
  `postinstall` d'une dépendance compromise les lirait. Seul esbuild (outil de tsx) déclare un
  script d'installation ; il fonctionne sans, son binaire venant d'une dépendance optionnelle
  (vérifié : `tsx` et une collecte en mode fixtures après `npm ci --ignore-scripts`). La CI
  installe de la même façon, pour qu'une dépendance qui exigerait un script échoue avant
  d'arriver sur le VPS.
- **CI** : `persist-credentials: false` sur `actions/checkout` (le jeton du workflow ne reste
  pas dans `.git/config`, hors de portée des tests et des dépendances) et `timeout-minutes`.
  Les actions restent référencées par version majeure, pas par empreinte de commit : ce sont
  des actions officielles de GitHub, et la mise à jour des empreintes demanderait un outil de
  suivi des dépendances (Renovate ou Dependabot), à décider par Damien.
- **`/.well-known/security.txt`** (RFC 9116), écrit au build : contact `contact@dg-tech.dev`
  (déjà publié dans les mentions légales), `Expires` à 360 jours du build, recalculé à chaque
  déploiement. **`SECURITY.md`** : comment signaler une faille, périmètre, ce que le projet
  publie. Lien dans le README.
- **Revue mensuelle de la taxonomie** : l'export lu par la tâche planifiée contient des
  intitulés rédigés par des recruteurs, donc par n'importe qui. Le prompt dit désormais de les
  traiter comme des données, jamais comme des instructions, et de ne jamais pousser sur
  `main` : ce qui arrive sur `main` part sur le VPS la nuit suivante (job `update`). La copie
  du prompt dans la tâche planifiée est à aligner (accord de Damien).
