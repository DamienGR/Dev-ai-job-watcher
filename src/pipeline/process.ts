import type { Offer } from '../core/offer';
import { NON_CLASSE, type CompiledTaxonomy } from '../core/taxonomy';
import type { FtRawPartition } from '../sources/francetravail/collect';
import { emptyNormalizeStats, normalizeFtPartition } from '../sources/francetravail/normalize';
import { systemClock, type Clock } from '../sources/http';
import { getGzipJson, getGzipJsonLines, getJson, setGzipJson, setGzipJsonLines, setJson, type Stores } from '../storage/store';
import {
  computeAggregates,
  quality,
  reviewMonths,
  StockCounter,
  toAggregateOffer,
  writeAggregates,
  type AggregateOffer,
  type OfferText,
  type TaxonomyHistoryEntry,
} from './aggregates';
import { datePeriods } from './aggregates/context';
import type { Logger } from './log';
import {
  loadProcessRecord,
  loadProcessRecords,
  saveProcessRecord,
  type ProcessCounters,
  type ProcessRecord,
} from './processRecord';
import { loadStepState } from './runState';
import { applyRun, emptySeenIndex, loadSeenIndexFor, SEEN_KEY, seenSnapshotKey, type SeenIndex } from './seenIndex';

// Traitement d'un run (SPEC.md §6, §7) : normalisation, dédoublonnage intra-source, règle de
// rétention, index `seen`, offres de la semaine, agrégats. Reclassement de tout l'historique
// quand la taxonomie change (§9.3, lot 6). Indépendant de l'endroit où il tourne : appelé par
// les scripts du VPS comme par les tests.

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

/** Version de la taxonomie appliquée aux données, `null` avant le premier traitement. */
export async function dataTaxonomyVersion(stores: Stores): Promise<number | null> {
  return (await getJson<TaxonomyVersionState>(stores.state, TAXONOMY_VERSION_KEY))?.version ?? null;
}

/**
 * Relit `offers/*` : dernière version de chaque offre, stock actif de chaque run, et texte des
 * offres créées dans les mois de revue (SPEC.md §9.1), les seuls textes gardés en mémoire.
 */
async function loadAllOffers(
  stores: Stores,
  textMonths: ReadonlySet<string>,
): Promise<{ latest: Map<string, AggregateOffer>; stock: StockCounter; texts: Map<string, OfferText> }> {
  const latest = new Map<string, AggregateOffer>();
  const stock = new StockCounter();
  const texts = new Map<string, OfferText>();
  const periods = datePeriods();
  const keys = (await stores.offers.list('')).filter((key) => key.endsWith('.jsonl.gz')).sort();
  for (const key of keys) {
    const runId = key.slice(0, -'.jsonl.gz'.length);
    for (const offer of (await getGzipJsonLines<Offer>(stores.offers, key)) ?? []) {
      const slim = toAggregateOffer(offer);
      stock.add(runId, slim);
      latest.set(slim.uid, slim);
      if (textMonths.has(periods(offer.createdAt).month)) texts.set(offer.uid, { title: offer.title, description: offer.description });
    }
  }
  return { latest, stock, texts };
}

/** Recalcule et écrit tous les agrégats (SPEC.md §7.2) et les revues mensuelles (§9.1). */
async function refreshAggregates(
  stores: Stores,
  input: { taxonomy: CompiledTaxonomy; records: ProcessRecord[]; firstRun: string; lastRun: string; taxonomyHistory: TaxonomyHistoryEntry[]; generatedAt: string },
): Promise<{ offers: number; sizes: Record<string, number> }> {
  const { latest, stock, texts } = await loadAllOffers(stores, new Set(reviewMonths(input.lastRun)));
  const files = computeAggregates({ ...input, offers: latest.values(), stock: stock.toTable(), texts });
  return { offers: latest.size, sizes: await writeAggregates(stores.aggregates, files) };
}

/**
 * Classe les offres d'un run à partir de `raw` et les applique à l'index `base` : écrit
 * `offers/<run>`, remplit les compteurs du compte rendu et renvoie l'index après le run.
 */
async function applyRunOffers(
  stores: Stores,
  runId: string,
  taxonomy: CompiledTaxonomy,
  base: SeenIndex,
  record: ProcessRecord,
): Promise<SeenIndex> {
  record.counters = emptyCounters();
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
  return seen.index;
}

/**
 * Traite un run déjà collecté. Rejouable : une relance repart de la copie de l'index prise
 * avant le premier traitement du run et réécrit les mêmes clés. Refuse un run dont la
 * collecte est absente ou en cours, ou plus ancien que le dernier run traité. Si la taxonomie
 * a changé depuis le dernier traitement, tout l'historique est d'abord reclassé (§9.3) : un
 * run n'est jamais classé avec une autre version que les précédents.
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
  const dataVersion = await dataTaxonomyVersion(stores);
  if (dataVersion !== null && dataVersion !== taxonomy.version) {
    log('process.reclassify-first', { runId, from: dataVersion, to: taxonomy.version });
    await reclassifyAll(options);
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
    const index = await applyRunOffers(stores, runId, taxonomy, base, record);
    await setGzipJson(stores.index, SEEN_KEY, index);
    log('process.offers', { runId, ...record.counters });

    const taxonomyHistory = await updateTaxonomyHistory(stores, taxonomy);
    const records = (await loadProcessRecords(stores.state)).map((r) => (r.runId === runId ? record : r));
    record.status = 'complete';
    const { offers, sizes } = await refreshAggregates(stores, {
      taxonomy,
      records,
      firstRun: index.firstRun ?? runId,
      lastRun: runId,
      taxonomyHistory,
      generatedAt: nowIso(),
    });
    log('process.aggregates', { runId, offers, sizes });

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

export interface ReclassifyReport {
  /** Version des données avant le reclassement (`null` : aucune), et après. */
  from: number | null;
  to: number;
  runs: string[];
  /** Classement du dernier run avant et après. */
  effect: TaxonomyHistoryEntry['effect'] | null;
  durationMs: number;
}

const parisDay = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit' });

/**
 * Reclassement complet (SPEC.md §9.3, D66) : rejoue depuis `raw`, dans l'ordre, chaque run
 * traité avec succès, avec la taxonomie courante et un index `seen` repris de zéro (la règle de
 * rétention dépend du classement, donc aussi la nouveauté et les fermetures). Réécrit
 * `offers/*`, l'index et ses copies, les comptes rendus (durées d'origine gardées), puis les
 * agrégats ; ajoute la version à `state/taxonomy-version` avec son effet sur le dernier run.
 * Rejouable : interrompu, il reprend tout au lancement suivant, la version des données n'étant
 * enregistrée qu'à la fin.
 */
export async function reclassifyAll(options: ProcessOptions): Promise<ReclassifyReport> {
  const { stores, log, taxonomy, clock = systemClock } = options;
  const started = clock.now();
  const nowIso = () => new Date(clock.now()).toISOString();
  const state = await getJson<TaxonomyVersionState>(stores.state, TAXONOMY_VERSION_KEY);
  const from = state?.version ?? null;
  const replayed = (await loadProcessRecords(stores.state)).filter((r) => r.status === 'complete');
  log('reclassify.start', { from, to: taxonomy.version, runs: replayed.map((r) => r.runId) });

  const last = replayed.at(-1);
  if (!last) {
    log('reclassify.end', { from, to: taxonomy.version, runs: 0 });
    return { from, to: taxonomy.version, runs: [], effect: null, durationMs: clock.now() - started };
  }
  const before = { classified: last.counters.classified, retained: last.counters.retained };

  let index = emptySeenIndex();
  for (const record of replayed) {
    await setGzipJson(stores.index, seenSnapshotKey(record.runId), index);
    index = await applyRunOffers(stores, record.runId, taxonomy, index, record);
    record.taxonomyVersion = taxonomy.version;
    record.reclassifiedAt = nowIso();
    await saveProcessRecord(stores.state, record);
    const { retained, classified, newOffers, closed } = record.counters;
    log('reclassify.run', { runId: record.runId, retained, classified, newOffers, closed });
  }
  // Copies d'index de runs plus récents, jamais menés au bout : prises avec l'ancien classement.
  for (const key of await stores.index.list('seen-before/')) {
    if (key.slice('seen-before/'.length, -'.json.gz'.length) > last.runId) await stores.index.delete(key);
  }
  await setGzipJson(stores.index, SEEN_KEY, index);

  const effect = { run: last.runId, before, after: { classified: last.counters.classified, retained: last.counters.retained } };
  const history = (state?.history ?? []).filter((h) => from === taxonomy.version || h.version !== taxonomy.version);
  if (from !== taxonomy.version) {
    history.push({ version: taxonomy.version, date: taxonomy.source.updated, appliedAt: parisDay.format(new Date(clock.now())), effect });
    history.sort((a, b) => a.version - b.version);
  }
  await setJson(stores.state, TAXONOMY_VERSION_KEY, { version: taxonomy.version, history } satisfies TaxonomyVersionState);

  const records = await loadProcessRecords(stores.state);
  const { offers, sizes } = await refreshAggregates(stores, {
    taxonomy,
    records,
    firstRun: index.firstRun ?? last.runId,
    lastRun: last.runId,
    taxonomyHistory: history,
    generatedAt: nowIso(),
  });
  const durationMs = clock.now() - started;
  log('reclassify.end', { from, to: taxonomy.version, runs: replayed.length, offers, sizes, effect, durationMs });
  return { from, to: taxonomy.version, runs: replayed.map((r) => r.runId), effect, durationMs };
}
