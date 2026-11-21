# Journal de la taxonomie

La [taxonomie](https://github.com/Dg-tech-dev/barometre-emploi-dev-ia/blob/main/taxonomy.yaml)
range chaque offre dans un métier, à partir de son intitulé et de quelques mots de sa
description (voir la [méthodologie](/methodologie/)). Elle évolue par versions. Cette page
les liste, de la plus récente à la plus ancienne, avec leur effet sur la part des offres
classées.

## Comment elle évolue

Une revue a lieu chaque mois :

1. Le premier mardi du mois, une tâche planifiée confie à Claude un export du mois écoulé :
   les intitulés non classés les plus fréquents, les termes en forte hausse, l’évolution de
   chaque métier, les technologies citées que la taxonomie ne connaît pas encore et les
   métiers souvent confondus. Cet export ne contient que des comptages et des intitulés
   d’offres.
2. Claude vérifie les nouveaux intitulés par quelques recherches sur le web. Quand un
   changement est justifié, il le propose dans une pull request, avec ses chiffres, des
   exemples d’intitulés et des cas de test. Sinon, il ne propose rien.
3. Damien relit la proposition, puis la fusionne, la corrige ou la refuse.
   [Toutes les propositions](https://github.com/Dg-tech-dev/barometre-emploi-dev-ia/pulls?q=is%3Apr+in%3Atitle+%22Taxonomie+v%22),
   retenues ou non, restent visibles sur GitHub.
4. La nuit qui suit la fusion, le serveur reclasse toutes les offres depuis le premier run
   avec la nouvelle version, puis publie les nouveaux chiffres. Les courbes du tableau de bord
   portent un trait vertical à la semaine de chaque nouvelle version.

Un métier n’est jamais supprimé ni renommé : s’il disparaît des offres, il est marqué comme
abandonné, et les séries passées restent lisibles.

## Les versions

<!-- site:taxonomy-versions -->

La part des offres classées est mesurée sur le dernier run au moment du reclassement, avec
la version précédente puis avec la nouvelle. Les versions antérieures au premier run n’ont été
appliquées à aucune donnée.

## Le détail des changements

Chaque version est décrite par sa note du
[journal des changements](https://github.com/Dg-tech-dev/barometre-emploi-dev-ia/blob/main/TAXONOMY_CHANGELOG.md),
reprise ici telle quelle. Les mots en police technique, comme `core` ou `dev_generic`, sont
des identifiants de la taxonomie.

<!-- site:taxonomy-changelog -->
