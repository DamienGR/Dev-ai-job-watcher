import { resolve } from 'node:path';
import type { Taxonomy } from '../../src/core/taxonomy';
import { silentLogger } from '../../src/pipeline/log';
import { newStepState, saveStepState, type StepState } from '../../src/pipeline/runState';
import { collectFranceTravail, rawKey, type FtRawPartition } from '../../src/sources/francetravail/collect';
import { FixtureFtApi } from '../../src/sources/francetravail/fixtures';
import { memoryStores } from '../../src/storage/memory';
import { getGzipJson, setGzipJson, type Stores } from '../../src/storage/store';

// Runs collectés en mode fixtures (SPEC.md §13), partagés par les tests du traitement et du
// reclassement.

/** Collecte du run en mode fixtures (SPEC.md §13), dans des stores en mémoire. */
export async function collectRunFixtures(taxonomy: Taxonomy, runId: string, stores: Stores = memoryStores()): Promise<Stores> {
  const api = await FixtureFtApi.fromDirectory(resolve('fixtures/francetravail'));
  await collectFranceTravail(runId, { api, taxonomy, stores, log: silentLogger });
  return stores;
}

/** Ajoute une partition de passe B avec une offre hors informatique, à écarter (règle de rétention). */
export async function addKeywordOnlyOffer(stores: Stores, runId: string): Promise<void> {
  const partition: FtRawPartition = {
    source: 'francetravail',
    runId,
    partition: { id: 'b-kcomptable', stem: 'b-kcomptable', parent: null, pass: 'B', level: 'national', params: { motsCles: 'comptable' } },
    fetchedAt: '2026-10-03T08:00:00.000Z',
    total: 1,
    truncated: false,
    offers: [
      { id: 'FX09001', intitule: 'Comptable (H/F)', description: 'Utilisation de l’IA pour la saisie.', dateCreation: '2026-09-29T08:00:00.000Z', lieuTravail: { libelle: '35 - RENNES', commune: '35238' } },
    ],
  };
  await setGzipJson(stores.raw, rawKey(runId, partition.partition.id), partition);
}

/** Recopie la passe A d'un run vers un autre run, sans certaines offres, avec un état de collecte. */
export async function seedRunFrom(
  stores: Stores,
  from: string,
  runId: string,
  { without = [], status = 'complete' }: { without?: string[]; status?: StepState['status'] } = {},
): Promise<void> {
  const raw = await getGzipJson<FtRawPartition>(stores.raw, rawKey(from, 'a-fr'));
  if (!raw) throw new Error('partition a-fr absente');
  await setGzipJson(stores.raw, rawKey(runId, 'a-fr'), {
    ...raw,
    runId,
    offers: raw.offers.filter((o) => !without.includes(o.id as string)),
  });
  const state = newStepState(runId, 'collect-ft', new Date('2026-10-12T05:00:00Z'));
  state.status = status;
  state.partitions = [{ ...raw.partition, status: 'done', total: raw.total, written: raw.offers.length, truncated: false, attempts: 1, error: null }];
  await saveStepState(stores.state, state);
}
