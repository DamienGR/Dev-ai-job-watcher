# Veille emploi Dev & IA

Veille quantitative du marché de l'emploi dev, data et IA en France : collecte hebdomadaire des
offres (France Travail, Adzuna), classification par une taxonomie versionnée, agrégats publiés
sur un dashboard Netlify. Le cadrage complet est dans [SPEC.md](SPEC.md).

**État** : lot 0 (socle) — outillage, chargement et validation de la taxonomie, normalisation,
classification, signaux, technologies, extraction du TJM, référentiel départements → régions.
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

## Organisation

```
taxonomy.yaml           taxonomie des métiers (source de vérité, conventions en tête)
TAXONOMY_CHANGELOG.md   journal des versions de la taxonomie
netlify.toml            site Netlify unique : dashboard + fonctions
src/core/               normalize, taxonomy, classify, signals, salary (TJM)
src/refs/               départements (101) et régions (18), codes INSEE
src/sources/            collecteurs France Travail et Adzuna (lot 1, lot 3)
src/pipeline/           collecte, traitement, agrégats, reclassement (lots 1 à 6)
src/storage/            accès typé à Netlify Blobs (lot 1)
netlify/functions/      fonctions planifiées, background et API (lots 1 à 6)
web/                    dashboard Vite (page d'attente jusqu'au lot 4)
fixtures/               réponses d'API enregistrées, mode SOURCE_MODE=fixtures (lot 1)
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
