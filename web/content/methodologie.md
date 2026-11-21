# Méthodologie

Le baromètre compte chaque semaine les offres d’emploi publiées sur France Travail pour les
métiers du développement, de la data et de l’intelligence artificielle, en France. Cette page
décrit d’où viennent les chiffres, comment les offres sont rangées par métier, et ce que ces
chiffres ne disent pas.

## En bref

- **Source** : l’API « Offres d’emploi » de France Travail, seule source à ce jour.
- **Collecte** : chaque lundi matin, toutes les offres encore ouvertes des métiers visés.
- **Classement** : par l’intitulé de l’offre, avec des règles écrites, sans IA.
- **Publication** : des statistiques agrégées seulement, jamais d’annonce.

## Source et licence

Les offres viennent de l’API « Offres d’emploi v2 » de [France Travail](https://francetravail.io).
Elle donne les offres déposées auprès de France Travail, ainsi que des offres relayées depuis
des sites partenaires. Leur usage pour des statistiques agrégées a été vérifié au regard de la
licence de réutilisation, et la source est citée sur chaque page.

Beaucoup d’offres du secteur ne sont publiées que sur les sites carrières des entreprises ou
sur des sites spécialisés. Le baromètre mesure donc ce que France Travail voit du marché : les
tendances et les comparaisons entre métiers y sont plus parlantes que les volumes bruts.

## Collecte

Chaque lundi matin, un serveur situé en France interroge l’API. Si la collecte reste
incomplète, elle est relancée une heure puis deux heures plus tard. Elle fait deux
recherches :

1. **Par métier** : tout le stock d’offres ouvertes de 8 codes métiers de l’informatique du
   répertoire ROME de France Travail, sur la France entière. Il n’y a pas de filtre de date :
   on voit ainsi les offres arriver, puis disparaître.
2. **Par mots-clés** : 75 mots-clés des métiers de l’IA, souvent mal rangés dans le ROME
   (« AI engineer », « MLOps », « Forward Deployed Engineer »…). Une offre trouvée seulement
   par cette recherche n’est gardée que si son intitulé la range dans un métier de l’IA. Cela
   écarte les offres d’autres secteurs qui citent simplement l’IA.

Les offres trouvées par les deux recherches sont comptées une fois, et les offres situées à
l’étranger sont écartées. Les contacts des recruteurs (noms, adresses e-mail, téléphones) sont
supprimés dès la réception, avant toute écriture.

France Travail ne donne que les offres encore ouvertes : l’historique commence au premier run,
la semaine du 5 octobre 2026. Les semaines précédentes sont reconstituées à partir des seules
offres encore ouvertes ce jour-là. Elles sont incomplètes et hachurées sur les courbes.

## Classement par métier

La [taxonomie](https://github.com/Dg-tech-dev/barometre-emploi-dev-ia/blob/main/taxonomy.yaml)
décrit 51 métiers répartis en 9 groupes (version 3 au 21 novembre 2026) :

- le développement logiciel et web, et la data ;
- six groupes pour l’IA : IA et machine learning « classiques », IA générative et agentique,
  déploiement de l’IA chez les clients, pilotage et transformation, gouvernance et conformité,
  et des métiers « témoins » dont on suit le déclin ;
- un périmètre élargi (infrastructure, cybersécurité, support, commerce), classé mais masqué
  par défaut dans le tableau de bord.

Chaque intitulé est d’abord normalisé : accents, ligatures, mentions « H/F » et écriture
inclusive sont retirés, pour que « Développeur·se Python (H/F) » et « developpeur python » se
lisent de la même façon. Il est ensuite comparé aux motifs de chaque métier, qui peuvent aussi
exclure des termes. Quand plusieurs métiers correspondent, celui de plus haute priorité,
en général le plus spécifique, l’emporte, et les autres sont gardés comme métiers secondaires. Quelques intitulés génériques sont précisés par
la description : un « Ingénieur IA » dont l’offre cite les LLM ou le RAG rejoint ainsi l’IA
générative.

Une offre qu’aucun motif ne reconnaît est « non classée ». Elle reste comptée dans le total
des offres, mais dans aucun métier. La description de l’offre sert aussi à repérer les
technologies citées (118 dans la taxonomie), la mention de l’IA, le télétravail et les
déplacements.

La taxonomie évolue par versions, proposées par une revue mensuelle. Le
[journal de la taxonomie](/methodologie/journal/) décrit chacune, avec son effet sur la part
des offres classées. Une nouvelle version est appliquée à tout l’historique la nuit qui suit
sa fusion, pour que les séries restent comparables, et marquée d’un trait vertical sur les
courbes.

## Indicateurs

- **Nouvelles offres** : offres distinctes, comptées dans leur semaine de création, à la date
  donnée par France Travail, et non dans la semaine où elles ont été collectées.
- **Stock** : offres ouvertes au moment de chaque run.
- **Part IA** : offres des six groupes de l’IA, rapportées à l’ensemble développement, data et
  IA.
- **Salaires** : seulement les salaires annoncés dans l’offre, ramenés en brut annuel
  (mensuel × nombre de mois, horaire × 1 607 heures) et gardés entre 18 000 et 250 000 €. Le
  tableau de bord en donne la médiane et les quartiles. La prime IA est l’écart entre la
  médiane des offres de l’IA et celle des offres de développement.
- **Technologies** : part des offres qui citent chaque technologie dans leur description.

## Règles d’affichage

- Le nombre d’offres derrière une valeur est indiqué (n). Une part, une médiane ou une
  variation calculée sur moins de 5 offres est masquée et remplacée par « n < 5 ».
- Les semaines et les mois incomplets sont hachurés.
- La semaine en cours n’apparaît sur les courbes qu’une fois collectée, au run suivant.
- Aucune annonce ni aucun extrait d’annonce n’est publié. Sur la carte, les coordonnées sont
  arrondies au centième de degré, environ un kilomètre, et les points ne portent aucun texte.

## Limites connues

- **Une seule source.** Les volumes ne représentent pas tout le marché (voir plus haut).
- **La dernière semaine peut encore bouger.** Quelques offres n’apparaissent dans l’API
  qu’une ou deux semaines après leur date de création. Mesuré sur les semaines d’octobre et de
  novembre 2026, le nombre d’offres d’une semaine augmente en général de moins de 2 % après
  sa première publication. Une seule exception à ce jour : la semaine du 2 novembre a gagné
  16 % d’offres d’un coup, une semaine après sa publication.
- **Un classement par l’intitulé.** Un intitulé vague (« Consultant », « Chef de projet ») ne
  trouve pas toujours son métier. La part des offres classées est donnée plus bas, run par run.
- **Des salaires rares.** Seule une minorité d’offres annonce un salaire exploitable, et ces
  offres ne sont pas forcément représentatives des autres.
- **Une localisation inégale.** La région est connue pour la quasi-totalité des offres, mais
  les coordonnées précises n’existent que pour une minorité : la carte n’en montre qu’une
  partie.
- **Un historique court.** Il commence en octobre 2026 : une tendance sur quelques semaines
  reste fragile.

## Qualité des derniers runs

Ces chiffres sont lus en direct dans les statistiques publiées, comme ceux du tableau de bord.

<div class="quality" data-quality><p class="note">Chargement des derniers runs…</p></div>

## Le code et les règles

- [La taxonomie](https://github.com/Dg-tech-dev/barometre-emploi-dev-ia/blob/main/taxonomy.yaml) et
  [son historique](https://github.com/Dg-tech-dev/barometre-emploi-dev-ia/blob/main/TAXONOMY_CHANGELOG.md)
- [La normalisation des intitulés](https://github.com/Dg-tech-dev/barometre-emploi-dev-ia/blob/main/src/core/normalize.ts)
  et [le classement](https://github.com/Dg-tech-dev/barometre-emploi-dev-ia/blob/main/src/core/classify.ts)
- [Les cas de test du classement](https://github.com/Dg-tech-dev/barometre-emploi-dev-ia/blob/main/tests/fixtures/titles.json)
- [La spécification](https://github.com/Dg-tech-dev/barometre-emploi-dev-ia/blob/main/SPEC.md),
  sections 4 à 8, et [le journal des décisions](https://github.com/Dg-tech-dev/barometre-emploi-dev-ia/blob/main/docs/decisions.md)
- [L’IA dans ce projet](/ia/)
