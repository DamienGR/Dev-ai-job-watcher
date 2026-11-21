import { beforeAll, describe, expect, it } from 'vitest';
import type { Offer } from '../../src/core/offer';
import { compileTaxonomy, loadTaxonomy, type CompiledTaxonomy, type Taxonomy } from '../../src/core/taxonomy';
import type { Review } from '../../src/pipeline/aggregates/review';
import { silentLogger } from '../../src/pipeline/log';
import { dataTaxonomyVersion, offersKey, processRun, reclassifyAll, TAXONOMY_VERSION_KEY } from '../../src/pipeline/process';
import { loadProcessRecord } from '../../src/pipeline/processRecord';
import { SEEN_KEY, seenSnapshotKey } from '../../src/pipeline/seenIndex';
import { getGzipJson, getGzipJsonLines, getJson, setGzipJson, type Stores } from '../../src/storage/store';
import { weekAxis } from '../../web/src/lib/axis';
import type { Meta } from '../../web/src/lib/types';
import { collectRunFixtures, seedRunFrom } from './fixtures';

// Reclassement de tout l'historique (SPEC.md §9.3, lot 6, D66).

let taxonomy: Taxonomy;
let v3: CompiledTaxonomy;
let v4: CompiledTaxonomy;
beforeAll(async () => {
  taxonomy = await loadTaxonomy();
  v3 = compileTaxonomy(taxonomy);
  // « PR de taxonomie de test » : un rôle de plus, qui range « Consultant SAP S/4HANA ».
  const next = structuredClone(taxonomy);
  next.version = taxonomy.version + 1;
  next.updated = '2026-10-14';
  next.roles.push({ id: 'consultant_sap', group: 'g1_dev', label: 'Consultant SAP', priority: 10, title: { include: ['\\bsap\\b'] } });
  v4 = compileTaxonomy(next);
});

const SAP = 'francetravail:FX00006';
const options = (stores: Stores, t: CompiledTaxonomy, now = Date.parse('2026-10-15T02:00:00Z')) => ({
  stores,
  log: silentLogger,
  taxonomy: t,
  clock: { now: () => now, sleep: async () => {} },
});
const runOffers = async (stores: Stores, runId: string) => (await getGzipJsonLines<Offer>(stores.offers, offersKey(runId))) ?? [];
const file = async <T>(stores: Stores, name: string) => (await getJson<T>(stores.aggregates, name))!;

/** Deux runs traités avec la taxonomie courante : W40 (fixtures), puis W41 sans FX00001. */
async function twoRuns(): Promise<Stores> {
  const stores = await collectRunFixtures(taxonomy, '2026-W40');
  await processRun('2026-W40', options(stores, v3));
  await seedRunFrom(stores, '2026-W40', '2026-W41', { without: ['FX00001'] });
  await processRun('2026-W41', options(stores, v3));
  return stores;
}

describe('reclassement de l’historique (SPEC.md §9.3)', () => {
  it('à taxonomie inchangée, reproduit le traitement d’origine', async () => {
    const stores = await twoRuns();
    const snapshot = async () => ({
      w40: await runOffers(stores, '2026-W40'),
      w41: await runOffers(stores, '2026-W41'),
      seen: await getGzipJson(stores.index, SEEN_KEY),
      timeseries: await file(stores, 'timeseries.json'),
      titles: await file(stores, 'titles.json'),
      quality: await file(stores, 'quality.json'),
      state: await getJson(stores.state, TAXONOMY_VERSION_KEY),
    });
    const before = await snapshot();
    const report = await reclassifyAll(options(stores, v3));
    expect(report).toMatchObject({ from: 3, to: 3, runs: ['2026-W40', '2026-W41'] });
    expect(await snapshot()).toEqual(before);
  });

  it('applique une nouvelle version à tous les runs, avec son effet et son marqueur', async () => {
    const stores = await twoRuns();
    const w41 = (await loadProcessRecord(stores.state, '2026-W41'))!;
    expect((await runOffers(stores, '2026-W40')).find((o) => o.uid === SAP)?.role).toBe('non_classe');

    const report = await reclassifyAll(options(stores, v4));
    expect(report).toMatchObject({ from: 3, to: 4, runs: ['2026-W40', '2026-W41'] });
    for (const runId of ['2026-W40', '2026-W41']) {
      const sap = (await runOffers(stores, runId)).find((o) => o.uid === SAP);
      expect(sap).toMatchObject({ role: 'consultant_sap', group: 'g1_dev', taxonomyVersion: 4 });
      expect(await loadProcessRecord(stores.state, runId)).toMatchObject({ taxonomyVersion: 4, reclassifiedAt: '2026-10-15T02:00:00.000Z' });
    }
    // Durées du run d'origine gardées ; une offre classée de plus au dernier run.
    const after = (await loadProcessRecord(stores.state, '2026-W41'))!;
    expect(after.durationMs).toBe(w41.durationMs);
    expect(after.counters.classified).toBe(w41.counters.classified + 1);
    const entry = {
      version: 4,
      date: '2026-10-14',
      appliedAt: '2026-10-15',
      effect: {
        run: '2026-W41',
        before: { classified: w41.counters.classified, retained: w41.counters.retained },
        after: { classified: w41.counters.classified + 1, retained: w41.counters.retained },
      },
    };
    expect(report.effect).toEqual(entry.effect);
    expect(await getJson(stores.state, TAXONOMY_VERSION_KEY)).toEqual({ version: 4, history: [{ version: 3, date: '2026-10-03' }, entry] });
    expect(await dataTaxonomyVersion(stores)).toBe(4);

    // Le marqueur de version apparaît sur les courbes hebdomadaires (SPEC.md §14, critère du lot 6).
    const meta = await file<Meta>(stores, 'meta.json');
    expect(meta.taxonomy).toEqual({ version: 4, updated: '2026-10-14' });
    expect(meta.taxonomyHistory.at(-1)).toEqual(entry);
    expect(weekAxis(meta, ['2026-W40', '2026-W41', '2026-W42']).markers).toEqual([{ index: 2, label: 'taxonomie v4' }]);

    // La revue du mois ne liste plus l'intitulé désormais classé.
    const review = await file<Review>(stores, 'review/2026-10.json');
    expect(review.taxonomy.version).toBe(4);
    expect(review.unclassified.map((u) => u.title)).not.toContain('consultant sap s/4hana');
  });

  it('un run traité après une nouvelle version reclasse d’abord l’historique', async () => {
    const stores = await collectRunFixtures(taxonomy, '2026-W40');
    await processRun('2026-W40', options(stores, v3));
    await seedRunFrom(stores, '2026-W40', '2026-W41');
    const record = await processRun('2026-W41', options(stores, v4));

    expect(record).toMatchObject({ status: 'complete', taxonomyVersion: 4 });
    expect((await runOffers(stores, '2026-W40')).find((o) => o.uid === SAP)).toMatchObject({ role: 'consultant_sap', taxonomyVersion: 4 });
    expect(await loadProcessRecord(stores.state, '2026-W40')).toMatchObject({ taxonomyVersion: 4 });
    expect((await file<Meta>(stores, 'meta.json')).taxonomyHistory.map((h) => h.version)).toEqual([3, 4]);
  });

  it('écarte les copies d’index des runs plus récents, jamais menés au bout', async () => {
    const stores = await twoRuns();
    await setGzipJson(stores.index, seenSnapshotKey('2026-W42'), { stale: true });
    await reclassifyAll(options(stores, v4));
    expect(await stores.index.list('seen-before/')).toEqual(['seen-before/2026-W40.json.gz', 'seen-before/2026-W41.json.gz']);
    // La copie d'avant W41 est l'index rebâti après W40, pas l'ancien.
    const snapshot = await getGzipJson<{ lastRun: string }>(stores.index, seenSnapshotKey('2026-W41'));
    expect(snapshot?.lastRun).toBe('2026-W40');
  });

  it('ne fait rien sans run traité', async () => {
    const stores = await collectRunFixtures(taxonomy, '2026-W40');
    expect(await reclassifyAll(options(stores, v4))).toMatchObject({ from: null, to: 4, runs: [], effect: null });
    expect(await dataTaxonomyVersion(stores)).toBeNull();
  });
});
