import type { Taxonomy } from '../../core/taxonomy';
import {
  loadStepState,
  newStepState,
  saveStepState,
  stepStateKey,
  type PartitionState,
} from '../../pipeline/runState';
import { deletePrefix, setGzipJson } from '../../storage/store';
import { HttpError, systemClock } from '../http';
import { collectReport, type CollectContext, type CollectReport } from '../source';
import { FT_PAGE_SIZE, type FtApi, type FtOffer } from './api';
import { FT_MAX_RESULTS, romeCodes, rootPartitions, splitPartition, type FtPartition } from './partitions';
import { sanitizeOffer } from './sanitize';

const SOURCE = 'francetravail';
const STEP = 'collect-ft';
/** Essais d'une partition par exécution ; le client HTTP a déjà rejoué chaque appel. */
const ATTEMPTS_PER_INVOCATION = 2;
const SAVE_INTERVAL_MS = 5000;

/** Clé déterministe d'une partition (SPEC.md §3.4) : une relance réécrit la même clé. */
export function rawKey(runId: string, partitionId: string): string {
  return `ft/${runId}/${partitionId}.json.gz`;
}

/** Contenu d'un objet du store `raw` pour France Travail. */
export interface FtRawPartition {
  source: typeof SOURCE;
  runId: string;
  partition: FtPartition;
  fetchedAt: string;
  /** Total annoncé par l'API pour la requête. */
  total: number;
  truncated: boolean;
  /** Réponses brutes, sans champs de contact. */
  offers: FtOffer[];
}

export interface FtCollectOptions extends CollectContext {
  api: FtApi;
  taxonomy: Taxonomy;
  /** Partitions traitées en parallèle ; le débit reste bridé par le client. */
  concurrency?: number;
  maxResults?: number;
}

function pendingState(p: FtPartition): PartitionState {
  return { ...p, status: 'pending', total: null, written: null, truncated: false, attempts: 0, error: null };
}

async function runPool<T>(
  items: readonly T[],
  concurrency: number,
  task: (item: T) => Promise<void>,
  stop: () => boolean,
): Promise<void> {
  let next = 0;
  const worker = async () => {
    while (next < items.length && !stop()) await task(items[next++]!);
  };
  await Promise.all(Array.from({ length: Math.max(1, Math.min(concurrency, items.length)) }, worker));
}

/**
 * Collecte France Travail d'un run (SPEC.md §4.1) : passes A et B, découpage adaptatif au-delà
 * du plafond, écriture dans `raw` sans champs de contact. Reprend les partitions en attente
 * d'une exécution précédente et retente celles en échec ; ne fait rien si le run est complet.
 */
export async function collectFranceTravail(runId: string, options: FtCollectOptions): Promise<CollectReport> {
  const {
    api,
    taxonomy,
    stores,
    log,
    clock = systemClock,
    deadline,
    reset = false,
    concurrency = 4,
    maxResults = FT_MAX_RESULTS,
  } = options;
  const started = clock.now();
  const nowIso = () => new Date(clock.now()).toISOString();

  if (reset) {
    const removed = await deletePrefix(stores.raw, `ft/${runId}/`);
    await stores.state.delete(stepStateKey(runId, STEP));
    log('collect.reset', { source: SOURCE, runId, removed });
  }

  const existing = await loadStepState(stores.state, runId, STEP);
  if (existing?.status === 'complete') {
    log('collect.already-complete', { source: SOURCE, runId });
    return collectReport(SOURCE, existing);
  }

  await api.preflight();

  const state = existing ?? newStepState(runId, STEP, new Date(clock.now()));
  if (!existing) state.partitions = rootPartitions(taxonomy).map(pendingState);
  for (const p of state.partitions) {
    if (p.status === 'failed') p.status = 'pending';
    if (p.status === 'pending') p.attempts = 0;
  }
  state.status = 'running';
  state.invocations += 1;
  await saveStepState(stores.state, state);
  log('collect.start', {
    source: SOURCE,
    runId,
    invocation: state.invocations,
    pending: state.partitions.filter((p) => p.status === 'pending').length,
  });

  const splitContext = { romeCodes: romeCodes(taxonomy), referenceTime: new Date(state.referenceTime) };
  const statsBefore = { ...api.stats };
  const pastDeadline = () => deadline !== undefined && clock.now() >= deadline;

  let saving = Promise.resolve();
  let lastSave = clock.now();
  const saveIfDue = async () => {
    if (clock.now() - lastSave < SAVE_INTERVAL_MS) return;
    lastSave = clock.now();
    saving = saving.then(() => saveStepState(stores.state, state));
    await saving;
  };

  const processPartition = async (p: PartitionState): Promise<void> => {
    p.attempts += 1;
    try {
      const first = await api.search(p.params, [0, FT_PAGE_SIZE - 1]);
      p.total = first.total;
      if (first.total > maxResults) {
        const children = splitPartition(p, splitContext);
        if (children.length > 0) {
          p.status = 'split';
          p.error = null;
          state.partitions.push(...children.map(pendingState));
          log('collect.partition.split', { source: SOURCE, runId, partition: p.id, total: first.total, children: children.length });
          return;
        }
        p.truncated = true;
      }

      const limit = Math.min(first.total, maxResults);
      const offers = [...first.offers];
      while (offers.length < limit) {
        const start = offers.length;
        const page = await api.search(p.params, [start, Math.min(start + FT_PAGE_SIZE, limit) - 1]);
        if (page.offers.length === 0) break;
        offers.push(...page.offers);
      }

      const { id, stem, parent, pass, level, params } = p;
      const raw: FtRawPartition = {
        source: SOURCE,
        runId,
        partition: { id, stem, parent, pass, level, params },
        fetchedAt: nowIso(),
        total: first.total,
        truncated: p.truncated,
        offers: offers.slice(0, limit).map(sanitizeOffer),
      };
      await setGzipJson(stores.raw, rawKey(runId, p.id), raw);
      p.written = raw.offers.length;
      p.status = 'done';
      p.error = null;
      if (p.truncated) {
        state.errors.push({
          at: nowIso(),
          partition: p.id,
          message: `${first.total} offres pour un plafond de ${maxResults} : partition tronquée`,
        });
      }
      log('collect.partition', { source: SOURCE, runId, partition: p.id, total: first.total, written: p.written, truncated: p.truncated });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const clientError = error instanceof HttpError && error.status >= 400 && error.status < 500;
      p.error = message;
      if (clientError || p.attempts >= ATTEMPTS_PER_INVOCATION) p.status = 'failed';
      state.errors.push({ at: nowIso(), partition: p.id, message });
      log('collect.partition.error', { source: SOURCE, runId, partition: p.id, attempt: p.attempts, message });
    }
    await saveIfDue();
  };

  // Par vagues : les sous-partitions et les nouveaux essais d'une vague passent à la suivante.
  let wave = state.partitions.filter((p) => p.status === 'pending');
  while (wave.length > 0 && !pastDeadline()) {
    await runPool(wave, concurrency, processPartition, pastDeadline);
    wave = state.partitions.filter((p) => p.status === 'pending');
  }
  await saving;

  state.counters.apiCalls += api.stats.calls - statsBefore.calls;
  state.counters.retries += api.stats.retries - statsBefore.retries;
  state.counters.durationMs += clock.now() - started;
  const statuses = new Set(state.partitions.map((p) => p.status));
  state.status = statuses.has('pending') ? 'running' : statuses.has('failed') ? 'incomplete' : 'complete';
  await saveStepState(stores.state, state);

  const report = collectReport(SOURCE, state);
  log('collect.end', { ...report, errors: report.errors.length });
  return report;
}
