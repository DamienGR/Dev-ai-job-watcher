import { beforeAll, describe, expect, it } from 'vitest';
import { loadCompiledTaxonomy, type CompiledTaxonomy } from '../../src/core/taxonomy';
import { renderReviewMarkdown } from '../../src/functions/reviewMarkdown';
import { aggregateBase, toAggregateOffer } from '../../src/pipeline/aggregates/context';
import { emerging } from '../../src/pipeline/aggregates/indicators';
import { review, REVIEW_LIMITS, reviewMonths, techCandidateFinder, type OfferText, type Review } from '../../src/pipeline/aggregates/review';
import { makeOffer } from '../helpers';

// Export de revue mensuelle (SPEC.md §9.1, lot 6, D65).

let taxonomy: CompiledTaxonomy;
beforeAll(async () => {
  taxonomy = await loadCompiledTaxonomy();
});

describe('termes candidats des descriptions', () => {
  it('garde les termes techniques absents de la taxonomie, écarte le reste', () => {
    const find = techCandidateFinder(taxonomy.technologies);
    const text =
      'CONTEXTE : nous utilisons LangGraph, Langfuse, GPT-4o et Node.js sur AWS, avec PyTorch, DuckDB, Neo4j. ' +
      'CDI, RTT, Bac+5, 35h, www.exemple.fr. DÉVELOPPEUR Python confirmé, Postgres, Kubernetes.';
    const found = find(text);
    expect(found.sort()).toEqual(['DuckDB', 'Neo4j']);
    // Couverts par la taxonomie (LangGraph, GPT-4o, Node.js, AWS, PyTorch), bruit, ou mot à
    // seule majuscule initiale (Langfuse, Postgres : non vus par l'heuristique).
    for (const term of ['LangGraph', 'GPT-4o', 'Node.js', 'AWS', 'PyTorch', 'CONTEXTE', 'CDI', 'RTT', 'Bac+5', 'www.exemple.fr', 'VELOPPEUR', 'Langfuse']) {
      expect(found).not.toContain(term);
    }
  });
});

describe('revue d’un mois', () => {
  it('liste les non classés du filet ROME, les tendances, les candidats et les confusions', () => {
    const offers = [
      ...Array.from({ length: 6 }, (_, i) =>
        makeOffer({
          sourceId: `U${i}`,
          title: i % 2 ? 'Ingénieur d’étude informatique (H/F)' : 'Ingénieur d’étude informatique',
          titleNorm: 'ingenieur d etude informatique',
          role: 'non_classe',
          group: 'non_classe',
          romeCode: i < 4 ? 'M1818' : 'M1805',
          createdAt: '2026-11-05T09:00:00.000Z',
        }),
      ),
      // Hors filet ROME : non listé parmi les non classés.
      makeOffer({ sourceId: 'K1', collectedVia: ['keyword'], titleNorm: 'coach pnl', role: 'non_classe', group: 'non_classe', createdAt: '2026-11-06T09:00:00.000Z' }),
      ...Array.from({ length: 5 }, (_, i) =>
        makeOffer({ sourceId: `D${i}`, role: 'dev_backend', secondaryRoles: ['tech_lead_architecte'], createdAt: '2026-11-10T09:00:00.000Z' }),
      ),
      // Autre mois : hors revue.
      makeOffer({ sourceId: 'O1', role: 'non_classe', group: 'non_classe', titleNorm: 'vieux', createdAt: '2026-10-01T09:00:00.000Z' }),
    ];
    const texts = new Map<string, OfferText>(
      offers.map((o) => [o.uid, { title: o.title, description: o.sourceId.startsWith('D') ? 'Entrepôt ClickHouse, requêtes DuckDB, agents LangGraph.' : o.description }]),
    );
    const base = aggregateBase(offers.map(toAggregateOffer), taxonomy, '2026-W47');
    const r = review({ base, emerging: emerging(base), texts, month: '2026-11', partial: true, generatedAt: '2026-11-23T06:00:00.000Z' });

    expect(r).toMatchObject({ month: '2026-11', lastRun: '2026-W47', partial: true, taxonomy: { version: taxonomy.version } });
    expect(r.totals).toEqual({ offers: 12, classified: 5, romeNet: 11, unclassifiedRome: 6 });
    expect(r.unclassified).toEqual([
      {
        title: 'ingenieur d etude informatique',
        n: 6,
        examples: ['Ingénieur d’étude informatique', 'Ingénieur d’étude informatique (H/F)'],
        rome: { M1818: 4, M1805: 2 },
      },
    ]);
    expect(r.roles).toContainEqual({ role: 'dev_backend', group: 'g1_dev', n: 5, prevMean: 0, status: 'seuil' });
    expect(r.techCandidates).toEqual([{ term: 'ClickHouse', n: 5 }, { term: 'DuckDB', n: 5 }]);
    expect(r.confusions).toEqual([{ role: 'dev_backend', secondary: 'tech_lead_architecte', n: 5 }]);
  });

  it('prépare le mois du dernier run et le précédent', () => {
    expect(reviewMonths('2026-W48')).toEqual(['2026-10', '2026-11']);
    // Semaine à cheval : le mois de son jeudi (3 décembre).
    expect(reviewMonths('2026-W49')).toEqual(['2026-11', '2026-12']);
    expect(reviewMonths('2027-W01')).toEqual(['2026-12', '2027-01']);
  });
});

describe('export Markdown', () => {
  it('reste sous 50 Ko avec toutes les listes pleines', () => {
    const long = 'x'.repeat(REVIEW_LIMITS.exampleLength);
    const full: Review = {
      month: '2026-11',
      generatedAt: '2026-11-30T06:00:00.000Z',
      lastRun: '2026-W49',
      partial: false,
      taxonomy: { version: 3, updated: '2026-10-03' },
      totals: { offers: 3000, classified: 1800, romeNet: 2500, unclassifiedRome: 900 },
      unclassified: Array.from({ length: REVIEW_LIMITS.unclassified }, (_, i) => ({
        title: `intitule non classe numero ${i} assez long pour peser`,
        n: 100 - i,
        examples: [long, long, long],
        rome: { M1805: 10, M1811: 5, M1806: 2 },
      })),
      emergingTerms: Array.from({ length: REVIEW_LIMITS.emergingTerms }, (_, i) => ({ ngram: `terme emergent ${i}`, n: 50, prevMean: 3.33 })),
      roles: Array.from({ length: 60 }, (_, i) => ({ role: `role_${i}`, group: 'g1_dev', n: 40, prevMean: 38.67, status: 'stable' })),
      techCandidates: Array.from({ length: REVIEW_LIMITS.techCandidates }, (_, i) => ({ term: `Tech${i}.js`, n: 12 })),
      confusions: Array.from({ length: REVIEW_LIMITS.confusions }, (_, i) => ({ role: `role_${i}`, secondary: `role_${i + 1}`, n: 9 })),
    };
    const md = renderReviewMarkdown(full);
    expect(Buffer.byteLength(md, 'utf8')).toBeLessThan(50 * 1024);
    expect(md).toContain('# Revue de la taxonomie — 2026-11');
    expect(md).toContain('| 100 | intitule non classe numero 0 assez long pour peser |');
  });

  it('échappe les barres verticales et signale un mois partiel ou des listes vides', () => {
    const md = renderReviewMarkdown({
      month: '2026-12',
      generatedAt: '2026-12-07T06:00:00.000Z',
      lastRun: '2026-W50',
      partial: true,
      taxonomy: { version: 4, updated: '2026-12-01' },
      totals: { offers: 10, classified: 4, romeNet: 8, unclassifiedRome: 4 },
      unclassified: [{ title: 'dev | ops', n: 4, examples: ['Dev | Ops (H/F)'], rome: {} }],
      emergingTerms: [],
      roles: [{ role: 'dev_backend', group: 'g1_dev', n: 2, prevMean: null, status: null }],
      techCandidates: [],
      confusions: [],
    });
    expect(md).toContain('Mois partiel');
    expect(md).toContain('| 4 | dev \\| ops | Dev \\| Ops (H/F) | — |');
    expect(md).toContain('| dev_backend | g1_dev | 2 | — | premier mois |');
    expect(md).toContain('_aucun terme en forte hausse_');
  });
});
