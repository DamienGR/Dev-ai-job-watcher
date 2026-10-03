# Veille emploi Dev & IA

Veille quantitative du marché de l'emploi dev, data et IA en France : collecte hebdomadaire des
offres (France Travail, Adzuna), classification par une taxonomie versionnée, agrégats publiés
sur un dashboard Netlify. Le cadrage complet est dans [SPEC.md](SPEC.md).

**État** : lot 0 (socle) et taxonomie v2 livrés ; lot 1 (collecte France Travail) en cours.
Les lots suivants sont décrits au §14 de la spec.

## Démarrage

Prérequis : Node 22 (voir `.nvmrc`).

```sh
npm ci
npm run check      # lint + typecheck + tests
npm test           # tests seuls (Vitest)
npm run build      # site statique dans web/dist
```

Les variables d'environnement sont documentées dans [`.env.example`](.env.example). Aucune
donnée ni aucun secret n'est versionné.

## Collecte France Travail

```sh
npm run collect:ft -- --mode fixtures   # sans clé : offres fictives de fixtures/
npm run probe:ft                         # vérifie les points [À VÉRIFIER] sur l'API réelle
npm run collect:ft -- --run-id 2026-W41  # collecte réelle nationale, stockée dans .data/
```

Le mode réel lit `FT_CLIENT_ID` et `FT_CLIENT_SECRET` dans l'environnement ou dans `.env`.
Une collecte interrompue reprend où elle s'est arrêtée ; `--reset` repart de zéro.

En production, la collecte tourne dans la fonction `collect-francetravail-background` et se
relance à la main par `POST /api/admin/run` :

```sh
curl -X POST "$SITE/api/admin/run" -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H 'content-type: application/json' -d '{"step":"collect-ft","runId":"2026-W41"}'
```

## Traitement et agrégats

```sh
npm run collect:ft -- --mode fixtures --run-id 2026-W41   # collecte d'abord
npm run process -- --run-id 2026-W41                      # puis traitement, dans .data/
```

Le traitement relit `raw` du run, normalise et classe les offres (schéma `Offer`, SPEC.md
§6.1), applique la règle de rétention de la passe B, met à jour l'index `seen` (nouveautés,
disparitions, premier run) et écrit `offers/<run>.jsonl.gz`, puis recalcule tous les agrégats
(`aggregates/*.json`, SPEC.md §7) à partir de `offers/*`. Il est rejouable : une relance du
même run donne le même résultat. Il refuse un run dont la collecte est en cours, ou plus
ancien que le dernier run traité.

## Organisation

```
taxonomy.yaml           taxonomie des métiers (source de vérité, conventions en tête)
TAXONOMY_CHANGELOG.md   journal des versions de la taxonomie
netlify.toml            site Netlify unique : dashboard + fonctions
src/core/               normalize, taxonomy, classify, signals, salary, location, employer, dedup, stats
src/refs/               départements (101), régions (18), population active INSEE par région
src/sources/            interface Source, client HTTP bridé, collecteur France Travail (Adzuna au lot 3)
src/pipeline/           état des runs, traitement (process, index seen), agrégats (aggregates/)
src/storage/            stores Netlify Blobs, mémoire (tests) et disque (scripts)
src/functions/          logique des fonctions Netlify, testable
netlify/functions/      fonctions Netlify : collect-francetravail-background, api-admin
scripts/                collecte et traitement locaux, sonde de l'API France Travail
web/                    dashboard Vite (page d'attente jusqu'au lot 4)
fixtures/               réponses d'API fictives, mode SOURCE_MODE=fixtures
tests/                  tests Vitest ; tests/fixtures/titles.json = cas de classification
docs/decisions.md       décisions d'implémentation
```

## Utiliser le cœur

```ts
import { classify } from './src/core/classify';
import { normalize } from './src/core/normalize';
import { parseTjm } from './src/core/salary';
import { detectSignals, detectTechs } from './src/core/signals';
import { loadCompiledTaxonomy } from './src/core/taxonomy';

const taxonomy = await loadCompiledTaxonomy(); // une fois par exécution
const titleNorm = normalize('Ingénieur IA (H/F)');
const descriptionNorm = normalize('Vous concevrez des solutions basées sur des LLM et du RAG.');

classify(titleNorm, descriptionNorm, taxonomy);
// { role: 'ai_engineer', group: 'g4_genai_agentique', secondaryRoles: [], requalified: true }
const signals = detectSignals(titleNorm, descriptionNorm, taxonomy); // aiAny, genai, tjm, travel, remote
const techs = detectTechs(titleNorm, descriptionNorm, taxonomy); // ['llm', 'rag']
const tjm = signals.tjm ? parseTjm(`${titleNorm} ${descriptionNorm}`) : null;
```

## Faire évoluer la taxonomie

Toute modification de `taxonomy.yaml` (revue mensuelle ou correction) doit :

1. respecter les conventions en tête du fichier : motifs écrits pour le texte normalisé, jamais
   de suppression ni de renommage d'`id` (passer `status: deprecated`) ;
2. incrémenter `version` et mettre `updated` à la date du jour ;
3. ajouter l'entrée `## v<N> — <AAAA-MM-JJ>` dans `TAXONOMY_CHANGELOG.md`, avec la
   justification chiffrée de chaque changement ;
4. ajouter dans `tests/fixtures/titles.json` au moins un cas par motif ajouté ou modifié :
   `{ "source": "...", "title": "...", "description"?: "...", "role": "...", "group": "...", "requalified"?: true }`
   (`role` et `group` valent `non_classe` pour un intitulé hors taxonomie) ;
5. passer `npm test`, qui vérifie le schéma, la cohérence et tous les cas de classification.
