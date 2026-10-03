import { describe, expect, it } from 'vitest';
import { loadTaxonomy } from '../../src/core/taxonomy';
import { silentLogger } from '../../src/pipeline/log';
import { loadStepState, saveStepState } from '../../src/pipeline/runState';
import { collectFranceTravail, rawKey, type FtRawPartition } from '../../src/sources/francetravail/collect';
import { rootPartitions } from '../../src/sources/francetravail/partitions';
import { HttpError } from '../../src/sources/http';
import { memoryStores } from '../../src/storage/memory';
import { getGzipJson } from '../../src/storage/store';
import { FakeFtApi, fakeClock, offers, type UniverseOffer } from '../helpers';

const taxonomy = await loadTaxonomy();
const ROOTS = rootPartitions(taxonomy).length;
const RUN = '2026-W41';

async function rawPartitions(stores: ReturnType<typeof memoryStores>): Promise<FtRawPartition[]> {
  const keys = await stores.raw.list(`ft/${RUN}/`);
  return Promise.all(keys.map(async (key) => (await getGzipJson<FtRawPartition>(stores.raw, key))!));
}

/** Lundi 5 octobre 2026, 5 h UTC : début du run hebdomadaire (borne haute des découpages par dates). */
const RUN_START = Date.parse('2026-10-05T05:00:00Z');

function collect(api: FakeFtApi, stores = memoryStores(), extra: Partial<Parameters<typeof collectFranceTravail>[1]> = {}) {
  return collectFranceTravail(RUN, { api, taxonomy, stores, log: silentLogger, clock: fakeClock(RUN_START), ...extra });
}

const universe: UniverseOffer[] = [
  ...offers(400, { prefix: 'T', departement: '31' }),
  ...offers(5, { prefix: 'P', departement: '75', romeCode: 'M1811' }),
  ...offers(3, { prefix: 'F', departement: '69', intitule: 'Forward Deployed Engineer' }),
  ...offers(2, { prefix: 'N', departement: null, romeCode: 'M1818' }),
];

/** Appels de la passe A (sans mot-clé). */
const passACalls = (api: FakeFtApi) => api.calls.filter((c) => c.motsCles === undefined);

describe('collecte France Travail (SPEC.md §4.1, lot 1)', () => {
  it('collecte toutes les partitions et pagine au-delà de 150 résultats', async () => {
    const api = new FakeFtApi(universe);
    const stores = memoryStores();
    const report = await collect(api, stores);

    expect(report.status).toBe('complete');
    expect(report.partitions).toEqual({ total: ROOTS, pending: 0, done: ROOTS, split: 0, failed: 0 });
    // 3 pages pour la passe A nationale (0-149, 150-299, 300-409), 1 appel par mot-clé.
    expect(report.apiCalls).toBe(ROOTS + 2);
    expect(passACalls(api).map((c) => c.range)).toEqual(['0-149', '150-299', '300-409']);
    expect(report.offersByPass).toEqual({ A: 410, B: 3 });

    const national = await getGzipJson<FtRawPartition>(stores.raw, rawKey(RUN, 'a-fr'));
    expect(national?.total).toBe(410);
    expect(new Set(national?.offers.map((o) => o.id)).size).toBe(410);
  });

  it('collecte en passe A les offres sans département (docs/decisions.md, D19)', async () => {
    const stores = memoryStores();
    await collect(new FakeFtApi(universe), stores);

    const national = await getGzipJson<FtRawPartition>(stores.raw, rawKey(RUN, 'a-fr'));
    const withoutDepartement = national?.offers.filter((o) => (o.lieuTravail as { libelle: string }).libelle === 'France');
    expect(withoutDepartement?.map((o) => o.id)).toEqual(['N00000', 'N00001']);
  });

  it("n'écrit aucun champ de contact dans raw (critère du lot 1)", async () => {
    const stores = memoryStores();
    await collect(new FakeFtApi(universe), stores);

    const raws = await rawPartitions(stores);
    expect(raws.length).toBe(ROOTS);
    for (const raw of raws) {
      for (const offer of raw.offers) {
        expect(offer).not.toHaveProperty('contact');
        expect(offer).not.toHaveProperty('agence');
      }
    }
    const serialized = JSON.stringify(raws);
    expect(serialized).not.toMatch(/exemple\.fr|francetravail\.fr|06 12 34 56 78|0612345678|Jeanne/);
    expect(serialized).toContain('EXEMPLE SAS');
  });

  it("relance une partition sans créer de doublon (critère du lot 1)", async () => {
    const stores = memoryStores();
    await collect(new FakeFtApi(universe), stores);
    const keysBefore = await stores.raw.list(`ft/${RUN}/`);
    const before = await getGzipJson<FtRawPartition>(stores.raw, rawKey(RUN, 'a-fr'));

    // Remet une partition en attente, comme après une interruption, puis relance l'étape.
    const state = (await loadStepState(stores.state, RUN, 'collect-ft'))!;
    const p = state.partitions.find((x) => x.id === 'a-fr')!;
    p.status = 'pending';
    state.status = 'running';
    await saveStepState(stores.state, state);
    const api = new FakeFtApi(universe);
    const report = await collect(api, stores);

    expect(report.status).toBe('complete');
    expect(api.calls.map((c) => c.range)).toEqual(['0-149', '150-299', '300-409']);
    expect(passACalls(api)).toHaveLength(api.calls.length);
    expect(await stores.raw.list(`ft/${RUN}/`)).toEqual(keysBefore);
    const after = await getGzipJson<FtRawPartition>(stores.raw, rawKey(RUN, 'a-fr'));
    expect(after?.offers).toEqual(before?.offers);
    expect(report.offersByPass.A).toBe(410);
  });

  it('ne refait rien sur un run complet, et repart de zéro avec reset', async () => {
    const stores = memoryStores();
    await collect(new FakeFtApi(universe), stores);

    const idle = new FakeFtApi(universe);
    expect((await collect(idle, stores)).status).toBe('complete');
    expect(idle.stats.calls).toBe(0);

    await stores.raw.set(`ft/${RUN}/obsolete.json.gz`, new Uint8Array([1]));
    const fresh = new FakeFtApi(universe);
    const report = await collect(fresh, stores, { reset: true });
    expect(report.invocations).toBe(1);
    expect(fresh.stats.calls).toBe(ROOTS + 2);
    expect(await stores.raw.get(`ft/${RUN}/obsolete.json.gz`)).toBeNull();
  });

  it('découpe la passe A par code ROME puis par dates au-delà du plafond', async () => {
    const paris = [
      ...offers(25, { prefix: 'R', departement: '75', romeCode: 'M1805' }),
      ...offers(5, { prefix: 'S', departement: '75', romeCode: 'M1811' }),
    ];
    const stores = memoryStores();
    const report = await collect(new FakeFtApi(paris), stores, { maxResults: 10 });

    expect(report.status).toBe('complete');
    expect(report.truncatedPartitions).toBe(0);
    const state = (await loadStepState(stores.state, RUN, 'collect-ft'))!;
    const split = state.partitions.filter((p) => p.status === 'split').map((p) => p.id);
    expect(split).toContain('a-fr');
    expect(split).toContain('a-fr-rm1805');
    expect(state.partitions.some((p) => p.parent === 'a-fr-rm1805' && p.level === 'dates')).toBe(true);

    const raws = (await rawPartitions(stores)).filter((r) => r.partition.pass === 'A');
    expect(raws.every((r) => r.offers.length <= 10)).toBe(true);
    expect(new Set(raws.flatMap((r) => r.offers.map((o) => o.id))).size).toBe(30);
  });

  it('découpe la passe B par région puis par département', async () => {
    const fde = [
      ...offers(15, { prefix: 'A', departement: '75', intitule: 'Forward Deployed Engineer' }),
      ...offers(10, { prefix: 'B', departement: '92', intitule: 'Forward Deployed Engineer' }),
    ];
    const stores = memoryStores();
    const report = await collect(new FakeFtApi(fde), stores, { maxResults: 10 });

    expect(report.status).toBe('complete');
    const state = (await loadStepState(stores.state, RUN, 'collect-ft'))!;
    const ids = state.partitions.map((p) => p.id);
    expect(ids).toContain('b-kforward-deployed-g11');
    expect(ids).toContain('b-kforward-deployed-g11-d92');
    const d92 = state.partitions.find((p) => p.id === 'b-kforward-deployed-g11-d92')!;
    expect(d92.params).toEqual({ motsCles: 'forward deployed', departement: '92' });

    const raws = (await rawPartitions(stores)).filter((r) => r.partition.stem.startsWith('b-kforward-deployed'));
    expect(new Set(raws.flatMap((r) => r.offers.map((o) => o.id))).size).toBe(25);
  });

  it('tronque et signale une partition impossible à découper', async () => {
    const sameSecond = offers(15, { prefix: 'M', departement: '976', stepHours: 0 });
    const stores = memoryStores();
    const report = await collect(new FakeFtApi(sameSecond), stores, { maxResults: 10 });

    expect(report.status).toBe('complete');
    expect(report.truncatedPartitions).toBe(1);
    expect(report.errors.some((e) => /plafond de 10 : partition tronquée/.test(e.message))).toBe(true);
    const truncated = (await rawPartitions(stores)).find((r) => r.truncated)!;
    expect(truncated.offers).toHaveLength(10);
    expect(truncated.total).toBe(15);
  });

  it("lit jusqu'au plafond réel de l'API : 3 150 résultats, premier indice ≤ 3 000 (D18)", async () => {
    const api = new FakeFtApi(offers(3200, { prefix: 'Z', departement: '13', stepHours: 0 }));
    const report = await collect(api, memoryStores());

    expect(report.truncatedPartitions).toBe(1);
    expect(report.errors.some((e) => /3200 offres pour un plafond de 3150/.test(e.message))).toBe(true);
    const starts = passACalls(api).map((c) => Number(c.range?.split('-')[0]));
    expect(Math.max(...starts)).toBe(3000);
    expect(passACalls(api).at(-1)?.range).toBe('3000-3149');
    expect(report.offersByPass.A).toBe(3150);
  });

  it("enregistre son état à l'échéance et reprend sans refaire les partitions terminées", async () => {
    const clock = fakeClock(RUN_START);
    const stores = memoryStores();
    const first = new FakeFtApi(universe, { clock, callDurationMs: 100 });
    const partial = await collect(first, stores, { clock, deadline: clock.time + 5_000, concurrency: 1 });

    expect(partial.status).toBe('running');
    expect(partial.partitions.pending).toBeGreaterThan(0);
    expect(partial.partitions.done).toBeGreaterThan(0);

    const second = new FakeFtApi(universe);
    const final = await collect(second, stores);
    expect(final.status).toBe('complete');
    expect(final.invocations).toBe(2);
    const fetchedTwice = second.calls.filter((c) => first.calls.some((f) => JSON.stringify(f) === JSON.stringify(c)));
    expect(fetchedTwice).toEqual([]);
    expect(final.apiCalls).toBe(ROOTS + 2);
  });

  it('marque en échec une partition refusée (HTTP 400) et la retente à la relance suivante', async () => {
    const stores = memoryStores();
    const refused = new FakeFtApi(universe, {
      fail: (params) => (params.motsCles === 'NLP' ? new HttpError('recherche France Travail : HTTP 400', 400) : null),
    });
    const report = await collect(refused, stores);

    expect(report.status).toBe('incomplete');
    expect(report.partitions.failed).toBe(1);
    expect(refused.calls.filter((c) => c.motsCles === 'NLP')).toHaveLength(1);
    expect(report.errors).toEqual([{ partition: 'b-knlp', message: 'recherche France Travail : HTTP 400' }]);

    const retry = new FakeFtApi(universe);
    const final = await collect(retry, stores);
    expect(final.status).toBe('complete');
    expect(retry.calls).toEqual([{ motsCles: 'NLP', range: '0-149' }]);
  });

  it('retente dans la même exécution une partition en erreur transitoire', async () => {
    let failures = 0;
    const flaky = new FakeFtApi(universe, {
      fail: (params) => (params.motsCles === undefined && failures++ === 0 ? new Error('ECONNRESET') : null),
    });
    const report = await collect(flaky, memoryStores());

    expect(report.status).toBe('complete');
    expect(report.errors).toEqual([{ partition: 'a-fr', message: 'ECONNRESET' }]);
    // Premier appel en échec, puis la partition entière à la vague suivante.
    expect(passACalls(flaky).map((c) => c.range)).toEqual(['0-149', '0-149', '150-299', '300-409']);
  });

  it("n'écrit rien si l'accès est refusé dès le jeton", async () => {
    const stores = memoryStores();
    const api = new FakeFtApi(universe);
    api.preflight = async () => {
      throw new HttpError('jeton France Travail refusé : HTTP 401', 401);
    };
    await expect(collect(api, stores)).rejects.toThrow('HTTP 401');
    expect(await stores.state.list('')).toEqual([]);
    expect(await stores.raw.list('')).toEqual([]);
  });

  it('produit un rapport de compteurs cohérent', async () => {
    const stores = memoryStores();
    const report = await collect(new FakeFtApi(universe), stores, { maxResults: 100 });
    const state = (await loadStepState(stores.state, RUN, 'collect-ft'))!;

    const { total, pending, done, split, failed } = report.partitions;
    expect(pending + done + split + failed).toBe(total);
    expect(report.offersWritten).toBe(Object.values(report.offersByPass).reduce((a, b) => a + b, 0));
    expect(report.offersWritten).toBe(
      state.partitions.filter((p) => p.status === 'done').reduce((sum, p) => sum + (p.written ?? 0), 0),
    );
    // Toutes les feuilles non tronquées ont écrit le total annoncé.
    for (const p of state.partitions.filter((x) => x.status === 'done' && !x.truncated)) expect(p.written).toBe(p.total);
  });
});
