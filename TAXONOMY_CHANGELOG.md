# Journal des changements de la taxonomie

Toute modification de [`taxonomy.yaml`](taxonomy.yaml) incrémente `version`, met à jour
`updated` et ajoute ici une entrée, de la plus récente à la plus ancienne (SPEC.md §0, §9.2) :

- titre `## v<N> — <AAAA-MM-JJ>`, avec la même date que `updated` (vérifié par `npm test`) ;
- chaque changement et sa justification chiffrée : n observé, exemples d'intitulés, source
  externe pour un nouveau rôle ;
- les cas ajoutés dans `tests/fixtures/titles.json` pour chaque motif ajouté ou modifié.

Un `id` n'est jamais supprimé ni renommé : un rôle abandonné passe en `status: deprecated`.

## v3 — 2026-10-03

Correction du filet de collecte France Travail (`rome_codes`) : la liste des codes M18 du
ROME 4.0, marquée « À VÉRIFIER » (SPEC.md §15.3), a été relevée sur l'API réelle par la sonde
du lot 1. Aucun motif modifié, aucun id ajouté, supprimé ou renommé.

**M1818 ajouté à `core`.** « Ingénieur / Ingénieure d'étude informatique » : 186 offres
actives au 2026-10-03. Appellations les plus fréquentes sur 150 offres : ingénieur logiciel
(36), architecte logiciel (34), ingénieur d'étude et développement informatique (22),
ingénieur d'étude logiciel informatique (17). C'est un code de développement au même titre
que M1805, absent de la v2 parce que la liste avait été établie avant la vérification. Avec la
v2, ces offres n'étaient collectées que si un mot-clé de la passe B les rattrapait.

Contrôle de classification sur les intitulés types, avec les motifs actuels : « Ingénieur
logiciel », « Ingénieur études et développement Java » et « Ingénieur d'étude et développement
informatique » → `software_engineer` ; « Architecte logiciel » → `tech_lead_architecte`. Les
intitulés génériques « Ingénieur d'étude informatique » et « Ingénieur d'étude logiciel
informatique » restent `non_classe` : à examiner à la première revue mensuelle sur données
réelles, pas corrigé ici.

**Codes M18 relevés et non retenus** (offres actives au 2026-10-03) : M1804 télécoms (65),
M1807 systèmes de communication, surtout défense (127), M1808 cartographe (35), M1809
météorologue (11), M1812 RSSI (90), M1813 intégrateur logiciels métiers / ERP (173), M1814
Scrum Master (114), M1815 test et validation logiciel (33), M1816 technicien réseaux et
télécoms (183), M1817 administrateur sécurité informatique (8), M1819 technicien en
cybersécurité (17), M1820 méthodes et qualité informatique (23). M1813, M1814 et M1815 sont
dans le périmètre informatique : à réexaminer à la revue mensuelle, chiffres de classification
à l'appui.

Pas de cas ajouté dans `tests/fixtures/titles.json` : aucun motif n'a changé. Le test du plan
de collecte (`tests/francetravail/partitions.test.ts`) vérifie la nouvelle liste de codes.

## v2 — 2026-10-02

Correction de deux défauts relevés au lot 0. Aucune offre n'est encore collectée : chaque
changement est justifié par des cas reproduits, ajoutés aux tests, qui échouaient tous en v1.
Aucun id ajouté, supprimé ou renommé.

**Formes féminines des intitulés.** La normalisation (SPEC.md §6.4) retire l'écriture
inclusive (`·e`, `(e)`, `·se` après `eur`…) mais ne ramène pas les formes féminines pleines au
masculin. En v1, « Développeuse Python », « Ingénieure IA », « Cheffe de projet IA »,
« Programmeuse », « Auditrice sécurité » ou « Technicien·ne réseaux » sortaient `non_classe`.
En passe B, ces offres auraient en plus été écartées par la règle de rétention (§4.1).

- Formes féminines ajoutées à tous les motifs qui ne portaient que le masculin :
  `developpeu(r|se)`, `programmeu(r|se)`, `ingenieure?`, `concept(eur|rice)`, `chef(·?fe)?`,
  `(directeur|directrice) de projets?`, `avocate?`, `doctorante?`, `chercheuse`,
  `ethicien(·?ne)?`, `technicien(·?ne)?`, `automaticien(·?ne)?`, `consultante?`, `experte?`,
  `audit(eur|rice)`, `pentest(eur|euse|er)?`, `commerciale?`.
- Rôles concernés : `commercial_tech`, `prompt_engineer`, `juriste_ia`, `ai_compliance`,
  `chef_projet_ia`, `agentic_engineer`, `research_ai`, `ml_engineer`, `ingenieur_ia`,
  `data_engineer`, `devops_sre_cloud`, `cybersecurite`, `admin_sys_reseau`, `support_it`,
  `tech_lead_architecte`, `qa_test`, `software_engineer`, `dev_web`, `dev_generic` ; même
  correction pour la technologie `go`.
- `commercial_tech` : orthographe française de « business développeur / développeuse /
  développement » (`develop(p?(eur|euse|ement)|er|ment)`). Sans cela, la correction aurait
  classé « Business Développeuse » en `dev_generic`, comme l'était déjà « Business
  Développeur » en v1.
- Convention d'écriture ajoutée en tête de `taxonomy.yaml`.
- Tests : 28 intitulés dans `tests/fixtures/titles.json` (source « taxonomie v2 — formes
  féminines ») et « Développeuse Go » pour la technologie `go`.

**Signal télétravail.** L'ordre d'évaluation `full_remote` > `hybrid` > `on_site` (SPEC.md
§6.6) faisait l'emporter des formes niées, et le motif `\bteletravail\b.*\b\d ?(j|jours?)\b`
couvrait toute la description, que la normalisation met sur une ligne. En v1 : « Pas de
télétravail. Formation de 3 jours » et « Télétravail : non. […] 5 jours de RTT » donnaient
`hybrid`, « Pas de full remote, mais 2 jours de télétravail » donnait `full_remote`,
« Présence 5 jours sur site » donnait `hybrid`.

- `full_remote` et `hybrid` : formes niées exclues (« pas de », « pas en », « sans »,
  « aucun » devant le motif) ; « télétravail … N jours » limité à la phrase et à 50 caractères ;
  « N jours sur site » limité à 1 à 4 jours.
- `on_site` : « pas de / pas en / sans / aucun télétravail », « télétravail : non »,
  « télétravail non possible / non autorisé / impossible », « 5 jours (ou 5j/5) sur site »
  sauf « par mois ».
- Tests : 11 cas dans `tests/signals.test.ts`, dont 2 de non-régression.

Impact attendu : moins d'offres non classées dans g1, g2, g3, g6, g7 et g9, et un mode de
télétravail plus juste. Sans données collectées, aucun reclassement n'est nécessaire.

## v1 — 2026-10-02

Taxonomie initiale, validée avec la spec de cadrage : 9 groupes, 51 rôles, 118 technologies,
signaux `genai`, `ai_any`, `remote`, `tjm` et `travel`, 5 types d'employeurs. Motifs testés sur
les cas de l'annexe B de SPEC.md, repris dans `tests/fixtures/titles.json`.
