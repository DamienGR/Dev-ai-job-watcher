import type { Review } from '../pipeline/aggregates/review';

// Mise en forme Markdown de l'export de revue mensuelle (SPEC.md §9.1) : compacte (< 50 Ko),
// destinée à la tâche planifiée Claude. Les identifiants de rôles et de groupes sont ceux de
// taxonomy.yaml.

/** Cellule de tableau Markdown : une seule ligne, barres verticales échappées. */
function cell(value: string | number | null): string {
  if (value === null) return '—';
  return String(value).replace(/\s+/g, ' ').replace(/\|/g, '\\|').trim();
}

function table(headers: string[], rows: (string | number | null)[][], empty: string): string {
  if (rows.length === 0) return `_${empty}_`;
  return [
    `| ${headers.join(' | ')} |`,
    `| ${headers.map(() => '---').join(' | ')} |`,
    ...rows.map((row) => `| ${row.map(cell).join(' | ')} |`),
  ].join('\n');
}

const pct = (part: number, total: number) => (total > 0 ? `${String(Math.round((part / total) * 1000) / 10).replace('.', ',')} %` : '—');

const ROLE_STATUS: Record<string, string> = {
  seuil: 'seuil franchi (≥ 5 offres)',
  baisse: 'baisse de moitié',
  stable: 'stable',
};

export function renderReviewMarkdown(review: Review): string {
  const t = review.totals;
  const lines = [
    `# Revue de la taxonomie — ${review.month}`,
    '',
    `Taxonomie v${review.taxonomy.version} (${review.taxonomy.updated}) · dernier run ${review.lastRun} · généré le ${review.generatedAt.slice(0, 10)}.`,
    review.partial
      ? 'Mois partiel : en cours, ou reconstitué avant le premier run à partir des seules offres encore ouvertes. Les volumes sont incomplets.'
      : 'Mois complet.',
    '',
    `Offres créées dans le mois : ${t.offers}, dont ${t.classified} classées (${pct(t.classified, t.offers)}). ` +
      `Filet ROME (passe A) : ${t.romeNet} offres, dont ${t.unclassifiedRome} non classées (${pct(t.unclassifiedRome, t.romeNet)}).`,
    '',
    `## Non classés du filet ROME (${review.unclassified.length} intitulés normalisés les plus fréquents)`,
    '',
    table(
      ['n', 'Intitulé normalisé', 'Exemples d’intitulés bruts', 'Codes ROME'],
      review.unclassified.map((u) => [
        u.n,
        u.title,
        u.examples.join(' ; '),
        Object.entries(u.rome)
          .map(([code, n]) => `${code} (${n})`)
          .join(', ') || null,
      ]),
      'aucun intitulé non classé',
    ),
    '',
    '## Termes émergents',
    '',
    'N-grammes (1 à 3 mots) d’intitulés normalisés : n du mois ≥ 10 et ≥ 2 × la moyenne des 3 mois précédents couverts par les données.',
    '',
    table(
      ['n', 'Terme', 'Moyenne des mois précédents'],
      review.emergingTerms.map((e) => [e.n, e.ngram, e.prevMean]),
      'aucun terme en forte hausse',
    ),
    '',
    '## Tendances par rôle',
    '',
    table(
      ['Rôle', 'Groupe', 'n', 'Moyenne des mois précédents', 'Statut'],
      review.roles.map((r) => [r.role, r.group, r.n, r.prevMean, r.status ? (ROLE_STATUS[r.status] ?? r.status) : 'premier mois']),
      'aucun rôle classé ce mois-ci',
    ),
    '',
    '## Technologies candidates',
    '',
    'Termes des descriptions (chiffre, point intérieur ou majuscule après la première lettre) absents des technologies de la taxonomie, avec le nombre d’offres qui les citent. Heuristique : à trier.',
    '',
    table(
      ['n', 'Terme'],
      review.techCandidates.map((c) => [c.n, c.term]),
      'aucun terme candidat',
    ),
    '',
    '## Confusions entre rôles',
    '',
    'Paires (rôle principal, rôle secondaire) les plus fréquentes : un motif trop large y apparaît souvent.',
    '',
    table(
      ['n', 'Rôle principal', 'Rôle secondaire'],
      review.confusions.map((c) => [c.n, c.role, c.secondary]),
      'aucune offre avec un rôle secondaire',
    ),
    '',
  ];
  return lines.join('\n');
}
