import type { Offer } from '../core/offer';
import { NON_CLASSE, type CompiledTaxonomy } from '../core/taxonomy';
import type { FtRawPartition } from '../sources/francetravail/collect';
import { emptyNormalizeStats, normalizeFtPartition } from '../sources/francetravail/normalize';
import { systemClock, type Clock } from '../sources/http';
import { getGzipJson, getGzipJsonLines, getJson, setGzipJson, setGzipJsonLines, setJson, type Stores } from '../storage/store';
import {
  computeAggregates,
  quality,
  StockCounter,
  toAggregateOffer,
  writeAggregates,
  type AggregateOffer,
  type TaxonomyHistoryEntry,
} from './aggregates';
import type { Logger } from './log';
import {
  loadProcessRecord,
  loadProcessRecords,
  saveProcessRecord,
  type ProcessCounters,
  type ProcessRecord,
} from './processRecord';
import { loadStepState } from './runState';
import { applyRun, loadSeenIndexFor, SEEN_KEY } from './seenIndex';

// Traitement d'un run (SPEC.md §6, §7) : normalisation, dédoublonnage intra-source, règle de
// rétention, index `seen`, offres de la semaine, agrégats. Indépendant de l'endroit où il
// tourne : appelé par `scripts/process.ts` comme par une fonction.

export function offersKey(runId: string): string {
  return `${runId}.jsonl.gz`;
}

export const TAXONOMY_VERSION_KEY = 'taxonomy-version';

/** État `state/taxonomy-version` : version des données et historique des versions (§9.3). */
export interface TaxonomyVersionState {
  version: number;
  history: TaxonomyHistoryEntry[];
}

/** Un traitement « en cours » plus ancien que ce délai est considéré comme interrompu. */
const RUNNING_TTL_MS = 20 * 60_000;

export interface ProcessOptions {
  stores: Stores;
  log: Logger;
  taxonomy: CompiledTaxonomy;
  clock?: Clock;
}

function emptyCounters(): ProcessCounters {
  return {
    read: 0, collectedA: 0, collectedB: 0, distinct: 0, invalid: 0, abroad: 0, droppedRetention: 0, retained: 0,
    newOffers: 0, closed: 0, reopened: 0, classified: 0, salaryDeclared: 0, salaryOutOfBounds: 0, salaryPredicted: 0,
    tjm: 0, noCoordinates: 0, noRegion: 0, duplicates: 0,
  };
}

const topEntries = (counts: Record<string, number>, limit: number) =>
  Object.fromEntries(Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, limit));

/**
 * Offres France Travail d'un run, dédoublonnées par `uid` (union des passes dans
 * `collectedVia`), puis filtrées par la règle de rétention (SPEC.md §4.1, exigée) : une offre
 * trouvée seulement en passe B n'est gardée que si elle est classée dans un groupe IA.
 */
export async function loadRunOffers(
  stores: Stores,
  runId: string,
  taxonomy: CompiledTaxonomy,
  counters: ProcessCounters,
): Promise<{ offers: Offer[]; abroadLabels: Record<string, number> }> {
  const stats = emptyNormalizeStats();
  const byUid = new Map<string, Offer>();
  const passA = new Set<string>();
  const passB = new Set<string>();
  for (const key of await stores.raw.list(`ft/${runId}/`)) {
    const raw = await getGzipJson<FtRawPartition>(stores.raw, key);
    if (!raw) continue;
    for (const offer of normalizeFtPartition(raw, taxonomy, stats)) {
      (raw.partition.pass === 'A' ? passA : passB).add(offer.uid);
      const existing = byUid.get(offer.uid);
      if (!existing) byUid.set(offer.uid, offer);
      else for (const via of offer.collectedVia) if (!existing.collectedVia.includes(via)) existing.collectedVia.push(via);
    }
  }

  const keywordGroups = new Set(taxonomy.source.groups.filter((g) => g.keyword_pass).map((g) => g.id));
  const offers = [...byUid.values()]
    .filter((o) => o.collectedVia.includes('rome') || keywordGroups.has(o.group))
    .sort((a, b) => (a.uid < b.uid ? -1 : 1));
  for (const o of offers) o.collectedVia.sort();

  Object.assign(counters, {
    read: stats.read,
    invalid: stats.invalid,
    abroad: stats.abroad,
    salaryOutOfBounds: stats.salaryOutOfBounds,
    collectedA: passA.size,
    collectedB: passB.size,
    distinct: byUid.size,
    droppedRetention: byUid.size - offers.length,
    retained: offers.length,
  });
  return { offers, abroadLabels: topEntries(stats.abroadLabels, 20) };
}

/** Historique des versions de taxonomie, complété par la version courante si elle est nouvelle. */
async function updateTaxonomyHistory(stores: Stores, taxonomy: CompiledTaxonomy): Promise<TaxonomyHistoryEntry[]> {
  const state = await getJson<TaxonomyVersionState>(stores.state, TAXONOMY_VERSION_KEY);
  const history = state?.history ?? [];
  if (!history.some((h) => h.version === taxonomy.version)) {
    history.push({ version: taxonomy.version, date: taxonomy.source.updated });
    history.sort((a, b) => a.version - b.version);
  }
  await setJson(stores.state, TAXONOMY_VERSION_KEY, { version: taxonomy.version, history } satisfies TaxonomyVersionState);
  return history;
}

/** Relit `offers/*` : dernière version de chaque offre et stock actif de chaque run. */
async function loadAllOffers(stores: Stores): Promise<{ latest: Map<string, AggregateOffer>; stock: StockCounter }> {
  const latest = new Map<string, AggregateOffer>();
  const stock = new StockCounter();
  const keys = (await stores.offers.list('')).filter((key) => key.endsWith('.jsonl.gz')).sort();
  for (const key of keys) {
    const runId = key.slice(0, -'.jsonl.gz'.length);
    for (const offer of (await getGzipJsonLines<Offer>(stores.offers, key)) ?? []) {
      const slim = toAggregateOffer(offer);
      stock.add(runId, slim);
      latest.set(slim.uid, slim);
    }
  }
  return { latest, stock };
}

/**
 * Traite un run déjà collecté. Rejouable : une relance repart de la copie de l'index prise
 * avant le premier traitement du run et réécrit les mêmes clés. Refuse un run dont la
 * collecte est absente ou en cours, ou plus ancien que le dernier run traité.
 */
export async function processRun(runId: string, options: ProcessOptions): Promise<ProcessRecord> {
  const { stores, log, taxonomy, clock = systemClock } = options;
  const started = clock.now();
  const nowIso = () => new Date(clock.now()).toISOString();

  const collect = await loadStepState(stores.state, runId, 'collect-ft');
  if (!collect) throw new Error(`run ${runId} : aucune collecte France Travail`);
  if (collect.status === 'running') throw new Error(`run ${runId} : collecte France Travail en cours`);

  const previous = await loadProcessRecord(stores.state, runId);
  if (previous?.status === 'running' && started - Date.parse(previous.startedAt) < RUNNING_TTL_MS) {
    throw new Error(`run ${runId} : traitement déjà en cours depuis ${previous.startedAt}`);
  }
  // Avant tout enregistrement : un run plus ancien que le dernier traité est refusé sans
  // toucher à son compte rendu.
  const base = await loadSeenIndexFor(stores.index, runId);

  const truncatedPartitions = collect.partitions.filter((p) => p.truncated).length;
  const record: ProcessRecord = {
    runId,
    step: 'process',
    status: 'running',
    startedAt: nowIso(),
    finishedAt: null,
    durationMs: null,
    taxonomyVersion: taxonomy.version,
    collect: {
      status: collect.status,
      partitions: collect.partitions.length,
      truncatedPartitions,
      failedPartitions: collect.partitions.filter((p) => p.status === 'failed').length,
      apiCalls: collect.counters.apiCalls,
      retries: collect.counters.retries,
      errors: collect.errors.length,
      durationMs: collect.counters.durationMs,
    },
    coverageComplete: collect.status === 'complete' && truncatedPartitions === 0,
    counters: emptyCounters(),
    abroadLabels: {},
    error: null,
  };
  await saveProcessRecord(stores.state, record);
  log('process.start', { runId, taxonomyVersion: taxonomy.version, collectStatus: collect.status });

  try {
    const { offers, abroadLabels } = await loadRunOffers(stores, runId, taxonomy, record.counters);
    record.abroadLabels = abroadLabels;

    const seen = applyRun(base, runId, offers, { closeMissing: record.coverageComplete, closeSource: 'francetravail' });
    const c = record.counters;
    c.newOffers = seen.newOffers;
    c.closed = seen.closed;
    c.reopened = seen.reopened;
    for (const o of offers) {
      if (o.role !== NON_CLASSE) c.classified += 1;
      if (o.salary.source === 'declared') c.salaryDeclared += 1;
      if (o.salary.source === 'predicted') c.salaryPredicted += 1;
      if (o.tjm && o.tjm.min !== null) c.tjm += 1;
      if (o.location.lat === null || o.location.lng === null) c.noCoordinates += 1;
      if (o.location.region === null) c.noRegion += 1;
      if (o.dedup.duplicateOf !== null) c.duplicates += 1;
    }

    await setGzipJsonLines(stores.offers, offersKey(runId), offers);
    await setGzipJson(stores.index, SEEN_KEY, seen.index);
    log('process.offers', { runId, ...c });

    const taxonomyHistory = await updateTaxonomyHistory(stores, taxonomy);
    const { latest, stock } = await loadAllOffers(stores);
    const records = (await loadProcessRecords(stores.state)).map((r) => (r.runId === runId ? record : r));
    record.status = 'complete';
    const files = computeAggregates({
      offers: latest.values(),
      stock: stock.toTable(),
      records,
      taxonomy,
      firstRun: seen.index.firstRun ?? runId,
      lastRun: runId,
      taxonomyHistory,
      generatedAt: nowIso(),
    });
    const sizes = await writeAggregates(stores.aggregates, files);
    log('process.aggregates', { runId, offers: latest.size, sizes });

    // `quality.json` réécrit avec la durée complète du traitement de ce run.
    record.finishedAt = nowIso();
    record.durationMs = clock.now() - started;
    await writeAggregates(stores.aggregates, { 'quality.json': quality(records) });
  } catch (error) {
    record.status = 'failed';
    record.error = error instanceof Error ? error.message : String(error);
    log('process.failed', { runId, message: record.error });
    throw error;
  } finally {
    record.finishedAt ??= nowIso();
    record.durationMs ??= clock.now() - started;
    await saveProcessRecord(stores.state, record);
    log('process.end', { runId, status: record.status, durationMs: record.durationMs });
  }
  return record;
}
