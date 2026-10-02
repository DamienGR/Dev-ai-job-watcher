# Journal des changements de la taxonomie

Toute modification de [`taxonomy.yaml`](taxonomy.yaml) incrémente `version`, met à jour
`updated` et ajoute ici une entrée, de la plus récente à la plus ancienne (SPEC.md §0, §9.2) :

- titre `## v<N> — <AAAA-MM-JJ>`, avec la même date que `updated` (vérifié par `npm test`) ;
- chaque changement et sa justification chiffrée : n observé, exemples d'intitulés, source
  externe pour un nouveau rôle ;
- les cas ajoutés dans `tests/fixtures/titles.json` pour chaque motif ajouté ou modifié.

Un `id` n'est jamais supprimé ni renommé : un rôle abandonné passe en `status: deprecated`.

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
