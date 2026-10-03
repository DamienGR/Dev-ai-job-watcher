import { beforeAll, describe, expect, it } from 'vitest';
import { loadCompiledTaxonomy, type CompiledTaxonomy } from '../../src/core/taxonomy';
import { computeAggregates, StockCounter, toAggregateOffer } from '../../src/pipeline/aggregates';
import { aggregateBase, addMonths, monthOfWeek } from '../../src/pipeline/aggregates/context';
import {
  density,
  emerging,
  employers,
  geoPoints,
  geoRegions,
  salaries,
  timeseries,
  titleNgrams,
  titles,
} from '../../src/pipeline/aggregates/indicators';
import { partialMonths, partialWeeks } from '../../src/pipeline/aggregates/meta';
import type { Table } from '../../src/pipeline/aggregates/table';
import type { ProcessRecord } from '../../src/pipeline/processRecord';
import { declared, makeOffer } from '../helpers';

let taxonomy: CompiledTaxonomy;
beforeAll(async () => {
  taxonomy = await loadCompiledTaxonomy();
});

const base = (offers: ReturnType<typeof makeOffer>[], lastRun = '2026-W40') =>
  aggregateBase(offers.map(toAggregateOffer), taxonomy, lastRun);

/** Lignes d'une table sous forme d'objets, pour des assertions lisibles. */
const records = (table: Table) => table.rows.map((row) => Object.fromEntries(table.columns.map((c, i) => [c, row[i]])));

function processRecord(runId: string, overrides: Partial<ProcessRecord> = {}): ProcessRecord {
  return {
    runId,
    step: 'process',
    status: 'complete',
    startedAt: '2026-10-05T07:00:00.000Z',
    finishedAt: '2026-10-05T07:01:00.000Z',
    durationMs: 60_000,
    taxonomyVersion: 3,
    collect: { status: 'complete', partitions: 1, truncatedPartitions: 0, failedPartitions: 0, apiCalls: 10, retries: 0, errors: 0, durationMs: 1000 },
    coverageComplete: true,
    counters: {
      read: 0, collectedA: 0, collectedB: 0, distinct: 0, invalid: 0, abroad: 0, droppedRetention: 0, retained: 0,
      newOffers: 0, closed: 0, reopened: 0, classified: 0, salaryDeclared: 0, salaryOutOfBounds: 0, salaryPredicted: 0,
      tjm: 0, noCoordinates: 0, noRegion: 0, duplicates: 0,
    },
    abroadLabels: {},
    error: null,
    ...overrides,
  };
}

describe('périodes', () => {
  it('décale les mois et rattache une semaine au mois de son jeudi', () => {
    expect([addMonths('2026-10', -11), addMonths('2026-01', -1), addMonths('2026-12', 1)]).toEqual(['2025-11', '2025-12', '2027-01']);
    expect([monthOfWeek('2026-W40'), monthOfWeek('2026-W01'), monthOfWeek('2026-W53')]).toEqual(['2026-10', '2026-01', '2026-12']);
  });
});

describe('nouvelles offres et stock (indicateurs 1, 2, 4)', () => {
  it('compte chaque offre dans sa semaine de création, hors doublons inter-sources', () => {
    const offers = [
      makeOffer({ sourceId: 'A', createdAt: '2026-09-28T07:00:00.000Z' }),
      makeOffer({ sourceId: 'B', createdAt: '2026-09-29T07:00:00.000Z' }),
      makeOffer({ sourceId: 'C', createdAt: '2026-09-27T21:30:00.000Z' }), // dimanche 23h30 à Paris : W39
      makeOffer({ sourceId: 'D', role: 'ai_engineer', group: 'g4_genai_agentique', signals: { aiAny: true, genai: true, travel: false } }),
      makeOffer({ sourceId: 'E', dedup: { key: 'k', duplicateOf: 'francetravail:A' } }),
    ];
    const stock = new StockCounter();
    for (const o of offers) stock.add('2026-W40', toAggregateOffer(o));
    const { newOffers, stock: stockTable } = timeseries(base(offers), stock.toTable());
    expect(newOffers.columns).toEqual(['week', 'role', 'region', 'source', 'contract', 'aiAny', 'n']);
    expect(newOffers.rows).toEqual([
      ['2026-W39', 'dev_backend', '76', 'francetravail', 'cdi', false, 1],
      ['2026-W40', 'ai_engineer', '76', 'francetravail', 'cdi', true, 1],
      ['2026-W40', 'dev_backend', '76', 'francetravail', 'cdi', false, 2],
    ]);
    expect(stockTable.rows).toEqual([
      ['2026-W40', 'ai_engineer', '76', 'cdi', true, 1],
      ['2026-W40', 'dev_backend', '76', 'cdi', false, 4],
    ]);
  });
});

describe('salaires et TJM (indicateurs 7, 8)', () => {
  const devs = [30_000, 35_000, 40_000, 45_000, 50_000].map((mid, i) =>
    makeOffer({ sourceId: `D${i}`, salary: declared(mid), experience: '1_3' }),
  );
  const ais = [40_000, 45_000, 50_000, 55_000, 60_000].map((mid, i) =>
    makeOffer({ sourceId: `I${i}`, role: 'ai_engineer', group: 'g4_genai_agentique', salary: declared(mid), experience: '1_3' }),
  );
  const extras = [
    makeOffer({ sourceId: 'N1' }), // sans salaire : compte dans n, pas dans nSalary
    makeOffer({ sourceId: 'P1', salary: { minAnnual: 99_000, maxAnnual: 99_000, midAnnual: 99_000, source: 'predicted', raw: null } }),
    makeOffer({ sourceId: 'T1', group: 'g1_dev', tjm: { min: 500, max: 600 } }),
  ];

  it('calcule n, taux de renseignement et quartiles, salaires prédits exclus', () => {
    const { salaries: table } = salaries(base([...devs, ...ais, ...extras]));
    const rows = records(table);
    expect(rows.find((r) => r.month === '2026-09' && r.group === 'g1_dev' && r.role === '*' && r.experience === '*' && r.region === '*')).toEqual({
      month: '2026-09', group: 'g1_dev', role: '*', experience: '*', region: '*', n: 8, nSalary: 5, p25: 35_000, p50: 40_000, p75: 45_000,
    });
    expect(rows.find((r) => r.month === '*' && r.group === '*' && r.role === '*' && r.experience === '*' && r.region === '*')).toMatchObject({
      n: 13, nSalary: 10, p50: 45_000,
    });
    // Cellules de moins de 5 offres omises (« n < 5 » au dashboard).
    expect(rows.every((r) => (r.n as number) >= 5)).toBe(true);
    expect(rows.some((r) => r.experience === 'unknown')).toBe(false);
  });

  it('calcule la prime IA à expérience égale et le TJM', () => {
    const { aiPremium, tjm } = salaries(base([...devs, ...ais, ...extras]));
    expect(records(aiPremium).find((r) => r.month === '2026-09' && r.experience === '1_3')).toEqual({
      month: '2026-09', experience: '1_3', nAi: 5, p50Ai: 50_000, nDev: 5, p50Dev: 40_000, premium: 10_000,
    });
    expect(records(tjm).find((r) => r.month === '*' && r.group === '*')).toEqual({
      month: '*', group: '*', n: 1, p25: null, p50: null, p75: null,
    });
  });
});

describe('intitulés, employeurs, carte, émergence (indicateurs 5, 10, 11, 12)', () => {
  it('garde le top des intitulés par mois et rôle', () => {
    const offers = [
      ...Array.from({ length: 3 }, (_, i) => makeOffer({ sourceId: `J${i}`, titleNorm: 'developpeur java', secondaryRoles: ['dev_fullstack'] })),
      makeOffer({ sourceId: 'K', titleNorm: 'developpeur kotlin' }),
    ];
    const { titles: table, secondaryRoles } = titles(base(offers));
    expect(table.rows).toEqual([
      ['2026-09', 'dev_backend', 'developpeur java', 3],
      ['2026-09', 'dev_backend', 'developpeur kotlin', 1],
    ]);
    expect(secondaryRoles.rows).toEqual([['2026-09', 'dev_backend', 'dev_fullstack', 3]]);
  });

  it('repère les nouveaux recruteurs IA par leur premier poste IA', () => {
    const ai = { role: 'ai_engineer', group: 'g4_genai_agentique' };
    const offers = [
      makeOffer({ sourceId: 'A1', ...ai, company: 'Alpha SAS', companyNorm: 'alpha', createdAt: '2026-08-10T10:00:00.000Z' }),
      makeOffer({ sourceId: 'A2', ...ai, company: 'ALPHA', companyNorm: 'alpha', createdAt: '2026-09-10T10:00:00.000Z' }),
      makeOffer({ sourceId: 'A3', ...ai, company: 'ALPHA', companyNorm: 'alpha', createdAt: '2026-09-11T10:00:00.000Z' }),
      makeOffer({ sourceId: 'B1', company: 'Beta', companyNorm: 'beta', createdAt: '2026-08-10T10:00:00.000Z' }),
      makeOffer({ sourceId: 'B2', ...ai, company: 'Beta', companyNorm: 'beta', createdAt: '2026-09-15T10:00:00.000Z' }),
    ];
    const { newAiRecruiters, top } = employers(base(offers));
    expect(newAiRecruiters.rows).toEqual([
      ['2026-08', 'alpha', 'ALPHA', 'g4_genai_agentique', 1],
      ['2026-09', 'beta', 'Beta', 'g4_genai_agentique', 1],
    ]);
    expect(records(top).find((r) => r.month === '*' && r.group === 'g4_genai_agentique' && r.company === 'alpha')).toMatchObject({ n: 3 });
  });

  it('calcule volume, part IA et densité régionale, et les points récents arrondis', () => {
    const offers = [
      makeOffer({ sourceId: 'A' }),
      makeOffer({ sourceId: 'B', role: 'ai_engineer', group: 'g4_genai_agentique' }),
      makeOffer({ sourceId: 'C', role: 'support_it', group: 'g9_elargi' }),
      makeOffer({ sourceId: 'D', location: { label: 'France', communeInsee: null, departement: null, region: null, lat: null, lng: null, precision: 'pays' } }),
      makeOffer({ sourceId: 'E', createdAt: '2026-01-05T10:00:00.000Z' }), // hors des 12 dernières semaines
    ];
    const rows = records(geoRegions(base(offers)));
    expect(rows.find((r) => r.month === '2026-09' && r.region === '76')).toEqual({
      month: '2026-09', region: '76', n: 3, nCore: 2, nAi: 1, density: density(2, '76'),
    });
    expect(density(2_761_057, '76')).toBe(100_000);
    expect(density(10, '06')).toBeNull();
    expect(geoPoints(base(offers)).rows).toEqual([
      [43.6, 1.44, 'g1_dev', 'dev_backend', '2026-W40', 1],
      [43.6, 1.44, 'g4_genai_agentique', 'ai_engineer', '2026-W40', 1],
      [43.6, 1.44, 'g9_elargi', 'support_it', '2026-W40', 1],
    ]);
  });

  it('découpe les intitulés en n-grammes sans mot vide en bordure', () => {
    expect([...titleNgrams('chef de projet ia')]).toEqual(['chef', 'projet', 'ia', 'projet ia', 'chef de projet']);
    expect([...titleNgrams('developpeur java 17')]).toEqual(['developpeur', 'java', 'developpeur java']);
  });

  it('détecte n-grammes en hausse, rôles franchissant le seuil et non classés', () => {
    const offers = [
      makeOffer({ sourceId: 'P1', titleNorm: 'agent builder', role: 'non_classe', group: 'non_classe', createdAt: '2026-06-10T10:00:00.000Z' }),
      ...Array.from({ length: 12 }, (_, i) =>
        makeOffer({ sourceId: `S${i}`, titleNorm: 'agent builder', role: 'non_classe', group: 'non_classe', createdAt: '2026-09-10T10:00:00.000Z' }),
      ),
      ...Array.from({ length: 6 }, (_, i) => makeOffer({ sourceId: `R${i}`, role: 'ai_engineer', group: 'g4_genai_agentique', createdAt: '2026-09-12T10:00:00.000Z' })),
      makeOffer({ sourceId: 'R9', role: 'ai_engineer', group: 'g4_genai_agentique', createdAt: '2026-08-12T10:00:00.000Z' }),
      makeOffer({ sourceId: 'X', titleNorm: 'agent builder', role: 'non_classe', group: 'non_classe', collectedVia: ['keyword'], createdAt: '2026-09-10T10:00:00.000Z' }),
    ];
    const { unclassified, ngrams, roles } = emerging(base(offers));
    expect(records(unclassified).find((r) => r.month === '2026-09')).toEqual({ month: '2026-09', title: 'agent builder', n: 12 });
    expect(records(ngrams).filter((r) => r.month === '2026-09').map((r) => [r.ngram, r.n, r.prevMean])).toEqual([
      ['agent', 13, 0.33],
      ['agent builder', 13, 0.33],
      ['builder', 13, 0.33],
    ]);
    expect(records(roles).find((r) => r.month === '2026-09' && r.role === 'ai_engineer')).toEqual({
      month: '2026-09', role: 'ai_engineer', n: 6, prevMean: 0.33, status: 'seuil',
    });
  });
});

describe('semaines partielles et meta.json (SPEC.md §6.9, §7.2)', () => {
  it('marque le rattrapage, la semaine du dernier run et les semaines mal couvertes', () => {
    // W41 : run W42 incomplet ; W43 : run W44 manquant ; W44 couverte par le run W45.
    const runs = [
      processRecord('2026-W40'),
      processRecord('2026-W41'),
      processRecord('2026-W42', { coverageComplete: false }),
      processRecord('2026-W43'),
      processRecord('2026-W45'),
    ];
    expect(partialWeeks(['2026-W30', '2026-W39', '2026-W40'], runs, '2026-W40', '2026-W45')).toEqual([
      '2026-W30', '2026-W39', '2026-W41', '2026-W43', '2026-W45',
    ]);
    expect(partialMonths(['2026-W40'])).toEqual(['2026-09', '2026-10']);
  });

  it('produit tous les fichiers d’agrégats, avec libellés et historique de taxonomie', () => {
    const offers = [makeOffer({ sourceId: 'A', salary: declared(40_000) }), makeOffer({ sourceId: 'B', createdAt: '2026-08-01T10:00:00.000Z', isBackfill: true })];
    const stock = new StockCounter();
    for (const o of offers) stock.add('2026-W40', toAggregateOffer(o));
    const files = computeAggregates({
      offers: offers.map(toAggregateOffer),
      stock: stock.toTable(),
      records: [processRecord('2026-W40')],
      taxonomy,
      firstRun: '2026-W40',
      lastRun: '2026-W40',
      taxonomyHistory: [{ version: 3, date: '2026-10-03' }],
      generatedAt: '2026-10-05T07:01:00.000Z',
    });
    expect(Object.keys(files).sort()).toEqual([
      'conditions.json', 'emerging.json', 'employers.json', 'geo-points.json', 'geo-regions.json', 'meta.json',
      'quality.json', 'salaries.json', 'techs.json', 'timeseries.json', 'titles.json',
    ]);
    const meta = files['meta.json'] as Record<string, unknown> & { labels: Record<string, { id?: string; code?: string }[]> };
    expect(meta).toMatchObject({
      lastRun: { runId: '2026-W40', status: 'complete', coverageComplete: true },
      firstRun: '2026-W40',
      backfillBefore: '2026-W40',
      partialWeeks: ['2026-W31', '2026-W40'],
      partialMonths: ['2026-07', '2026-08', '2026-09', '2026-10'],
      taxonomy: { version: taxonomy.version },
      taxonomyHistory: [{ version: 3, date: '2026-10-03' }],
      devGroup: 'g1_dev',
    });
    expect(meta.labels.regions).toHaveLength(18);
    expect(meta.labels.roles?.some((r) => r.id === 'non_classe')).toBe(true);
    const quality = files['quality.json'] as Table;
    expect(records(quality)[0]).toMatchObject({ run: '2026-W40', source: 'francetravail', status: 'complete', durationMs: 60_000 });
  });
});
