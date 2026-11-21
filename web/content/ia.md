# L’IA dans ce projet

Ce baromètre a été conçu et développé avec Claude, l’IA d’Anthropic. Damien Gros a fixé le
cap, tranché les décisions et relu chaque changement avant de l’accepter. Les chiffres
publiés, eux, sont calculés sans IA. Cette page explique qui a fait quoi, comment, et pourquoi
l’IA n’intervient pas partout.

## En bref

- **La spécification et la taxonomie** ont été rédigées par Claude au fil de discussions avec
  Damien, qui les a validées puis versées dans le premier commit du dépôt, le 2 octobre 2026.
- **Le code** a ensuite été écrit en entier par Claude Code, l’agent de développement
  d’Anthropic, lot par lot. Chaque lot est une pull request que Damien relit et fusionne.
- **L’exploitation** suit la même règle : Claude Code prépare et vérifie, Damien fait les
  gestes sensibles, comme saisir les secrets ou agir avec les droits d’administration du
  serveur.
- **Le classement des offres et les chiffres** sont produits par du code déterministe, sans
  modèle de langage.

## Une spécification avant le code

Tout part de la [spécification](https://github.com/Dg-tech-dev/barometre-emploi-dev-ia/blob/main/SPEC.md),
un document d’environ 900 lignes (version 1.2 au 21 novembre 2026). Elle décrit ce que l’outil
doit faire : sources, traitement, indicateurs, affichage et plan de livraison. Trois
conventions encadrent le travail de l’agent :

- ce qui est marqué **(exigé)** ne se discute pas. Par exemple : aucune donnée collectée dans
  le dépôt, et les contacts des recruteurs supprimés avant toute écriture ;
- ce qui est marqué **[À VÉRIFIER]** doit être confirmé sur la documentation officielle ou sur
  une vraie réponse de l’API avant d’être codé ;
- toute latitude prise, ou toute ambiguïté tranchée, est consignée avec sa raison dans le
  [journal des décisions](https://github.com/Dg-tech-dev/barometre-emploi-dev-ia/blob/main/docs/decisions.md).

Le fichier [CLAUDE.md](https://github.com/Dg-tech-dev/barometre-emploi-dev-ia/blob/main/CLAUDE.md)
résume ces règles pour l’agent : un lot à la fois, tests verts avant chaque commit,
commentaires et documentation en français.

La vérification a servi dès le premier lot. Le 3 octobre 2026, une sonde de 300 appels sur
l’API réelle de France Travail a corrigé trois hypothèses de la spécification :

- une recherche donne accès à 3 150 résultats, et non 1 150 ;
- la recherche par métiers ramène environ 2 900 offres, et non 15 000 à 30 000 ;
- découper la collecte par département perdait 3,4 % des offres, celles qui n’indiquent pas
  de département. La collecte se fait donc sur la France entière.

La spécification a été corrigée d’après ces mesures, et non l’inverse.

## Un lot, une pull request

Le plan de livraison découpe le projet en lots : socle, collecte, traitement, tableau de bord,
serveur, puis les lots de ce site. Chaque lot suit le même chemin :

1. Claude Code écrit le code et ses tests sur une branche dédiée.
2. Les tests automatisés, l’analyse statique et le contrôle des types passent, en local puis
   dans l’intégration continue de GitHub.
3. La description de la pull request liste ce qui a été vérifié : chiffres comparés, pages
   mesurées, cas limites.
4. Damien relit, pose ses questions, puis fusionne. Le lot suivant ne commence qu’après.

Au 21 novembre 2026, 13 pull requests avaient été fusionnées, le journal comptait plus de 60
décisions et le projet plus de 500 tests automatisés. Parmi eux, 93 cas de classement, des
intitulés d’offres avec le métier attendu pour chacun, doivent tous passer.

## Ce que Damien décide

L’agent propose, Damien tranche. Quelques décisions qui lui sont revenues :

- l’usage des offres France Travail au regard de leur licence de réutilisation, vérifié avant
  toute mise en production ;
- le déménagement de la collecte sur son serveur. L’offre Netlify de son compte, une formule
  ancienne, n’avait pas les fonctions longues prévues par la spécification ;
- l’ordre des lots, le nom du site et la publication du code ;
- les secrets : les clés d’API et les mots de passe sont saisis par lui seul, sur le serveur
  ou dans Netlify, jamais dans une conversation avec l’IA.

## L’exploitation au quotidien

La collecte et le traitement tournent chaque lundi matin sur un serveur loué en France.
Claude Code a écrit la procédure d’installation. Damien a fait les étapes qui demandent des
droits d’administration. Claude Code a ensuite vérifié l’installation en lecture seule, depuis
une session ouverte à distance sur le serveur.

Depuis le 7 octobre 2026, le run hebdomadaire part seul. Une alerte arrive sur le téléphone de
Damien en cas d’échec, et une sauvegarde chiffrée des données part chaque semaine hors du
serveur. Les garde-fous ne changent pas :

- aucune modification sur le serveur sans un accord écrit de Damien qui nomme l’action ;
- aucun secret dans le dépôt ni dans une conversation ;
- aucun jeton d’accès au compte Netlify sur le serveur : il n’envoie que des statistiques, à
  une adresse protégée par un secret ;
- un run ne déclenche jamais de déploiement du site.

## La revue mensuelle de la taxonomie

Le premier mardi de chaque mois, une tâche planifiée confie à Claude un export du mois
écoulé : les intitulés d’offres non classés les plus fréquents, les termes en hausse,
l’évolution de chaque métier. Claude vérifie les nouveaux intitulés par quelques recherches
sur le web. Il propose ensuite les changements justifiés dans une pull request, avec les
chiffres, des exemples d’intitulés et des cas de test, ou rien si rien n’est justifié.

Damien relit la proposition et décide de la fusionner. La nuit suivante, le serveur récupère
seul la nouvelle version et reclasse toutes les offres depuis le premier run. Chaque version
et son effet sur la part des offres classées sont publiés dans le
[journal de la taxonomie](/methodologie/journal/).

## Des incidents réels, et ce qu’ils ont changé

- **7 octobre 2026, des alertes refusées.** La première alerte de test a été rejetée par le
  service de notification. Le serveur partageait son bloc d’adresses IPv6 avec d’autres
  clients de l’hébergeur, et le quota de ce bloc était épuisé. Les jobs passent désormais par
  l’IPv4.
- **16 novembre 2026, une fausse chute.** La courbe des nouvelles offres finissait sur 5
  offres : le run du lundi ne voit que les premières heures de sa propre semaine. Cette
  semaine n’est plus dessinée tant qu’elle n’a pas été collectée.
- **21 novembre 2026, une estimation démentie par la mesure.** En construisant la page
  d’accueil, Claude Code a remarqué que la dernière semaine publiée gagne encore des offres les
  semaines suivantes, et en a estimé l’ampleur à au moins 13 à 45 %. La mesure faite ensuite
  sur le serveur l’a démentie : une semaine gagne en général moins de 2 % après sa
  publication, une seule a gagné 16 %. L’estimation oubliait les offres déjà vues par le run
  de leur propre semaine. Le texte de la méthodologie a été corrigé ; les calculs n’avaient
  pas à changer.

Chaque fois, le constat, la décision et la correction sont écrits dans le journal des
décisions et passent par une pull request.

## Là où l’IA n’a pas sa place

Le classement des offres par métier n’utilise pas de modèle de langage. Des règles écrites
dans la [taxonomie](https://github.com/Dg-tech-dev/barometre-emploi-dev-ia/blob/main/taxonomy.yaml)
sont appliquées à l’intitulé de chaque offre. Ce choix est délibéré :

- **reproductible** : le même intitulé donne toujours le même métier, d’une semaine à
  l’autre, ce qui rend les séries comparables ;
- **explicable** : on peut dire pourquoi une offre est rangée dans un métier, et corriger la
  règle fautive ;
- **testable** : chaque règle a ses cas de test ;
- **gratuit** : plusieurs milliers d’offres par semaine, sans coût par offre.

Un modèle de langage classerait sans doute plus d’offres. Mais ses réponses pourraient varier
d’un appel ou d’une version à l’autre, et une hausse sur une courbe pourrait alors venir du
modèle plutôt que du marché.

Les chiffres sont, eux aussi, calculés par du code. Quand un texte rédigé par un modèle citera
des chiffres, chacun sera confronté aux données par du code avant publication, avec un texte
de repli sans IA en cas d’écart.

## Ce qui arrive

**Un résumé de la semaine.** Après chaque run, Claude rédigera un texte court à partir des
statistiques. Chaque chiffre cité sera vérifié par du code, et le texte portera la mention de
son écriture par l’IA. Coût estimé : moins d’un dollar par mois.

## Pour aller plus loin

- [Le dépôt du projet sur GitHub](https://github.com/Dg-tech-dev/barometre-emploi-dev-ia)
- [La spécification](https://github.com/Dg-tech-dev/barometre-emploi-dev-ia/blob/main/SPEC.md) et
  [le journal des décisions](https://github.com/Dg-tech-dev/barometre-emploi-dev-ia/blob/main/docs/decisions.md)
- [La taxonomie](https://github.com/Dg-tech-dev/barometre-emploi-dev-ia/blob/main/taxonomy.yaml) et
  [son historique](https://github.com/Dg-tech-dev/barometre-emploi-dev-ia/blob/main/TAXONOMY_CHANGELOG.md)
- [Les règles de travail de l’agent](https://github.com/Dg-tech-dev/barometre-emploi-dev-ia/blob/main/CLAUDE.md)
- [La méthode des chiffres](/methodologie/)
