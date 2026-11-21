import { beforeAll, describe, expect, it } from 'vitest';
import type { Offer } from '../../src/core/offer';
import { compileTaxonomy, loadTaxonomy, type CompiledTaxonomy, type Taxonomy } from '../../src/core/taxonomy';
import type { Table } from '../../src/pipeline/aggregates/table';
import { silentLogger } from '../../src/pipeline/log';
import { offersKey, processRun, TAXONOMY_VERSION_KEY } from '../../src/pipeline/process';
import { loadProcessRecord, saveProcessRecord } from '../../src/pipeline/processRecord';
import { SEEN_KEY, type SeenIndex } from '../../src/pipeline/seenIndex';
import { memoryStores } from '../../src/storage/memory';
import { getGzipJson, getGzipJsonLines, getJson, type Stores } from '../../src/storage/store';
import { addKeywordOnlyOffer, collectRunFixtures, seedRunFrom } from './fixtures';

let taxonomy: Taxonomy;
let compiled: CompiledTaxonomy;
beforeAll(async () => {
  taxonomy = await loadTaxonomy();
  compiled = compileTaxonomy(taxonomy);
});

const collectFixtures = (runId: string, stores?: Stores) => collectRunFixtures(taxonomy, runId, stores);

const process = (runId: string, stores: Stores) => processRun(runId, { stores, log: silentLogger, taxonomy: compiled });
const runOffers = async (stores: Stores, runId: string) => (await getGzipJsonLines<Offer>(stores.offers, offersKey(runId))) ?? [];
const aggregate = async <T = Table>(stores: Stores, name: string) => (await getJson<T>(stores.aggregates, name))!;

describe('traitement d’un run (SPEC.md §6, §7, lot 2)', () => {
  it('normalise, dédoublonne, applique la règle de rétention et écrit offres, index et agrégats', async () => {
    const stores = await collectFixtures('2026-W40');
    await addKeywordOnlyOffer(stores, '2026-W40');
    const record = await process('2026-W40', stores);

    expect(record).toMatchObject({ runId: '2026-W40', status: 'complete', coverageComplete: true, error: null });
    expect(record.counters).toMatchObject({
      read: 10,
      collectedA: 6,
      collectedB: 4,
      distinct: 9,
      invalid: 0,
      abroad: 0,
      droppedRetention: 1,
      retained: 8,
      newOffers: 8,
      closed: 0,
      salaryDeclared: 6,
    });

    const offers = await runOffers(stores, '2026-W40');
    expect(offers.map((o) => o.sourceId)).toEqual(['FX00001', 'FX00002', 'FX00003', 'FX00004', 'FX00005', 'FX00006', 'FX00007', 'FX00008']);
    // Offre des deux passes : une seule fois, les deux voies de collecte.
    expect(offers.find((o) => o.sourceId === 'FX00004')?.collectedVia).toEqual(['keyword', 'rome']);
    // Offre de la seule passe B, gardée car classée dans un groupe IA.
    const fx7 = offers.find((o) => o.sourceId === 'FX00007')!;
    expect(fx7.collectedVia).toEqual(['keyword']);
    expect(taxonomy.groups.find((g) => g.id === fx7.group)?.keyword_pass).toBe(true);
    // Premier run : les offres créées avant la semaine W40 sont du rattrapage.
    expect(offers.filter((o) => o.isBackfill).map((o) => o.sourceId)).toEqual(['FX00002', 'FX00003', 'FX00005', 'FX00006', 'FX00007', 'FX00008']);

    const seen = await getGzipJson<SeenIndex>(stores.index, SEEN_KEY);
    expect(seen).toMatchObject({ firstRun: '2026-W40', lastRun: '2026-W40' });
    expect(Object.keys(seen!.entries)).toHaveLength(8);

    expect((await stores.aggregates.list('')).sort()).toEqual([
      'conditions.json', 'emerging.json', 'employers.json', 'geo-points.json', 'geo-regions.json', 'meta.json',
      'quality.json', 'review/2026-09.json', 'review/2026-10.json', 'salaries.json', 'techs.json', 'timeseries.json',
      'titles.json',
    ]);
    const meta = await aggregate<Record<string, unknown>>(stores, 'meta.json');
    expect(meta).toMatchObject({ firstRun: '2026-W40', partialWeeks: ['2026-W37', '2026-W38', '2026-W39', '2026-W40'] });
    const quality = await aggregate(stores, 'quality.json');
    expect(quality.rows).toHaveLength(1);
    expect(quality.rows[0]![quality.columns.indexOf('durationMs')]).toBe(record.durationMs);
    expect(await getJson(stores.state, TAXONOMY_VERSION_KEY)).toEqual({
      version: taxonomy.version,
      history: [{ version: taxonomy.version, date: taxonomy.updated }],
    });
    expect(await loadProcessRecord(stores.state, '2026-W40')).toEqual(record);
  });

  it('est rejouable : une relance produit les mêmes offres, le même index et les mêmes agrégats', async () => {
    const stores = await collectFixtures('2026-W40');
    await process('2026-W40', stores);
    const snapshot = async () => ({
      offers: await runOffers(stores, '2026-W40'),
      seen: await getGzipJson(stores.index, SEEN_KEY),
      timeseries: await aggregate(stores, 'timeseries.json'),
      salaries: await aggregate(stores, 'salaries.json'),
    });
    const first = await snapshot();
    const again = await process('2026-W40', stores);
    expect(again.counters.newOffers).toBe(8);
    expect(await snapshot()).toEqual(first);
  });

  it('ferme les offres disparues au run suivant et lève la semaine partielle couverte', async () => {
    const stores = await collectFixtures('2026-W40');
    await process('2026-W40', stores);
    await seedRunFrom(stores, '2026-W40', '2026-W41', { without: ['FX00001'] });
    const record = await process('2026-W41', stores);

    expect(record.counters).toMatchObject({ retained: 5, newOffers: 0, closed: 3 });
    const seen = await getGzipJson<SeenIndex>(stores.index, SEEN_KEY);
    expect(seen?.entries['francetravail:FX00001']).toMatchObject({ lastSeenRun: '2026-W40', closedRun: '2026-W41' });
    expect(seen?.entries['francetravail:FX00002']).toMatchObject({ firstSeenRun: '2026-W40', lastSeenRun: '2026-W41', closedRun: null });

    const meta = await aggregate<Record<string, unknown>>(stores, 'meta.json');
    expect(meta).toMatchObject({ runs: ['2026-W40', '2026-W41'], partialWeeks: ['2026-W37', '2026-W38', '2026-W39', '2026-W41'] });
    const stock = (await aggregate<{ stock: Table }>(stores, 'timeseries.json')).stock;
    const byRun = (run: string) => stock.rows.filter((r) => r[0] === run).reduce((sum, r) => sum + (r[r.length - 1] as number), 0);
    expect([byRun('2026-W40'), byRun('2026-W41')]).toEqual([8, 5]);
    // Les nouvelles offres comptent chaque offre une fois, toutes semaines de collecte confondues.
    const newOffers = (await aggregate<{ newOffers: Table }>(stores, 'timeseries.json')).newOffers;
    expect(newOffers.rows.reduce((sum, r) => sum + (r[r.length - 1] as number), 0)).toBe(8);
    expect((await aggregate(stores, 'quality.json')).rows).toHaveLength(2);

    await expect(process('2026-W40', stores)).rejects.toThrow(/plus ancien/);
    expect(await loadProcessRecord(stores.state, '2026-W40')).toMatchObject({ status: 'complete' });
  });

  it('ne ferme rien si la collecte est incomplète', async () => {
    const stores = await collectFixtures('2026-W40');
    await process('2026-W40', stores);
    await seedRunFrom(stores, '2026-W40', '2026-W41', { without: ['FX00001'], status: 'incomplete' });
    const record = await process('2026-W41', stores);
    expect(record).toMatchObject({ coverageComplete: false, counters: { closed: 0 } });
    const meta = await aggregate<{ partialWeeks: string[] }>(stores, 'meta.json');
    expect(meta.partialWeeks).toContain('2026-W40');
  });

  it('refuse un run sans collecte, à collecte en cours ou déjà en cours de traitement', async () => {
    const stores = memoryStores();
    await expect(process('2026-W40', stores)).rejects.toThrow(/aucune collecte/);

    await seedRunFrom(await collectFixtures('2026-W39', stores), '2026-W39', '2026-W40', { status: 'running' });
    await expect(process('2026-W40', stores)).rejects.toThrow(/collecte France Travail en cours/);

    await seedRunFrom(stores, '2026-W39', '2026-W40');
    const record = await process('2026-W40', stores);
    await saveProcessRecord(stores.state, { ...record, status: 'running', startedAt: new Date().toISOString() });
    await expect(process('2026-W40', stores)).rejects.toThrow(/déjà en cours/);
  });

  it('enregistre l’échec dans le compte rendu', async () => {
    const stores = await collectFixtures('2026-W40');
    await process('2026-W40', stores);
    await seedRunFrom(stores, '2026-W40', '2026-W41');
    stores.offers.set = async () => {
      throw new Error('disque plein');
    };
    await expect(process('2026-W41', stores)).rejects.toThrow('disque plein');
    expect(await loadProcessRecord(stores.state, '2026-W41')).toMatchObject({ status: 'failed', error: 'disque plein' });
  });
});
