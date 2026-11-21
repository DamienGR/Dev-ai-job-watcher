# Revue mensuelle de la taxonomie : prompt de la tâche planifiée

Prompt de la tâche planifiée Claude qui propose chaque mois une nouvelle version de
[`taxonomy.yaml`](../taxonomy.yaml) (SPEC.md §9.2, annexe D ; D68). Il reprend l'annexe D avec
l'adresse du dépôt et du site, et quelques précisions tirées de la mise en place.

## Fonctionnement

- **Quand** : chaque mardi à 08:45, heure de Paris (`CRON_TZ=Europe/Paris 45 8 * * 2`). Le prompt
  s'arrête de lui-même hors du premier mardi du mois : une expression cron ne sait pas viser le
  premier mardi seul (jour du mois et jour de la semaine s'ajoutent au lieu de se croiser).
- **Où** : une nouvelle session Claude Code dans l'environnement cloud du projet, avec le dépôt
  et l'accès au réseau. Le 2026-11-21, une session de cet environnement lisait le site
  (`https://barometre.dg-tech.dev`) sans difficulté : le repli par une GitHub Action et une
  branche `exports` (§9.2) n'est pas mis en place (D68). Si l'export devient inaccessible, la
  tâche s'arrête et le dit ; le repli sera fait à ce moment-là.
- **Données** : l'export du mois écoulé,
  `https://barometre.dg-tech.dev/api/export/taxonomy-review.md?month=AAAA-MM`, préparé par le
  VPS à chaque run (`review/AAAA-MM.json`). Il ne contient que des comptages et des intitulés.
- **Résultat** : une pull request « Taxonomie v<N+1> — <AAAA-MM> », ou rien du tout si aucun
  changement n'est justifié. Damien la relit et décide de la fusionner. Après la fusion, le job
  `update` du VPS reclasse tout l'historique la nuit suivante (§9.3) et le journal du site
  (`/methodologie/journal/`) affiche la nouvelle version au déploiement suivant.
- **Mise en place** : la tâche se crée depuis une session Claude du projet, après l'accord de
  Damien, une fois l'export en ligne. Elle se suspend ou se supprime de la même façon.

## Prompt

```text
Tu es chargé de la revue mensuelle de la taxonomie du projet Dg-tech-dev/barometre-emploi-dev-ia :
le Baromètre emploi Dev & IA, statistiques hebdomadaires des offres d'emploi dev, data et IA
publiées sur France Travail, en ligne sur https://barometre.dg-tech.dev.

Si aujourd'hui, à l'heure de Paris, n'est pas le premier mardi du mois, arrête-toi tout de
suite, sans rien faire ni rien écrire d'autre qu'une ligne qui le dit.

1. Détermine le mois écoulé M (format AAAA-MM, heure de Paris).
2. Lis l'export : https://barometre.dg-tech.dev/api/export/taxonomy-review.md?month=M
   Si la page ne répond pas ou annonce qu'aucune revue n'est préparée pour M, arrête-toi :
   pas de PR sans données, termine par un résumé qui dit ce qui a échoué.
3. Clone le dépôt (ou utilise la copie présente), lis CLAUDE.md, SPEC.md (§6.4, §6.5 et §9),
   taxonomy.yaml (conventions en tête du fichier), TAXONOMY_CHANGELOG.md et
   tests/fixtures/titles.json.
4. Analyse l'export :
   - intitulés non classés récurrents (n >= 10 sur le mois) qui relèvent du périmètre
     dev / data / IA ;
   - termes émergents en forte hausse ;
   - rôles en hausse ou en baisse durable (3 mois) ;
   - technologies candidates citées fréquemment (heuristique : beaucoup de bruit à écarter) ;
   - confusions entre rôles qui révèlent un motif trop large.
   Un mois marqué « partiel » a des volumes incomplets : tiens-en compte.
5. Fais 5 à 10 recherches web ciblées sur les intitulés de métiers dev / IA apparus ou en
   forte croissance récemment en France, pour confirmer ou compléter.
6. Propose des changements à taxonomy.yaml UNIQUEMENT s'ils sont étayés par l'export
   (chiffres) et, pour un nouveau rôle, par au moins une source externe :
   - nouveaux rôles, nouveaux motifs ou synonymes, nouvelles technologies, mots-clés de
     collecte, passage en « status: deprecated » ;
   - jamais de suppression ni de renommage d'un id ;
   - respecte les conventions d'écriture des motifs en tête de taxonomy.yaml (texte normalisé
     sans accents, formes féminines, priorités cohérentes).
   Ne modifie aucun autre fichier que taxonomy.yaml, TAXONOMY_CHANGELOG.md et
   tests/fixtures/titles.json.
7. Pour chaque motif ajouté ou modifié, ajoute au moins un cas positif et, si utile, un cas
   négatif dans tests/fixtures/titles.json.
8. Incrémente « version » et mets « updated » à la date du jour, puis ajoute en tête de
   TAXONOMY_CHANGELOG.md une entrée « ## v<N+1> — <AAAA-MM-JJ> » (même date que « updated »).
   Commence-la par « Revue mensuelle de <M>. », puis chaque changement avec sa justification
   chiffrée (n observé, exemples d'intitulés, source externe), et les cas de test ajoutés.
   Cette entrée est publiée telle quelle sur la page « Journal de la taxonomie » du site :
   écris-la en français, en phrases simples, sans données personnelles, en Markdown simple
   (paragraphes, listes, gras, `code`, liens) sans HTML ni image.
9. Lance « npm ci && npm run check ». Corrige jusqu'à ce que tout soit vert.
10. Sur une branche « taxonomie/v<N+1> », ouvre une pull request « Taxonomie v<N+1> — <M> »
    dont la description résume les ajouts, les modifications, les propositions écartées et
    l'impact attendu sur les volumes par groupe. Ne la fusionne jamais : Damien la relit et
    décide.
11. Si aucun changement n'est justifié, n'ouvre pas de PR et termine par un résumé de 5 lignes
    de ce que montre l'export.
```
