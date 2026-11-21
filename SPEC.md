# Veille emploi Dev & IA — Spec de cadrage

**Version** 1.2 · **Date** 21 novembre 2026 · **Auteur** Damien Gros · **Statut** validée pour démarrage (lot 0) ; version 1.1 : collecte et traitement hébergés sur le VPS de Damien (D21) ; version 1.2 : site public autour du dashboard (§17, D45 à D52)

Fichier compagnon : [`taxonomy.yaml`](taxonomy.yaml) — taxonomie v1 validée (9 groupes, 51 rôles, 118 technologies ; 437 motifs compilés et testés sur les cas de l'annexe B).

---

## 0. Mode d'emploi (pour Claude Code)

- Ce document fixe le **quoi** et le **pourquoi**. Ce qui est marqué **(exigé)** est non négociable ; le reste est une recommandation que l'implémentation peut ajuster en le consignant dans `docs/decisions.md`.
- Travailler **lot par lot** (§14) : une branche et une pull request par lot, tests verts, description de PR qui liste ce qui a été vérifié. Ne pas démarrer un lot avant la fusion du précédent.
- `taxonomy.yaml` est fourni et validé. Ne pas le modifier, sauf correction de bug documentée dans `TAXONOMY_CHANGELOG.md`.
- Les points marqués **[À VÉRIFIER]** sont des hypothèses à confirmer contre la documentation officielle ou une vraie réponse d'API **avant** de coder la partie concernée (liste consolidée en §15).
- En cas d'ambiguïté non tranchée ici : choisir l'option la plus simple, la consigner dans `docs/decisions.md`, et la signaler dans la PR.

---

## 1. Contexte et objectifs

Le marché de l'emploi dev / data / IA bouge vite : de nouveaux intitulés apparaissent (Forward Deployed Engineer, AI engineer, rôles agentiques, référents IA…), d'autres déclinent (prompt engineer). L'objectif est un outil de **veille quantitative** sur ce marché en France, mis à jour automatiquement.

| # | Objectif |
|---|---|
| O1 | Mesurer chaque semaine le volume d'offres par groupe de métiers, métier et technologie, et son évolution. |
| O2 | Suivre les salaires proposés (et les TJM) par groupe, métier, expérience et région. |
| O3 | Visualiser les offres sur une carte, avec filtre par région. |
| O4 | Détecter les métiers et termes émergents, et faire évoluer la taxonomie chaque mois, avec validation humaine. |
| O5 | Publier les résultats dans un site public qui explique la méthode et montre comment l'IA a servi à construire, exploiter et faire évoluer l'outil (§17). |

**Hors objectifs**

- Ce n'est ni un agrégateur d'offres ni un système d'alertes individuelles. Le dashboard affiche des **agrégats**, jamais de liste d'annonces Adzuna (conditions d'utilisation).
- Pas de granularité départementale dans le dashboard : le département ne sert qu'à découper la collecte et à déduire la région.
- Pas de comptes utilisateurs ni de multi-tenant.

---

## 2. Périmètre

| Dimension | Décision |
|---|---|
| Géographie | France entière (métropole + DROM). Dashboard filtrable par **région** (13 métropolitaines + 5 DROM). Offres à l'étranger exclues. Offres sans localisation exploitable : comptées au national, absentes de la carte. |
| Métiers | Taxonomie v1 (`taxonomy.yaml`). Le groupe `g9_elargi` (infra, cyber, support, commercial) est collecté et classé, mais masqué par défaut. |
| Sources MVP | API France Travail « Offres d'emploi v2 » ; API Adzuna (pays `fr`). |
| Sources v2 | Free-Work (TJM), APEC (via scraper tiers), API France Travail « Marché du travail » (tension, trimestriel). |
| Fréquences | Collecte **hebdomadaire** (lundi matin). Revue de taxonomie **mensuelle** (premier mardi du mois). |
| Historique | Constitué à partir du premier run (France Travail ne renvoie que les offres actives, aucun historique). Amorcé côté salaires par l'endpoint `history` d'Adzuna. |

---

## 3. Architecture

### 3.1 Vue d'ensemble

Deux hôtes depuis la version 1.1 (D21) : le VPS de Damien fait tout le travail lourd, le site
Netlify sert le dashboard et les agrégats.

```
┌─── VPS OVH de Damien (timers systemd, heures UTC) ─────────────────────────────────┐
│                                                                                    │
│ Lun. 05:00  weekly-run, relancé à 06:00 et 07:00 s'il reste incomplet              │
│               1. collecte France Travail ─┐                                        │
│               2. collecte Adzuna ─────────┴──► « raw »                             │
│               3. traitement : normalise · dédoublonne · classe · agrège            │
│                  ──► « offers », « index », « aggregates », « state »              │
│               4. envoi des agrégats ═══════════════════════════════════════╗       │
│                                                                            ║       │
│ Mar. 1 à 7  monthly-adzuna-stats ──► « aggregates », envoi ════════════════╣       │
│                                                                            ║       │
│ Chaque jour update : git pull de main ; si la taxonomie a changé,          ║       │
│             reclassement complet ──► « offers », « aggregates », envoi ════╣       │
│                                                                            ║       │
│ Stores sur le disque du VPS (DATA_DIR) ; aucun port entrant                ║       │
└────────────────────────────────────────────────────────────────────────────╫───────┘
                                                       HTTPS, INGEST_SECRET  ║
┌─── Netlify (un seul site, plan legacy) ────────────────────────────────────╨───────┐
│ api-ingest (synchrone) ──► Blobs « aggregates »                                    │
│ api-data, api-export (synchrones) ◄── dashboard statique (Vite) ◄── navigateur     │
│ watchdog (planifiée, quotidienne) : alerte si aucun run réussi depuis 8 jours      │
└────────────────────────────────────────────────────────────────────────────────────┘

 1er mardi du mois : tâche planifiée Claude ──► lit /api/export/taxonomy-review.md
                                             ──► ouvre une PR sur taxonomy.yaml
                                             ──► fusion par Damien ──► update du VPS ──► reclassement
```

### 3.2 Choix techniques

| Sujet | Choix |
|---|---|
| Hébergement | **Deux hôtes (exigé)** : le VPS OVH de Damien exécute la collecte, le traitement et le reclassement ; un site Netlify unique sert le dashboard et les API de lecture. Le plan Netlify du compte est un plan legacy sans fonctions background (§15.1, D21) : aucune fonction background n'est utilisée. |
| Langage | TypeScript, Node 22, ESM **(exigé)**. |
| Jobs (VPS) | Scripts Node lancés par des timers systemd (`OnCalendar`, heures UTC), sous un utilisateur système dédié. Ils utilisent les mêmes modules `src/` que les tests ; les données vivent dans un répertoire du VPS (`DATA_DIR`). |
| Fonctions (Netlify) | `@netlify/functions`, format moderne (`export default async (req, context)` + `export const config`). Synchrones (`api-ingest`, `api-data`, `api-export`) et une planifiée (`watchdog`, `config.schedule`, cron en **UTC**). |
| Stockage | Fichiers sur le disque du VPS pour tous les stores (§3.4) ; copie des seuls agrégats dans Netlify Blobs (`@netlify/blobs`), lue par le site. Pas de base de données au MVP (§5) **(exigé)**. |
| Validation | `zod` pour la taxonomie, les réponses d'API et le schéma `Offer`. |
| Tests | Vitest ; ESLint ; `tsc --noEmit` en CI (GitHub Actions). |
| Dashboard | Site statique **Vite + TypeScript**, graphiques **Apache ECharts**, carte **MapLibre GL JS** (ou Leaflet + markercluster) sur fond OpenStreetMap libre, contours de régions en GeoJSON simplifié. Pas de framework lourd nécessaire. *(recommandé)* |
| Données et Git | **Aucune donnée dans le dépôt (exigé).** Un run ne doit jamais déclencher de déploiement Netlify : l'envoi des agrégats écrit dans Blobs, sans build. |

**Contraintes à respecter (exigé)**

- Fonction Netlify synchrone : 60 s maximum ; corps de requête et de réponse de 6 Mo au plus (environ 4,5 Mo pour un contenu binaire, encodé en base64). Chaque fichier d'agrégats envoyé à `api-ingest` reste donc sous 4 Mo (critère de bascule du §5 : 5 Mo).
- Fonction planifiée : 30 s maximum, ne s'exécute que sur un déploiement publié.
- Variables d'environnement Netlify : environ 4 Ko au total pour toutes les fonctions.
- Jobs du VPS : idempotents et reprenables (§12), 60 minutes au plus par exécution (`TimeoutStartSec`), un seul job à la fois.
- Timers systemd : jour de la semaine et jour du mois se combinent en **ET**, contrairement au cron. « Premier mardi du mois » s'écrit `Tue *-*-01..07`.

### 3.3 Jobs et fonctions

**Jobs du VPS**

| Job | Déclencheur (UTC) | Rôle |
|---|---|---|
| `weekly-run` | lundi 05:00, relancé à 06:00 et 07:00 | Crée le run s'il n'existe pas (id = semaine ISO Europe/Paris, ex. `2026-W41`) ; collecte France Travail et Adzuna → `raw` (§4) ; traitement (§6, §7) ; envoi des agrégats. Une relance reprend à la première étape incomplète et ne fait rien si le run est complet ; 3 tentatives au plus, puis alerte (§10). |
| `monthly-adzuna-stats` | `Tue *-*-01..07 07:00` | Appels agrégés Adzuna (`history`, `histogram`, `geodata`) → `aggregates/adzuna-stats.json`, puis envoi. |
| `update` | chaque jour à 04:00 | Avance rapide de `main` (`git fetch`, refus si la copie de travail est modifiée ou a divergé), `npm ci` si `package-lock.json` a changé, alerte si les unités systemd ont changé. Puis, dans un nouveau processus, avec le code à jour : si la version de `taxonomy.yaml` diffère de `state/taxonomy-version`, reclassement complet (§9.3), puis envoi des agrégats (D67). |
| `admin` | à la main, par SSH | Relance d'une étape (`collect-ft`, `collect-adzuna`, `process`, `reclassify`, `push`) pour un `runId`, `--reset` en option. Remplace `api-admin`. |

**Fonctions Netlify**

| Fonction | Type | Déclencheur | Rôle |
|---|---|---|---|
| `api-ingest` | synchrone | `PUT /api/ingest/:name` | Reçoit un fichier d'agrégats du VPS et l'écrit dans le store Blobs `aggregates`. Protégé par `INGEST_SECRET` (`Authorization: Bearer`, comparaison à temps constant) ; `name` limité aux fichiers du §3.4. Le VPS envoie `meta.json` en dernier, pour que le dashboard passe d'un run au suivant d'un seul coup. |
| `api-data` | synchrone | `GET /api/data/:name` | Sert un fichier d'agrégats depuis Blobs (gzip, `Cache-Control: max-age=3600`). |
| `api-export` | synchrone | `GET /api/export/taxonomy-review(.md\|.json)?month=YYYY-MM` | Export de revue mensuelle (§9.1), mis en forme à partir de `review/{YYYY-MM}.json` préparé par le VPS. Lecture publique : il ne contient que des agrégats. |
| `watchdog` | planifiée | `0 9 * * *` | Lit `meta.json` et alerte (§10) si aucun run n'a réussi depuis 8 jours, ce qui couvre un VPS arrêté. |

**Pas d'appel entrant vers le VPS (exigé)** : il appelle les API sources et `api-ingest`, rien ne l'appelle. Les fonctions Netlify ne s'appellent pas entre elles.

### 3.4 Stockage (disque du VPS, Netlify Blobs)

| Store | Clés | Contenu |
|---|---|---|
| `raw` | `ft/{runId}/{partition}.json.gz`<br>`adzuna/{runId}/{passe}-{requete}-{page}.json.gz` | Réponses brutes, **sans les champs de contact** (§11). Une clé par partition, déterministe → réécriture sans doublon. |
| `offers` | `{runId}.jsonl.gz` | Offres normalisées et classées de la semaine (schéma §6.1), description incluse. |
| `index` | `seen.json.gz` | `uid → { firstSeenRun, lastSeenRun, createdAt }`. Sert à la nouveauté et à la durée de vie (§6.9). À partitionner par année si > 50 Mo. |
| `aggregates` | `meta.json`, `timeseries.json`, `salaries.json`, `techs.json`, `conditions.json`, `employers.json`, `titles.json`, `geo-regions.json`, `geo-points.json`, `emerging.json`, `quality.json`, `adzuna-stats.json`, `review/{YYYY-MM}.json` | Fichiers lus par le dashboard (§7.2) et par l'export de revue (§9.1). |
| `state` | `runs/{runId}.json`, `adzuna-budget/{date}.json`, `taxonomy-version` | État des runs (étapes, partitions faites, tentatives, compteurs, erreurs), consommation du quota Adzuna. |

Sur le VPS, chaque store est un répertoire de `DATA_DIR` et chaque clé un fichier, écrit de façon atomique (fichier temporaire puis renommage). Dans Netlify Blobs, seul le store `aggregates` existe : c'est une copie de celui du VPS, réécrite à chaque envoi.

**Sauvegarde (exigé)** : `raw` est irremplaçable, puisque France Travail ne renvoie aucun historique. `DATA_DIR` est copié hors du VPS au moins une fois par semaine, après `weekly-run`. **Tranché (D39)** : restic, chiffré, vers un bucket Cloudflare R2, le lundi à 09:00 UTC.

Le référentiel département → région est **embarqué dans le code** (`src/refs/departements.json`, 101 entrées) : aucun référentiel communal n'est nécessaire (§6.2).

### 3.5 Variables d'environnement

| Variable | Où | Usage |
|---|---|---|
| `FT_CLIENT_ID`, `FT_CLIENT_SECRET` | VPS | OAuth France Travail |
| `ADZUNA_APP_ID`, `ADZUNA_APP_KEY` | VPS | API Adzuna |
| `INGEST_SECRET` | VPS et Netlify | Envoi des agrégats à `api-ingest` |
| `SITE_URL` | VPS | Adresse du site Netlify, pour l'envoi |
| `DATA_DIR` | VPS | Répertoire des stores |
| `ALERT_NTFY_URL`, `ALERT_NTFY_TOKEN` (facultatif) | VPS et Netlify | Alertes ntfy (§10, D38) |
| `RESTIC_REPOSITORY`, `RESTIC_PASSWORD`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` | VPS | Sauvegarde de `DATA_DIR` (§3.4, D39) |
| `SOURCE_MODE` | VPS | `live` (défaut) ou `fixtures` (§13) |

Jamais versionnées. Sur le VPS, elles vivent dans un fichier d'environnement hors du dépôt, lisible par le seul utilisateur du service (droits 600). Un `.env.example` documente chaque variable.

### 3.6 Arborescence recommandée

```
/
├─ SPEC.md · taxonomy.yaml · TAXONOMY_CHANGELOG.md · netlify.toml · package.json
├─ netlify/functions/        # une fonction par fichier .mts (§3.3)
├─ scripts/                  # points d'entrée des jobs du VPS et des outils locaux
├─ deploy/vps/               # unités systemd et procédure d'installation du VPS
├─ src/
│  ├─ core/                  # normalize, taxonomy, classify, signals, salary, location, employer, dedup
│  ├─ sources/               # source.ts (interface commune), francetravail/, adzuna/
│  ├─ pipeline/              # collect, process, aggregate, reclassify, runState, push
│  ├─ storage/               # stores typés : fichiers (VPS), Blobs (Netlify), mémoire (tests)
│  └─ refs/                  # departements.json, regions.json
├─ web/                      # site Vite : accueil, pages éditoriales (content/), tableau de bord (§17)
├─ fixtures/                 # réponses d'API enregistrées (mode fixtures)
├─ tests/
└─ docs/                     # decisions.md, monthly-review-prompt.md
```

---

## 4. Sources

### 4.1 France Travail — API « Offres d'emploi v2 »

**Accès**

- Jeton OAuth2 `client_credentials` : `POST https://entreprise.francetravail.fr/connexion/oauth2/access_token?realm=/partenaire`, corps `grant_type=client_credentials&client_id=…&client_secret=…&scope=api_offresdemploiv2 o2dsoffre`. Mettre le jeton en cache pour sa durée `expires_in`.
- Recherche : `GET https://api.francetravail.io/partenaire/offresdemploi/v2/offres/search`.

**Limites et codes de retour**

- 10 appels/s : brider à **8/s**.
- Pagination `range=p-d`, 150 résultats max par page. Ne jamais compter sur plus de **1 150 résultats accessibles par requête** (borne prudente ; certaines sources évoquent un index de départ max de 3 000) **[À VÉRIFIER]**.
- Total disponible dans l'en-tête `Content-Range` (ex. `offres 0-149/2345`).
- `200` page complète · `206` contenu partiel (d'autres pages existent) · `204` aucun résultat · `400` paramètres invalides (erreur, pas de retry) · `429`/`5xx` retry avec backoff (§12).

**Passe A — stock par codes ROME (chaque semaine)**

1. Codes ROME : `rome_codes.core + secondary + extended` de la taxonomie, passés en une seule valeur `codeROME` séparée par des virgules (jusqu'à 200 valeurs acceptées).
2. Partition par **département** (101 codes : `01`…`95` avec `2A`, `2B`, et `971`…`976`), un département par partition.
3. **Aucun filtre de date** : on récupère tout le stock actif, ce qui permet d'observer à la fois l'arrivée et la disparition des offres (§6.9).
4. **Partitionnement adaptatif (exigé)** : si le total d'une partition dépasse 1 150, la redécouper par code ROME ; si c'est encore le cas, par tranches de date de création (`minCreationDate` / `maxCreationDate`, format ISO 8601 **[À VÉRIFIER]**).
5. Ordre de grandeur attendu : 15 à 30 k offres actives, 250 à 400 appels, moins de 2 minutes.

**Passe B — mots-clés (métiers émergents mal codés dans le ROME)**

1. Pour chaque `keywords` des rôles appartenant aux groupes `keyword_pass: true` : `motsCles=<mot-clé>`, sans filtre ROME ni département. **[À VÉRIFIER : sémantique de `motsCles` — champs interrogés, combinaison de plusieurs mots]**
2. Si le total dépasse 1 150 : découper par région (`region`) **[À VÉRIFIER]**, puis par département.
3. **Règle de rétention (exigé)** : une offre trouvée *uniquement* en passe B est conservée seulement si sa classification la range dans un groupe `keyword_pass: true` (g3 à g8). Sinon elle est écartée (et comptée dans `quality.json`). Cela évite de faire entrer les offres hors informatique qui citent simplement l'IA.

**Champs exploités** (noms à confirmer sur une réponse réelle au lot 1 **[À VÉRIFIER]**) : `id`, `intitule`, `description`, `dateCreation`, `dateActualisation`, `lieuTravail{libelle, latitude, longitude, codePostal, commune}`, `romeCode`, `romeLibelle`, `appellationlibelle`, `entreprise{nom}`, `typeContrat`, `typeContratLibelle`, `natureContrat`, `experienceExige`, `experienceLibelle`, `competences[]`, `langues[]`, `formations[]`, `salaire{libelle, commentaire, complement1, complement2}`, `dureeTravailLibelleConverti`, `alternance`, `qualificationCode`, `codeNAF`, `secteurActivite`, `secteurActiviteLibelle`, `trancheEffectifEtab`, `origineOffre{origine, urlOrigine, partenaires[]}`, `offresManqueCandidats`, `deplacementLibelle`.

### 4.2 Adzuna

**Accès** : `GET https://api.adzuna.com/v1/api/jobs/fr/search/{page}?app_id=…&app_key=…`

**Paramètres utiles** : `what`, `what_or`, `what_phrase`, `what_exclude`, `title_only`, `category` (tag IT à confirmer via `/jobs/fr/categories` **[À VÉRIFIER]**), `max_days_old`, `results_per_page` (50 max), `sort_by=date`, `location0…N`.

**Quotas (exigé)** : 25 appels/min, 250/jour, 1 000/semaine, 2 500/mois.

- Compteur persistant dans `state/adzuna-budget/` (jour, semaine ISO, mois), vérifié **avant** chaque appel.
- Budget par collecte hebdomadaire : **200 appels** ; budget mensuel des stats : **30 appels**.
- Pause de 2,5 s entre deux appels.
- Budget atteint : arrêt propre, run marqué « couverture partielle » dans `quality.json`, jamais de dépassement.

**Licence** : l'usage par une organisation commerciale est limité à un essai de 14 jours, après quoi une licence peut être exigée. Damien contacte Adzuna avant la mise en production **[DÉCISION OUVERTE]**. En attendant : aucune republication d'annonces Adzuna, uniquement des agrégats. Exigences d'attribution éventuelles (« Jobs by Adzuna ») **[À VÉRIFIER]**.

**Collecte hebdomadaire**

- Passe A : `category=<tag IT>`, `max_days_old=7`, `sort_by=date`, toutes les pages dans la limite du budget. À calibrer au premier run ; si la passe A seule dépasse le budget, la passe B est prioritaire.
- Passe B : `title_only=<mot-clé>` pour chaque `keywords` des groupes `keyword_pass: true`, `max_days_old=7`, **sans** filtre de catégorie (les rôles g6/g7 peuvent être rangés ailleurs par Adzuna). Même règle de rétention qu'en §4.1.
- Adzuna ne sert qu'à détecter des **nouvelles** offres : pas de stock, pas de durée de vie.

**Stats mensuelles** (`monthly-adzuna-stats`) : pour chaque groupe affiché au dashboard, appels `history` (salaire moyen mensuel), `histogram` (distribution des salaires) et `geodata` (volume et salaire moyen par région, `location0=France`), avec les mots-clés du groupe (`what_or` **[À VÉRIFIER : support sur ces endpoints]**). Environ 24 appels par mois.

**Champs exploités** : `id`, `title`, `description` (extrait tronqué → `descriptionIsFull=false`), `created`, `company.display_name`, `location.display_name`, `location.area[]` (hiérarchie, ex. `["France", "Occitanie", "Haute-Garonne", "Toulouse"]` **[À VÉRIFIER : libellés de régions]**), `latitude`, `longitude`, `salary_min`, `salary_max`, `salary_is_predicted`, `contract_type`, `contract_time`, `category.tag`, `redirect_url`.

### 4.3 Sources v2 (hors MVP)

Toutes les sources implémentent une interface commune **(exigé dès le lot 1)** pour pouvoir en ajouter sans toucher au pipeline :

```ts
interface Source {
  id: string;
  collect(runId: string, ctx: CollectContext): Promise<CollectReport>; // écrit dans « raw », reprend aux partitions non terminées
  normalize(raw: unknown, runId: string): Offer[];                     // §6.1
}
```

- **Free-Work** : missions freelance avec TJM. Vérifier les CGU et le `robots.txt` avant tout scraping.
- **APEC** : via un scraper tiers (Apify), coût à l'usage.
- **API Marché du travail (France Travail)** : tension offres / demandeurs, salaires proposés, par ROME × région, trimestriel.

---

## 5. Pourquoi pas de base de données au MVP

- Les volumes sont modestes : environ 5 à 15 k nouvelles offres par semaine, soit moins d'un million de lignes par an.
- Le dashboard lit des **agrégats pré-calculés** ; aucune requête à la volée n'est nécessaire au MVP.
- Netlify Database (Postgres) n'existe que sur les plans à crédits et consomme des crédits dès qu'elle est active.
- **Critères de bascule** vers Netlify Database : besoin de requêtes ad hoc non couvertes par les agrégats, ou fichier d'agrégats dépassant 5 Mo.

---

## 6. Traitement

### 6.1 Schéma `Offer` (normalisé, exigé)

```ts
type SourceId = 'francetravail' | 'adzuna';
type RegionCode = '84'|'27'|'53'|'24'|'94'|'44'|'32'|'11'|'28'|'75'|'76'|'52'|'93'|'01'|'02'|'03'|'04'|'06';

interface Offer {
  uid: string;                    // `${source}:${sourceId}`
  source: SourceId;
  sourceId: string;
  runId: string;                  // semaine ISO de collecte, ex. "2026-W41"
  collectedVia: ('rome' | 'keyword' | 'category')[];
  title: string;                  // intitulé brut
  titleNorm: string;              // intitulé normalisé (§6.4)
  description: string;
  descriptionIsFull: boolean;     // true pour France Travail, false pour Adzuna
  createdAt: string;              // ISO 8601, date de création à la source
  firstSeenRun: string;
  lastSeenRun: string;
  closedRun: string | null;       // première semaine où l'offre n'apparaît plus (France Travail)
  isBackfill: boolean;            // découverte au premier run alors que créée avant (§6.9)
  company: string | null;
  companyNorm: string | null;
  employerType: 'recrutement_interim' | 'esn_conseil' | 'public_recherche'
              | 'editeur_logiciel' | 'client_final' | 'inconnu';
  nafCode: string | null;
  companySizeBand: string | null;
  location: {
    label: string | null;
    communeInsee: string | null;
    departement: string | null;
    region: RegionCode | null;
    lat: number | null;
    lng: number | null;
    precision: 'commune' | 'departement' | 'region' | 'pays' | 'aucune';
  };
  remote: 'full_remote' | 'hybrid' | 'on_site' | 'unknown';
  contract: 'cdi' | 'cdd' | 'interim' | 'freelance' | 'alternance' | 'stage' | 'autre' | 'unknown';
  fullTime: boolean | null;
  experience: 'debutant' | '1_3' | '3_5' | '5_plus' | 'unknown';
  cadre: boolean | null;
  salary: {
    minAnnual: number | null;     // brut annuel en euros
    maxAnnual: number | null;
    midAnnual: number | null;
    source: 'declared' | 'predicted' | 'none';
    raw: string | null;
  };
  tjm: { min: number | null; max: number | null } | null;
  romeCode: string | null;
  role: string;                   // id de rôle, ou 'non_classe'
  group: string;                  // id de groupe, ou 'non_classe'
  secondaryRoles: string[];
  requalified: boolean;
  signals: { aiAny: boolean; genai: boolean; travel: boolean };
  techs: string[];                // ids de technologies
  taxonomyVersion: number;
  dedup: { key: string | null; duplicateOf: string | null };
}
```

Correspondances France Travail à confirmer au lot 1 **[À VÉRIFIER]** :

- `typeContrat` : `CDI` → `cdi`, `CDD` → `cdd`, `MIS` → `interim`, `LIB` → `freelance`, autres → `autre` ; `alternance=true` → `alternance`.
- `experienceExige` (`D` débutant accepté, `E` exigée) + années extraites de `experienceLibelle` → tranche.
- `qualificationCode` → `cadre`.

Côté Adzuna : `contract_type=permanent` → `cdi`, `contract_time=full_time` → `fullTime=true`, le reste en `unknown`. Le signal TJM (§6.6) peut faire passer une offre en `freelance`.

### 6.2 Localisation et région

- **France Travail** : `lieuTravail.commune` (code INSEE) → département = 2 premiers caractères (3 pour `971`…`976`, `2A`/`2B` pour la Corse) → région via `src/refs/departements.json`. Sans commune, extraire le département du préfixe de `lieuTravail.libelle` (ex. `31 - Toulouse`) **[À VÉRIFIER : format]**. Coordonnées depuis `latitude`/`longitude`.
- **Adzuna** : région depuis `location.area[1]` via une table de libellés (prévoir les anciens noms de régions s'ils apparaissent) ; coordonnées si présentes.
- Offre localisée hors de France : exclue. Offre « France » sans précision : `precision='pays'`, comptée au national, absente de la carte et des filtres régionaux.
- Codes région (INSEE) : 84 Auvergne-Rhône-Alpes · 27 Bourgogne-Franche-Comté · 53 Bretagne · 24 Centre-Val de Loire · 94 Corse · 44 Grand Est · 32 Hauts-de-France · 11 Île-de-France · 28 Normandie · 75 Nouvelle-Aquitaine · 76 Occitanie · 52 Pays de la Loire · 93 Provence-Alpes-Côte d'Azur · 01 Guadeloupe · 02 Martinique · 03 Guyane · 04 La Réunion · 06 Mayotte.

### 6.3 Salaires et TJM

**France Travail.** Analyse de `salaire.libelle` (formats observés : `Annuel de 50000.0 Euros à 55000.0 Euros sur 12 mois`, `Mensuel de 2500.0 Euros sur 12 mois`, `Horaire de 11.88 Euros`), puis repli sur `salaire.commentaire` (ex. `45 - 55 k€`). Règles **(exigé)** :

- Tout est ramené en **brut annuel** : annuel tel quel ; mensuel × nombre de mois indiqué (12 par défaut) ; horaire × 1 607 h.
- Bornes de cohérence : 18 000 € ≤ annuel ≤ 250 000 €. Hors bornes → `null`, journalisé.
- `min > max` → inversion. `midAnnual` = moyenne des bornes, ou valeur unique.
- Rien d'exploitable (« selon profil ») → `source='none'`.

**Adzuna.** `salary_min` / `salary_max` sont déjà annuels. **`salary_is_predicted = 1` → `source='predicted'` : exclu de toutes les statistiques salariales (exigé)**, compté à part dans `quality.json`.

**TJM.** Détecté par le signal `tjm` (titre + description) ; extraction du ou des montants proches du mot-clé ; bornes 150 € à 2 000 €/jour.

**Affichage.** Toujours afficher `n` et le taux de renseignement ; masquer les quantiles si `n < 5`. Cas de test en annexe C.

### 6.4 Normalisation de texte (exigé)

Implémentation de référence, testée sur les cas de l'annexe B. Les motifs de `taxonomy.yaml` sont écrits pour ce texte normalisé.

```ts
export function normalize(s: string): string {
  return s
    .replace(/[’‘`´]/g, "'")                                   // apostrophes
    .replace(/œ/gi, 'oe').replace(/æ/gi, 'ae')                 // ligatures
    .normalize('NFD').replace(/[̀-ͯ]/g, '')          // accents
    .toLowerCase()
    .replace(/\(\s*(h|f|x|nb|n|m|w|d)(\s*[\/,-]\s*(h|f|x|nb|n|m|w|d))+\s*\)/g, ' ') // (H/F), (f/h/n)…
    .replace(/\b(h|f)\s*\/\s*(h|f)(\s*\/\s*(x|nb))?\b/g, ' ')   // H/F, F/H/X sans parenthèses
    .replace(/(eur|teur)[·.]?(se|euse|rice|ice)\b/g, '$1')       // développeur·se, développeurse
    .replace(/[·.]e(s)?\b(?!\w)/g, '')                         // consultant·e, ingénieur.e
    .replace(/\((e|se|ne|euse|rice)\)/g, '')                   // ingénieur(e), développeur(se)
    .replace(/[|–—_]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
```

### 6.5 Classification (exigé)

- **Entrée** : `titleNorm` seul pour le rôle. La description sert aux signaux, aux technologies et à la requalification.
- **Algorithme** :
  1. Pour chaque rôle, il y a correspondance si au moins un motif `title.include` matche et aucun `title.exclude`.
  2. Trier les rôles trouvés par `priority` décroissante. Le premier est le **rôle principal**, les autres vont dans `secondaryRoles`.
  3. Si le rôle principal a une règle `requalify` et que la description porte le signal indiqué, remplacer par le rôle cible et poser `requalified=true`. Exemple : un intitulé générique « Ingénieur IA » dont la description cite LLM ou RAG passe en `ai_engineer` (g4).
  4. Aucune correspondance → `role='non_classe'`, `group='non_classe'`.
- Classification **déterministe**, sans LLM dans le pipeline hebdomadaire : reproductible, gratuite, testable. Un LLM peut intervenir en v2 dans la revue mensuelle, à titre de suggestion seulement.
- Les motifs sont compilés une fois par exécution : `new RegExp(source, 'i')`.
- Tous les cas de l'annexe B doivent passer **(exigé)**.

### 6.6 Signaux et technologies

- **Technologies** : appliquées à `titleNorm + ' ' + normalize(description)`, ids dédupliqués. Stockées pour toutes les offres, mais les **indicateurs technos ne portent que sur `descriptionIsFull=true`** (France Travail) pour ne pas biaiser les parts avec les extraits Adzuna.
- **Télétravail** : `full_remote` puis `hybrid` puis `on_site` (premier qui matche), sinon `unknown`.
- **`aiAny` / `genai`** : signaux de la taxonomie appliqués au titre et à la description. `ai_any` hérite des motifs de `genai` (`extends`).
- **`travel`** : déplacements mentionnés (pertinent pour les FDE).
- Ne jamais ajouter `\bai\b` seul dans un motif de description : « j'ai » matcherait.

### 6.7 Type d'employeur

Parcourir `employer_types` dans l'ordre : préfixe NAF (France Travail, `codeNAF` type `62.02A`), **ou** motif sur `companyNorm`. Le type `client_final` (`naf_prefixes: ['*']`) ne s'applique que si un NAF est connu. Sans NAF ni nom reconnu → `inconnu`.

`companyNorm` : normalisation §6.4, puis suppression des formes juridiques (`sas`, `sasu`, `sa`, `sarl`, `eurl`, `se`), des mots `groupe`, `group`, `france`, et de la ponctuation.

### 6.8 Dédoublonnage

- **Intra-source** : par `sourceId`.
- **Inter-sources** : clé = `sha1(titreClé + '|' + companyNorm + '|' + (departement ?? region))`, où `titreClé` est `titleNorm` sans les marqueurs de séniorité (`senior`, `junior`, `confirme`, `experimente`) ni les mots vides. Deux offres de même clé dont les `createdAt` sont à moins de 14 jours sont des doublons.
- **Priorité** : France Travail (description complète). L'offre Adzuna doublon reçoit `duplicateOf` et sort de tous les comptages, mais alimente le **taux de recouvrement** entre sources (`quality.json`).
- Entreprise absente ou anonyme : pas de dédoublonnage inter-sources (risque de faux positifs).

### 6.9 Nouveauté, durée de vie, premier run

- **France Travail** (stock complet chaque semaine) :
  - `uid` jamais vu → `firstSeenRun = runId` ;
  - vu en N-1 mais absent en N → `closedRun = N`. Durée de vie = `closedRun − createdAt`.
- **Adzuna** : nouveautés seulement, pas de durée de vie.
- **Séries temporelles** : les « nouvelles offres » sont comptées par **semaine de création** (`createdAt`), pas par semaine de collecte.
- **Premier run** : il découvre des offres créées avant son lancement (`isBackfill=true`). Elles sont comptées dans leur semaine de création, mais ces semaines sont marquées **partielles** dans `meta.json` (les offres déjà fermées n'ont pas été vues) et affichées hachurées dans le dashboard.

---

## 7. Indicateurs et agrégats

### 7.1 Indicateurs MVP

Les dimensions communes sont : semaine ou mois, groupe, rôle, région (ou France entière), source.

| # | Indicateur | Définition | Fichier |
|---|---|---|---|
| 1 | Nouvelles offres | Offres dédoublonnées par semaine de création. Dimensions communes + contrat. | `timeseries.json` |
| 2 | Stock actif | Offres France Travail actives à la date du run. | `timeseries.json` |
| 3 | Dynamique | Variation S-1 et M-1, moyenne mobile 4 semaines, indice base 100. Calculés côté client à partir de 1 et 2. | — |
| 4 | Part IA | (g3 à g8) / (g1 à g8). Et **hybridation** : part des offres g1/g2 avec `aiAny=true`. | `timeseries.json` |
| 5 | Intitulés | Top intitulés normalisés par rôle et par mois ; rôles secondaires fréquents. | `titles.json` |
| 6 | Technologies | Part des offres à description complète citant chaque techno, par mois × groupe ; variation sur 3 mois. | `techs.json` |
| 7 | Salaires | `n`, taux de renseignement, p25/p50/p75 de `midAnnual` par mois × groupe × rôle × expérience × région (et France). **Prime IA** = médiane g3–g8 − médiane g1, à expérience égale. | `salaries.json` |
| 8 | TJM | `n`, médiane, p25/p75 par groupe. | `salaries.json` |
| 9 | Conditions | Répartitions par mois × groupe : contrat, télétravail, expérience, cadre, déplacements. | `conditions.json` |
| 10 | Employeurs | Top 20 par groupe, répartition par type d'employeur, **nouveaux recruteurs IA** (premier poste g3–g8 vu sur la période). | `employers.json` |
| 11a | Carte — régions | Volume, part IA et densité pour 100 000 actifs par région et par mois. Source de population active **[À CHOISIR : INSEE]**. | `geo-regions.json` |
| 11b | Carte — points | Points des 12 dernières semaines : coordonnées arrondies à 0,01°, groupe, rôle, semaine. Pas de texte d'offre. | `geo-points.json` |
| 12 | Émergence | Non classés (top), n-grammes d'intitulés en hausse, rôles franchissant un seuil (≥ 5 offres/mois), rôles en baisse. | `emerging.json` |
| 13 | Qualité | Par run et par source/passe : offres collectées, retenues, écartées ; doublons ; taux de classification ; taux de salaire exploitable ; salaires prédits exclus ; offres sans géolocalisation ; appels API ; erreurs ; budget Adzuna ; couverture partielle. | `quality.json` |
| 14 | Stats Adzuna | `history`, `histogram`, `geodata` par groupe (mensuel). | `adzuna-stats.json` |

### 7.2 Format des fichiers d'agrégats

- Format « table de faits » compact : `{ "columns": [...], "rows": [[...], ...] }`, dimensions codées par identifiant. Libellés dans `meta.json`.
- Taille cible inférieure à 2 Mo par fichier.
- `meta.json` contient :
  - dernier run et son statut ;
  - semaines partielles ;
  - version courante de la taxonomie et `taxonomyHistory[]` (version, date), affichés en marqueurs sur les courbes ;
  - libellés des groupes, rôles, technos et régions.
- Les agrégats sont **intégralement recalculés** à chaque process à partir de `offers/*` : pas de mise à jour incrémentale fragile. Si la durée devient un problème, ne recalculer que les 13 dernières semaines et conserver le reste.

### 7.3 Indicateurs v2

Tension offres / demandeurs (API Marché du travail) ; durée de vie détaillée et taux de republication ; co-occurrences et matrice métier × techno ; liste des dernières offres France Travail des rôles émergents, avec lien vers la source ; comparaison Île-de-France vs autres régions.

---

## 8. Dashboard

Depuis la version 1.2, le dashboard est la rubrique « Tableau de bord » du site public (§17),
sous `/tableau-de-bord/`. Ce chapitre reste sa référence.

### 8.1 Pages

| Page | Contenu |
|---|---|
| **Vue d'ensemble** | Tuiles : nouvelles offres de la semaine, écart à la moyenne 4 semaines, part IA, médiane salaire IA vs dev, nombre de rôles émergents actifs. Courbe des nouvelles offres par groupe (12 mois). Bloc « ce qui bouge » : plus fortes hausses et baisses de rôles et de technos. |
| **Métiers** | Courbes par groupe et rôle (absolu, base 100, part du total). Tableau des rôles : volume, variation 3 mois, médiane salariale, part télétravail. |
| **Technologies** | Top par famille, montantes et descendantes, filtre par groupe. *(complet en lot 7)* |
| **Salaires** | Bandes p25–p75 et médiane par rôle, évolution de la médiane, prime IA, par expérience, par région, TJM. Taux de renseignement visible partout. |
| **Carte** | Points en clusters colorés par groupe + coloration des régions (volume, densité, part IA). Filtre de période. |
| **Employeurs** | Top recruteurs, types d'employeur, nouveaux recruteurs IA. *(complet en lot 7)* |
| **Données & qualité** | État des derniers runs, couverture par source, taux de classification, version de taxonomie et journal des changements, mentions des sources. |

### 8.2 Filtres globaux

Période · région (France entière par défaut) · groupes · rôles · source (toutes, France Travail, Adzuna) · contrat · « inclure le périmètre élargi » (désactivé par défaut). Les filtres sont reflétés dans l'URL pour pouvoir partager une vue.

### 8.3 Règles d'affichage (exigé)

- Toujours afficher `n`. Valeurs avec `n < 5` masquées et remplacées par « n < 5 ».
- Semaines partielles hachurées ; marqueurs verticaux aux changements de version de taxonomie.
- Mention des sources en pied de page (France Travail ; Adzuna, avec l'attribution éventuellement exigée **[À VÉRIFIER]**).
- Lisible sur mobile ; thème clair et sombre.
- **Accès** : public (**tranché, D32**). Les données sont des agrégats publics sans données personnelles. La protection par mot de passe intégrée de Netlify est réservée au plan Pro sur les plans legacy (§15.6, vérifié). Non indexé par les moteurs jusqu'au lancement du site public, indexé ensuite (§17.5, **D47**, révise D32).

---

## 9. Revue mensuelle de la taxonomie

### 9.1 Export de revue

`GET /api/export/taxonomy-review.md?month=YYYY-MM` (Markdown compact, < 50 Ko, destiné à la tâche planifiée Claude) et `…/taxonomy-review.json` (même contenu, structuré). Contenu :

- version courante de la taxonomie ;
- **non classés** : top 100 intitulés normalisés (n, 3 exemples d'intitulés bruts, codes ROME), uniquement parmi les offres du filet ROME ;
- **termes émergents** : n-grammes (1 à 3 mots) d'intitulés en hausse (n du mois ≥ 10 et ≥ 2 × la moyenne des 3 mois précédents) ;
- **tendances par rôle** : n du mois, moyenne des 3 mois précédents, statut ;
- **technos candidates** : termes techniques fréquents dans les descriptions non couverts par `technologies` (heuristique simple : tokens alphanumériques avec chiffres, points ou majuscules dans le texte brut, absents du dictionnaire) ;
- **confusions** : paires (rôle principal, rôle secondaire) les plus fréquentes, pour repérer les motifs trop larges.

L'export ne contient que des agrégats et des intitulés : lecture publique, sans jeton.

### 9.2 Tâche planifiée Claude

- **Quand** : premier mardi du mois à 08:45 (Europe/Paris), après le run du lundi. La tâche part chaque mardi et son prompt s'arrête hors du premier mardi : une expression cron ne sait pas viser le premier mardi seul (D68).
- **Besoins** : accès au dépôt GitHub (branche + PR), recherche web, lecture de l'export par `WebFetch`. **Vérifié** le 2026-11-21 : une session de l'environnement cloud du projet lit le site. Le repli prévu si le site devenait injoignable (une GitHub Action mensuelle récupère l'export et le pousse sur une branche `exports` exclue des déploiements Netlify) n'est pas construit (D68).
- **Règles (exigé)** :
  - jamais de suppression ni de renommage d'`id` : passer `status: deprecated` ;
  - toute modification incrémente `version`, ajoute une entrée datée et justifiée (chiffres de l'export, exemples) dans `TAXONOMY_CHANGELOG.md`, et des cas de test à l'annexe B pour chaque motif ajouté ;
  - `npm test` vert avant d'ouvrir la PR ;
  - aucun changement justifié → pas de PR, juste un résumé.
- Prompt complet : annexe D, repris avec les adresses du dépôt et du site dans `docs/monthly-review-prompt.md`, qui fait foi.

### 9.3 Après fusion

Fusion → le job quotidien `update` du VPS récupère `main` et constate que la version de `taxonomy.yaml` diffère de `state/taxonomy-version` → reclassement :

1. Relit `raw` semaine par semaine (reprise possible, §12), renormalise et reclasse, avec un index `seen` repris de zéro.
2. Réécrit `offers/*`.
3. Recalcule tous les agrégats, ajoute l'entrée dans `meta.taxonomyHistory` (avec l'effet sur le dernier run : offres classées avant et après), puis les envoie au site.

La version des données n'est enregistrée qu'à la fin : un reclassement interrompu est refait en entier. Un traitement hebdomadaire qui trouve des données dans une autre version reclasse d'abord tout l'historique (D66).

Le déploiement Netlify qui suit la fusion ne reclasse rien : il publie le dashboard, les fonctions et la page « Journal de la taxonomie » (§17.2), qui montre la nouvelle version comme en attente jusqu'au reclassement. Une taxonomie fusionnée est appliquée aux données au plus tard le lendemain.

Les séries restent comparables dans le temps puisque tout l'historique est reclassé avec la même version.

---

## 10. Alertes et supervision

- **Alerte (exigé)** en cas de :
  - collecte incomplète après 3 tentatives ;
  - erreur du process ou de la reclassification ;
  - budget Adzuna épuisé avant la fin de la passe B ;
  - zéro offre France Travail collectée ;
  - aucun run réussi depuis 8 jours.

  Canal : ntfy **(tranché, D38)**.

  Les alertes partent du VPS, sauf « aucun run réussi depuis 8 jours », vérifiée sur Netlify par `watchdog` pour couvrir un VPS arrêté.
- Résumé hebdomadaire de 5 lignes (volumes, plus fortes hausses) : optionnel, v2.
- Logs structurés JSON : `runId`, étape, partition, durée, compteurs, erreurs. Sur le VPS, ils vont dans le journal systemd.

---

## 11. Sécurité, données personnelles, licences

- Secrets uniquement en variables d'environnement : fichier d'environnement du VPS (droits 600, hors du dépôt) et variables Netlify.
- `INGEST_SECRET` sur `api-ingest`, comparaison à temps constant. **Aucun jeton personnel Netlify sur le VPS (exigé)** : un tel jeton donne accès à tout le compte Netlify, sans portée possible. L'administration des runs passe par SSH (job `admin`).
- VPS : utilisateur système dédié au projet, aucun port entrant ouvert pour lui, dépôt récupéré en lecture seule.
- **Données personnelles (exigé)** : les champs de contact des offres (nom, e-mail, téléphone, coordonnées de recruteurs : objet `contact` côté France Travail) sont **supprimés avant toute écriture**, y compris dans `raw`. Les noms d'entreprise (personnes morales) sont conservés.
- **Licences** :
  - France Travail : respecter la licence de réutilisation de la base des offres, notamment la mention de la source **[À VÉRIFIER : termes exacts]**.
  - Adzuna : pas de republication d'annonces, attribution si exigée, licence commerciale à clarifier (§4.2).
- **Rétention** : `raw` conservé sans limite (nécessaire à la reclassification de tout l'historique). Volume à réévaluer à 1 Go.

---

## 12. Robustesse et idempotence (exigé)

- Chaque partition est écrite sous une clé déterministe (`runId` + partition) : une relance réécrit la même clé, sans doublon.
- État de run dans `state/runs/{runId}.json` : étapes, partitions terminées, tentatives, compteurs, erreurs. Un collecteur relancé reprend aux partitions non terminées.
- **Durée** : le VPS n'impose pas de limite de plateforme. Chaque job s'arrête au bout de 60 minutes ; un job interrompu (délai dépassé, redémarrage du VPS) est repris par la relance suivante grâce à l'état de run.
- **Retry** : backoff exponentiel (1, 2, 4, 8, 16 s ; 5 essais) sur `429`, `5xx` et erreurs réseau ; respecter `Retry-After`.
- **Verrou** : un seul job à la fois sur le VPS (`flock` sur un fichier de `DATA_DIR`) ; un job qui trouve le verrou pris attend qu'il se libère.
- Le process est **rejouable intégralement** depuis `raw`.

---

## 13. Qualité et tests (exigé)

- **Tests unitaires** :
  - normalisation ;
  - classification : **100 % des cas de l'annexe B**, stockés dans `tests/fixtures/titles.json` ;
  - parsing des salaires et TJM (annexe C) ;
  - département → région ;
  - signaux télétravail, TJM et déplacements ;
  - dédoublonnage ;
  - type d'employeur.
- **Test de cohérence de `taxonomy.yaml`** : schéma zod, compilation de tous les motifs, `id` uniques, groupes référencés existants, `requalify.to` existant. Exécuté en CI et par la routine mensuelle.
- **Mode fixtures** : `SOURCE_MODE=fixtures` → les collecteurs lisent des réponses enregistrées dans `fixtures/`, sans appel d'API. Permet les tests de bout en bout du pipeline, son exécution locale et le développement du dashboard sans clés.
- **CI GitHub Actions** sur chaque PR : lint, typecheck, tests.

---

## 14. Plan de livraison

Ordre de livraison : les lots 4 puis 5 passent avant le lot 3, qui attend le compte Adzuna (D31, D37).
Viennent ensuite les lots du site public (§17, D50) : S1 à S4, le lancement (§17.8), puis le lot 6,
S5 et S6. Le lot 3 n'est plus sur le chemin critique. La règle « un lot à la fois » (§0) vaut
aussi pour les lots S.

| Lot | Contenu | Critères d'acceptation |
|---|---|---|
| **0 — Socle** | Dépôt, TypeScript, Vitest, ESLint, CI, `netlify.toml`, arborescence (§3.6). Chargement et validation de `taxonomy.yaml`, normalisation, classification, signaux, technos, référentiel départements → régions, `.env.example`, `docs/decisions.md`. | `npm test` vert ; 100 % des cas de l'annexe B ; test de cohérence de la taxonomie vert. |
| **1 — Collecte France Travail** | OAuth, client bridé (8/s) avec retry, passes A et B, partitionnement adaptatif, suppression des champs de contact, écriture `raw`, état de run, `api-admin` (remplacé au lot 5 par le job `admin`, D21), mode fixtures. | Run réel national complet en moins de 10 minutes ; rapport de compteurs cohérent ; aucun champ de contact dans `raw` (test) ; relance d'une partition sans doublon. |
| **2 — Traitement & agrégats** | Schéma `Offer`, salaires, localisation, employeurs, dédoublonnage intra-source, index `seen`, nouveauté, disparition et premier run, agrégats 1 à 13 (sans Adzuna), `meta.json`, `quality.json`. | Process d'une semaine réelle en moins de 5 minutes ; tests des parseurs verts ; semaines partielles marquées. |
| **3 — Adzuna** | Collecte avec budget, normalisation, dédoublonnage inter-sources, stats mensuelles. | Budget jamais dépassé (test) ; salaires prédits exclus (test) ; taux de recouvrement calculé. |
| **4 — Dashboard MVP** | Pages Vue d'ensemble, Métiers, Salaires, Carte, Données & qualité ; filtres globaux dans l'URL. `api-ingest`, `api-data` et l'envoi des agrégats (`push`). | Vue d'ensemble affichée en moins de 2 s en 4G ; `n` affiché partout ; masquage `n < 5` ; lisible sur mobile ; agrégats envoyés par `push` visibles sans déploiement. |
| **5 — VPS, planification & alertes** | Installation du VPS (`deploy/vps/` : unités systemd, procédure), jobs `weekly-run` et `admin`, relances, verrou, alertes, `watchdog`, sauvegarde de `DATA_DIR` ; retrait de `collect-francetravail-background` et d'`api-admin`. | Deux runs hebdomadaires consécutifs sans intervention ; alerte déclenchée sur un échec simulé ; sauvegarde en place. |
| **S1 — Cadrage du site public** | SPEC 1.2 (§17), décisions D45 à D52, licence MIT, nom d'hôte du VPS retiré de la documentation, ligne « État » du README. | Spec relue et fusionnée par Damien. |
| **S2 — Socle du site** | Build multi-pages, gabarit commun, tableau de bord sous `/tableau-de-bord/`, redirection des anciens liens, page 404, identité, référencement technique (`noindex` maintenu), mentions légales, en-têtes de sécurité (§17.2 à §17.5). | Critères communs du §17.4 ; tests du tableau de bord inchangés ; redirection des anciens liens testée. |
| **S3 — Accueil** | Page d'accueil du §17.2. | Chiffres identiques aux tuiles du tableau de bord (test) ; accueil affiché en moins de 2 s en 4G ; critères communs du §17.4. |
| **S4 — Pages éditoriales** | À propos, Méthodologie, L'IA dans ce projet (§17.2). Puis lancement (§17.8). | Textes relus et validés par Damien ; chaque chiffre daté ou lu en direct ; liens vers le dépôt valides. |
| **6 — Revue mensuelle** | Export `.md` / `.json`, job `update` et reclassement, `TAXONOMY_CHANGELOG.md`, `docs/monthly-review-prompt.md`. Page « Journal de la taxonomie » du site (§17.2). | Une PR de taxonomie de test déclenche le reclassement complet et le marqueur de version apparaît sur les courbes ; le journal du site affiche cette version. |
| **S5 — Résumé de la semaine** *(optionnel)* | Résumé rédigé par Claude et vérifié par du code (§17.6). | Un échec de l'API ne fait jamais échouer le run (test) ; un chiffre faux est rejeté (test) ; trois résumés relus par Damien avant affichage. |
| **S6 — Analyses** | Rubrique Analyses, 2 articles, flux RSS (§17.2, §17.7). | Articles relus et publiés ; chaque chiffre retrouvable dans le tableau de bord. |
| **7 — v2** | Pages Technologies et Employeurs complètes, indicateurs §7.3, sources v2 (§4.3). | Défini au moment du lancement. |

---

## 15. Points à vérifier au démarrage

| # | Point | Lot |
|---|---|---|
| 1 | Plan Netlify du compte (à crédits ou legacy) et disponibilité des fonctions background. **Tranché (D21)** : plan legacy sans fonctions background ; le pipeline tourne sur le VPS. | 0 |
| 2 | France Travail : plafond réel de pagination (1 150 ou 3 000), noms exacts des champs, format de `minCreationDate`/`maxCreationDate`, sémantique de `motsCles`, paramètre `region`, présence de `codeNAF`, format de `lieuTravail.libelle`, codes `typeContrat`. | 1 |
| 3 | Liste des codes M18 du ROME 4.0 (de nouveaux codes ont pu apparaître, comme M1811 pour la data). | 1 |
| 4 | Termes de la licence de réutilisation des offres France Travail. | 1 |
| 5 | Adzuna : tag de catégorie IT pour `fr`, libellés de régions dans `location.area`, support de `what_or` sur `history`/`histogram`/`geodata`, attribution, licence commerciale. | 3 |
| 6 | Netlify : protection par mot de passe selon le plan. **Tranché (D32)** : réservée au plan Pro sur les plans legacy ; dashboard public. | 4 |
| 7 | Accès de la tâche planifiée Claude au site (`WebFetch`) ; sinon repli GitHub Action (§9.2). **Vérifié** le 2026-11-21 : le site répond depuis l'environnement cloud du projet ; pas de repli (D68). | 6 |
| 8 | VPS : système et version, Node 22, systemd, espace disque pour `DATA_DIR`, accès en lecture au dépôt. **Vérifié** le 2026-10-03 : Ubuntu 26.04.1, Node 22, systemd 259, 33 Go libres, clé de déploiement en lecture seule (D41). | 5 |

## 16. Décisions ouvertes

1. Accès au dashboard : public ou protégé. **Tranché (D32)** : public.
2. Canal d'alerte : ntfy, e-mail ou Slack. **Tranché (D38)** : ntfy.
3. Réponse d'Adzuna sur l'usage commercial (en cas de refus, Free-Work remplace Adzuna au lot 3). Le site public sert l'activité professionnelle de Damien, ce qui relève de l'usage commercial au sens d'Adzuna : il se lance sans Adzuna, et le lot 3 attend que Damien décide d'écrire à Adzuna (D50).
4. Source de population active pour la densité régionale. **Tranché (D29)** : Insee, RP2023.
5. Nom du dépôt et du domaine. **Tranché (D46, D64)** : le site s'appelle « Baromètre emploi Dev & IA » et passe sur `barometre.dg-tech.dev`, au lancement (§17.8) ; le dépôt, d'abord gardé sous son nom, devient `Dg-tech-dev/barometre-emploi-dev-ia` le 2026-11-21.
6. Moyen de sauvegarde de `DATA_DIR` hors du VPS (§3.4). **Tranché (D39)** : restic vers Cloudflare R2.

## 17. Site public

Version 1.2 (D45). Le dashboard devient la rubrique d'un site public qui sert de vitrine au
travail de Damien : il présente les résultats, explique la méthode et montre comment l'IA a
servi à construire, exploiter et faire évoluer l'outil (objectif O5). Choix de Damien : D45 à
D52.

### 17.1 Principes

- Le tableau de bord (§8) reste tel quel, sous `/tableau-de-bord/`. Ses règles d'affichage
  (§8.3) valent pour tout chiffre publié sur le site.
- L'IA est montrée là où elle sert (développement avec Claude Code, exploitation, revue
  mensuelle du §9) et son absence est expliquée là où il faut des résultats reproductibles
  (classification déterministe, §6.5).
- **Contenus écrits avec l'IA (exigé)** : un texte rédigé par un modèle porte une mention
  visible ; chaque chiffre qu'il cite est confronté aux agrégats par du code avant
  publication ; en cas d'écart ou d'erreur, un texte de repli sans IA est publié. Les analyses
  sont signées par Damien, avec la mention « préparé avec Claude » (D51).
- Inchangé (exigé, §3.2) : aucun run ne déclenche de déploiement. Les pages éditoriales sont
  publiées par le déploiement qui suit une fusion sur `main`.

### 17.2 Pages

| Page | Adresse | Contenu | Lot |
|---|---|---|---|
| Accueil | `/` | Accroche, avec le flux du pipeline animé sur la semaine de référence (D70) ; 4 chiffres vivants (nouvelles offres de la semaine de référence, part IA, prime IA, rôles émergents actifs) ; mini-courbe depuis le premier run ; « ce qui bouge » ; schéma du pipeline ; accès au tableau de bord et à « L'IA dans ce projet ». Résumé de la semaine au lot S5. | S3 |
| Tableau de bord | `/tableau-de-bord/#/<page>` | Les pages du §8.1, inchangées. | S2 |
| L'IA dans ce projet | `/ia/` | Développement piloté par la spec avec Claude Code, exploitation, revue mensuelle, ce qui reste déterministe et pourquoi ; décisions et incidents réels ; liens vers le dépôt. | S4 |
| Méthodologie | `/methodologie/` | Sources et licences, collecte, taxonomie, classification, règles d'affichage, limites chiffrées, qualité des derniers runs lue dans `quality.json`. | S4 |
| Journal de la taxonomie | `/methodologie/journal/` | Versions de la taxonomie : propositions de la revue mensuelle, changements retenus, effet sur le taux de classification. Remplace le journal de la page « Données & qualité ». | 6 |
| Analyses | `/analyses/`, une page par article | Articles datés, chiffres figés à leur date, liens vers des vues filtrées du tableau de bord ; flux RSS. | S6 |
| À propos | `/a-propos/` | Damien, son activité (lien vers `dg-tech.dev`), pourquoi ce projet ; liens LinkedIn et GitHub. Pas de formulaire. | S4 |
| Mentions légales | `/mentions-legales/` | Éditeur, hébergeur, sources et licences (France Travail, Insee, OpenStreetMap, IGN), absence de cookies et de mesure d'audience. | S2 |
| Page introuvable | `/404.html` | Liens vers l'accueil et le tableau de bord. | S2 |

### 17.3 Navigation, identité, langue

- Français seul (D49). Le lecteur est vouvoyé ; phrases courtes, chiffres toujours datés.
- En-tête : logotype (retour à l'accueil), Tableau de bord, Analyses, L'IA dans ce projet,
  Méthodologie, À propos. Pied de page : sources, date de la dernière mise à jour
  (`meta.json`), lien vers le dépôt GitHub, mentions légales.
- Palette et thèmes du dashboard (D36) pour tout le site ; favicon ; image de partage par page.

### 17.4 Technique

- Build Vite multi-pages, sans framework (D48) : une page HTML par rubrique et un gabarit
  commun (en-tête, navigation, pied) injecté au build. Les textes éditoriaux sont des fichiers
  Markdown du dépôt (`web/content/`), convertis en HTML au build.
- **Anciens liens (exigé)** : une adresse `/#/<page>?<filtres>` partagée avant le lot S2 mène
  à `/tableau-de-bord/#/<page>?<filtres>`. Le fragment n'arrivant jamais au serveur, la
  redirection est faite en JavaScript sur l'accueil.
- Les chiffres de l'accueil viennent de `/api/data/*` et des fonctions de `web/src/lib/` : ils
  sont identiques à ceux du tableau de bord (test). Aucun nouvel agrégat avant le lot S5.
- Critères communs aux lots S2 à S6 : `npm run check` vert ; Lighthouse au moins 90 en
  performance, accessibilité, bonnes pratiques et référencement sur chaque nouvelle page ;
  lisible sur mobile ; thèmes clair et sombre.

### 17.5 Référencement

Révise le §8.3 (D47) : le site reste `noindex` pendant sa construction. Au lancement (§17.8) :
indexation de tout le site, `robots.txt`, `sitemap.xml`, et pour chaque page un titre, une
description, une URL canonique et des balises Open Graph.

### 17.6 Résumé de la semaine (lot S5, optionnel)

- Étape non bloquante de `weekly-run`, après le traitement : un appel à l'API Claude reçoit un
  extrait compact des agrégats et rend un texte court avec la liste des chiffres cités ; un
  vérificateur déterministe les confronte aux agrégats.
- Écart, erreur de l'API ou délai dépassé : résumé de repli produit par un gabarit sans IA et
  alerte ntfy de niveau avertissement. Le run n'échoue jamais à cause de cette étape (test).
- Le résumé est écrit dans `aggregates/summary.json` et envoyé par `push` (liste du §3.4
  complétée au lot S5). La clé d'API vit dans le fichier d'environnement du VPS, jamais dans
  Netlify.
- Les trois premiers résumés sont relus par Damien avant leur affichage public.

### 17.7 Contenus et données

Un article peut citer des chiffres agrégés, figés à sa date : c'est du contenu éditorial, pas
une copie des données, que le dépôt ne contient toujours pas (D51). Aucune offre ni aucun
extrait d'annonce n'est republié.

### 17.8 Lancement

Le lancement suit le lot S4 :

1. **(exigé)** Avant que le dépôt devienne public, la politique Netlify des variables sensibles
   est réglée sur « Require approval » : les aperçus de PR venant de forks partagent les
   stores Blobs de la production et pourraient lire `INGEST_SECRET`.
2. Balayage du dépôt (secrets, noms d'hôte, données), puis passage en public par Damien,
   sous licence MIT (D52).
3. Domaine branché (D46), HTTPS actif ; indexation ouverte et `sitemap.xml` déclaré aux
   moteurs.
4. README du dépôt réécrit en vitrine : capture, lien vers le site, usages de l'IA.

---

## Annexe A — Taxonomie

Voir [`taxonomy.yaml`](taxonomy.yaml) : version 1, 9 groupes, 51 rôles, 118 technologies, signaux (`genai`, `ai_any`, `remote`, `tjm`, `travel`) et types d'employeurs. Les conventions d'écriture des motifs sont en tête de fichier.

## Annexe B — Cas de classification

Intitulé brut → rôle principal attendu. À reprendre tel quel dans `tests/fixtures/titles.json`.

| # | Intitulé brut | Rôle attendu | Groupe |
|---|---|---|---|
| 1 | Forward Deployed Engineer IA (H/F) | `forward_deployed_engineer` | `g5_deploiement` |
| 2 | Applied AI, Forward Deployed Machine Learning Engineer - EMEA | `forward_deployed_engineer` | `g5_deploiement` |
| 3 | Hands-on AI Solutions Engineer (Forward Deployed) | `forward_deployed_engineer` | `g5_deploiement` |
| 4 | Ingénieur Forward Deployed (H/F) | `forward_deployed_engineer` | `g5_deploiement` |
| 5 | Forward deployment engineer (H/F/NB) | `forward_deployed_engineer` | `g5_deploiement` |
| 6 | Agentic AI Engineer | `agentic_engineer` | `g4_genai_agentique` |
| 7 | Développeur d'Agents IA / Agent Engineer (H/F) | `agentic_engineer` | `g4_genai_agentique` |
| 8 | Architecte Solution IA Agentique | `ai_solutions_engineer` | `g5_deploiement` |
| 9 | Product Owner IA agentique H/F | `ai_product_manager` | `g6_pilotage` |
| 10 | Proxy Product Owner – Agentic Email Automation/ Marseille | `ai_product_manager` | `g6_pilotage` |
| 11 | Expert IA Agentique – Gouvernance & Industrialisation | `agentic_engineer` | `g4_genai_agentique` |
| 12 | Ingénieur DevSecOps & SRE / IA Agentique Senior | `agentic_engineer` | `g4_genai_agentique` |
| 13 | Data Scientist – IA Générative & Agentic AI | `agentic_engineer` | `g4_genai_agentique` |
| 14 | Coach IA / Développeur Python (IT) / Freelance | `referent_coach_ia` | `g6_pilotage` |
| 15 | Référent / Coach IA - Toulouse (H/F) | `referent_coach_ia` | `g6_pilotage` |
| 16 | Consultant(e) Data Protection & Gouvernance IA (RGPD/RIA) | `ai_compliance` | `g7_gouvernance` |
| 17 | Chef de projet data et intelligence artificielle | `chef_projet_ia` | `g6_pilotage` |
| 18 | Responsable IA H/F | `head_of_ai` | `g6_pilotage` |
| 19 | Head of Data & AI | `head_of_ai` | `g6_pilotage` |
| 20 | Directeur commercial solutions IA | `commercial_tech` | `g9_elargi` |
| 21 | Account Executive IA | `commercial_tech` | `g9_elargi` |
| 22 | Prompt Engineer | `prompt_engineer` | `g8_temoins` |
| 23 | AI Trainer - Rédacteur francophone | `ai_trainer_annotation` | `g8_temoins` |
| 24 | Formatrice IA générative | `formateur_ia` | `g6_pilotage` |
| 25 | AI Engineer (f/h) | `ai_engineer` | `g4_genai_agentique` |
| 26 | AI Engineer (H/F/NB) | `ai_engineer` | `g4_genai_agentique` |
| 27 | Ingénieur IA Azure (H/F) | `ingenieur_ia` | `g3_ia_ml` |
| 28 | Développeur Python FastAPI IA (H/F) | `ingenieur_ia` | `g3_ia_ml` |
| 29 | Data Engineer & Lakehouse & Data Platform AWS | `data_engineer` | `g2_data` |
| 30 | Senior Snowflake / DBT Data Engineer | `data_engineer` | `g2_data` |
| 31 | Data Scientist / AI Engineer | `ai_engineer` | `g4_genai_agentique` |
| 32 | Deep Learning Engineer | `ml_engineer` | `g3_ia_ml` |
| 33 | Machine Learning Engineer - NLP | `nlp_engineer` | `g3_ia_ml` |
| 34 | MLOps Engineer | `mlops` | `g3_ia_ml` |
| 35 | Ingénieur LLMOps | `llmops_platform` | `g4_genai_agentique` |
| 36 | Développeur RAG / LLM | `rag_engineer` | `g4_genai_agentique` |
| 37 | Ingénieur IA générative (H/F) | `genai_llm_engineer` | `g4_genai_agentique` |
| 38 | Chercheur en apprentissage automatique | `research_ai` | `g3_ia_ml` |
| 39 | Analyste de données | `data_analyst` | `g2_data` |
| 40 | Business Analyst Master Data Management | `data_governance` | `g2_data` |
| 41 | Consultant BI Power BI | `bi` | `g2_data` |
| 42 | Développeur Full Stack Drupal | `dev_cms` | `g1_dev` |
| 43 | Développeur·se Full Stack Java/Angular | `dev_fullstack` | `g1_dev` |
| 44 | Développeur(se) Java F/H | `dev_generic` | `g1_dev` |
| 45 | Développeur Api Talend (H/F) | `dev_generic` | `g1_dev` |
| 46 | Lead Tech Java / Spring - API Management | `tech_lead_architecte` | `g1_dev` |
| 47 | Senior Dev Fullstack (front mindset) (f/h/n) | `dev_fullstack` | `g1_dev` |
| 48 | Staff Backend Engineer (f/h/n) | `tech_lead_architecte` | `g1_dev` |
| 49 | Développeur React Native | `dev_mobile` | `g1_dev` |
| 50 | Développeur web PHP Symfony | `dev_web` | `g1_dev` |
| 51 | Ingénieur(e) développement logiciel Angular F/H | `dev_frontend` | `g1_dev` |
| 52 | Ingénieur(e) développement logiciel F/H | `software_engineer` | `g1_dev` |
| 53 | Consultant sécurité IA | `ai_security` | `g7_gouvernance` |
| 54 | Testeur / Testeuse informatique | `qa_test` | `g1_dev` |
| 55 | Technicien support informatique | `support_it` | `g9_elargi` |
| 56 | Administrateur systèmes et réseaux | `admin_sys_reseau` | `g9_elargi` |
| 57 | Ingénieur Cloud AWS | `devops_sre_cloud` | `g9_elargi` |
| 58 | Consultant Securité expert Vulnerabilité Qualys | `cybersecurite` | `g9_elargi` |
| 59 | Consultant SAP S/4HANA | `non_classe` | — |
| 60 | Expert WebMethods & API Management | `non_classe` | — |
| 61 | Juriste AI Act / protection des données | `juriste_ia` | `g7_gouvernance` |
| 62 | AI Red Teamer | `ai_security` | `g7_gouvernance` |
| 63 | Automation Engineer n8n | `ai_automation` | `g4_genai_agentique` |
| 64 | Product Manager, APIs | `non_classe` | — |

Cas de requalification : intitulé « Ingénieur IA (H/F) » avec la description « Vous concevrez des solutions basées sur des LLM et du RAG. » → `ai_engineer` (`requalified=true`).

Cas de signaux (description) : « J'ai le plaisir… Télétravail 2 jours par semaine. TJM : 550 €/jour. Déplacements fréquents chez nos clients. Stack : Python, FastAPI, LangChain, Qdrant, Azure OpenAI, vue d'ensemble, tableau de bord, Spring France recrute. »

- `aiAny=true`, `genai=true`, `remote=hybrid`, `travel=true`, TJM 550.
- `techs` = `python`, `fastapi_flask`, `langchain`, `openai`, `qdrant`, `azure`, `azure_ai`. En particulier **ni** `vue`, **ni** `tableau`, **ni** `spring`.

Faux positifs à éviter : « J'ai 10 ans d'expérience, vue globale du SI, mise à jour du tableau. » → `aiAny=false`, aucune techno.

## Annexe C — Cas de parsing des salaires

| Entrée | `minAnnual` | `maxAnnual` | `midAnnual` | `source` |
|---|---|---|---|---|
| FT libellé `Annuel de 50000.0 Euros à 55000.0 Euros sur 12 mois` | 50 000 | 55 000 | 52 500 | declared |
| FT libellé `Annuel de 45000.0 Euros sur 12 mois` | 45 000 | 45 000 | 45 000 | declared |
| FT libellé `Mensuel de 3000.0 Euros à 3500.0 Euros sur 13 mois` | 39 000 | 45 500 | 42 250 | declared |
| FT libellé `Mensuel de 2500.0 Euros sur 12 mois` | 30 000 | 30 000 | 30 000 | declared |
| FT libellé `Horaire de 15.0 Euros` | 24 105 | 24 105 | 24 105 | declared |
| FT libellé `Annuel de 500000.0 Euros sur 12 mois` | null | null | null | none |
| FT libellé absent, commentaire `Selon profil` | null | null | null | none |
| FT libellé absent, commentaire `45 - 55 k€ brut annuel` | 45 000 | 55 000 | 50 000 | declared |
| Adzuna `salary_min=50000`, `salary_max=60000`, `salary_is_predicted="0"` | 50 000 | 60 000 | 55 000 | declared |
| Adzuna `salary_min=50000`, `salary_max=60000`, `salary_is_predicted="1"` | 50 000 | 60 000 | 55 000 | predicted (exclu des stats) |

| Entrée (TJM) | `tjm.min` | `tjm.max` |
|---|---|---|
| `TJM : 550 €/jour` | 550 | 550 |
| `TJM 400-550 €/j` | 400 | 550 |
| `Taux journalier : 2 500 €` | null | null (hors bornes) |

## Annexe D — Prompt de la tâche planifiée mensuelle

À créer comme tâche planifiée Claude (premier mardi du mois, 08:45 Europe/Paris), en remplaçant `<OWNER>/<REPO>` et `<SITE_URL>`. Le prompt doit rester autonome : chaque exécution démarre sans mémoire.

```text
Tu es chargé de la revue mensuelle de la taxonomie du projet <OWNER>/<REPO>
(veille du marché de l'emploi dev / data / IA en France, dashboard sur <SITE_URL>).

Si aujourd'hui n'est pas le premier mardi du mois, arrête-toi sans rien faire.

1. Détermine le mois écoulé M (format YYYY-MM).
2. Lis l'export : <SITE_URL>/api/export/taxonomy-review.md?month=M
   (si inaccessible : lis le fichier exports/M.md de la branche « exports » du dépôt).
3. Clone le dépôt et lis SPEC.md (§6.5 et §9), taxonomy.yaml et TAXONOMY_CHANGELOG.md.
4. Analyse l'export :
   - intitulés non classés récurrents (n >= 10 sur le mois) qui relèvent du
     périmètre dev / data / IA ;
   - termes émergents en forte hausse ;
   - rôles en hausse ou en baisse durable (3 mois) ;
   - technologies candidates citées fréquemment ;
   - confusions entre rôles qui révèlent un motif trop large.
5. Fais 5 à 10 recherches web ciblées sur les intitulés de métiers dev / IA apparus
   ou en forte croissance récemment en France, pour confirmer ou compléter.
6. Propose des changements à taxonomy.yaml UNIQUEMENT s'ils sont étayés par l'export
   (chiffres) et, pour un nouveau rôle, par au moins une source externe :
   - nouveaux rôles, nouveaux motifs ou synonymes, nouvelles technologies, mots-clés
     de collecte, passage en « status: deprecated » ;
   - jamais de suppression ni de renommage d'un id ;
   - respecte les conventions d'écriture des motifs en tête de taxonomy.yaml
     (texte normalisé sans accents, priorités cohérentes).
7. Pour chaque motif ajouté ou modifié, ajoute au moins un cas positif et, si utile,
   un cas négatif dans tests/fixtures/titles.json.
8. Incrémente « version » et « updated », puis ajoute une entrée datée dans
   TAXONOMY_CHANGELOG.md : chaque changement avec sa justification chiffrée
   (n observé, exemples d'intitulés, source externe).
9. Lance « npm ci && npm test ». Corrige jusqu'à ce que tout soit vert.
10. Ouvre une pull request « Taxonomie v<N+1> — <M> » dont la description résume
    les ajouts, les modifications et l'impact attendu sur les volumes par groupe.
11. Si aucun changement n'est justifié, n'ouvre pas de PR et termine par un résumé
    de 5 lignes de ce que montre l'export.
```
