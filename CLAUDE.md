# CLAUDE.md

Le projet est entièrement cadré par [SPEC.md](SPEC.md) : lire son §0 « Mode d'emploi » avant
toute modification.

## Règles de travail

- Un lot à la fois (SPEC.md §14) : une branche et une PR par lot, tests verts, description de PR
  qui liste ce qui a été vérifié. Ne pas démarrer un lot avant la fusion du précédent.
- Ce qui est marqué **(exigé)** dans SPEC.md est non négociable. Toute autre latitude prise, ou
  ambiguïté tranchée (option la plus simple), va dans `docs/decisions.md` et dans la PR.
- **[À VÉRIFIER]** : confirmer contre la documentation officielle ou une vraie réponse d'API
  avant de coder la partie concernée.
- `taxonomy.yaml` : ne pas modifier, sauf correction de bug documentée (voir « Faire évoluer la
  taxonomie » dans README.md).
- Aucune donnée ni aucun secret dans le dépôt ; un run de collecte ne déclenche jamais de
  déploiement.

## Commandes

- `npm ci` puis `npm run check` (lint + typecheck + tests) avant chaque commit.
- `npm run build` : build du site statique (`web/dist`) ; pages déclarées dans
  `web/site/config.ts`, textes en Markdown dans `web/content/` (SPEC.md §17).
- `npm run collect:ft -- --mode fixtures` : collecte France Travail locale sans clé ;
  `npm run probe:ft` : sonde de l'API réelle (identifiants `FT_CLIENT_ID` / `FT_CLIENT_SECRET`).
- `npm run process -- --run-id <run>` : traitement local d'un run collecté (offres, index,
  agrégats dans `.data/`).
- `npm run weekly-run`, `npm run admin -- <commande>`, `npm run backup`, `npm run update` : jobs
  du VPS, lancés en production par `deploy/vps/veille-job` (fichier d'environnement, verrou)
  et les timers de `deploy/vps/systemd/` ; procédure dans `deploy/vps/README.md`.

## Conventions

- TypeScript strict, ESM, Node 22 ; imports relatifs sans extension (résolution `Bundler`).
- Tout texte comparé aux motifs de la taxonomie passe par `normalize()`
  (`src/core/normalize.ts`). La taxonomie est chargée et compilée une fois par exécution
  (`loadCompiledTaxonomy()`).
- Fonctions Netlify : `netlify/functions/<nom>.mts`, format moderne (`export default` +
  `export const config`), suffixe `-background` pour les fonctions background.
- Tests Vitest dans `tests/` ; cas de classification dans `tests/fixtures/titles.json`.
- Commentaires et documentation en français.
