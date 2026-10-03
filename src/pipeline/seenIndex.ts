import type { Offer, SourceId } from '../core/offer';
import { getGzipJson, setGzipJson, type BlobStore } from '../storage/store';
import { runIdFor } from './runId';

// Index des offres vues (SPEC.md §3.4, §6.9) : nouveauté, disparition, premier run.

export const SEEN_KEY = 'seen.json.gz';

/** Copie de l'index avant le traitement d'un run : une relance repart du même état. */
export function seenSnapshotKey(runId: string): string {
  return `seen-before/${runId}.json.gz`;
}

export interface SeenEntry {
  source: SourceId;
  firstSeenRun: string;
  lastSeenRun: string;
  createdAt: string;
  /** Première semaine où l'offre n'apparaît plus (France Travail) ; `null` tant qu'elle est vue. */
  closedRun: string | null;
}

export interface SeenIndex {
  version: 1;
  /** Premier run traité : les offres qu'il découvre et créées avant sont du rattrapage. */
  firstRun: string | null;
  lastRun: string | null;
  entries: Record<string, SeenEntry>;
}

export function emptySeenIndex(): SeenIndex {
  return { version: 1, firstRun: null, lastRun: null, entries: {} };
}

/**
 * Index de départ du traitement de `runId` : la copie prise avant un premier traitement de ce
 * run s'il y en a une (relance), sinon l'index courant, copié pour les relances. Refuse un run
 * plus ancien que le dernier traité, qui effacerait les suivants.
 */
export async function loadSeenIndexFor(store: BlobStore, runId: string): Promise<SeenIndex> {
  const current = (await getGzipJson<SeenIndex>(store, SEEN_KEY)) ?? emptySeenIndex();
  if (current.lastRun !== null && current.lastRun > runId) {
    throw new Error(`run ${runId} plus ancien que le dernier run traité (${current.lastRun}) : traitement refusé`);
  }
  const snapshot = await getGzipJson<SeenIndex>(store, seenSnapshotKey(runId));
  if (snapshot) return snapshot;
  await setGzipJson(store, seenSnapshotKey(runId), current);
  return current;
}

export interface SeenUpdate {
  index: SeenIndex;
  /** Offres vues pour la première fois à ce run. */
  newOffers: number;
  /** Offres fermées à ce run (vues avant, absentes maintenant). */
  closed: number;
  /** Offres fermées puis revues, rouvertes. */
  reopened: number;
}

/**
 * Applique un run à l'index (SPEC.md §6.9) et complète les champs de suivi des offres :
 * `firstSeenRun`, `lastSeenRun`, `closedRun` et `isBackfill` (découverte au premier run alors
 * que créée une semaine antérieure).
 *
 * `closeMissing` : les offres de `closeSource` vues avant et absentes de ce run sont fermées
 * (`closedRun = runId`). À n'activer que si la collecte est complète, sinon une absence peut
 * venir d'une partition manquante.
 */
export function applyRun(
  base: SeenIndex,
  runId: string,
  offers: Offer[],
  options: { closeMissing: boolean; closeSource: SourceId },
): SeenUpdate {
  const firstRun = base.firstRun ?? runId;
  const entries: Record<string, SeenEntry> = { ...base.entries };
  let newOffers = 0;
  let reopened = 0;
  const present = new Set<string>();

  for (const offer of offers) {
    present.add(offer.uid);
    const previous = entries[offer.uid];
    if (!previous) newOffers += 1;
    else if (previous.closedRun !== null) reopened += 1;
    const entry: SeenEntry = {
      source: offer.source,
      firstSeenRun: previous?.firstSeenRun ?? runId,
      lastSeenRun: runId,
      createdAt: offer.createdAt,
      closedRun: null,
    };
    entries[offer.uid] = entry;
    offer.firstSeenRun = entry.firstSeenRun;
    offer.lastSeenRun = runId;
    offer.closedRun = null;
    offer.isBackfill = entry.firstSeenRun === firstRun && runIdFor(new Date(offer.createdAt)) < firstRun;
  }

  let closed = 0;
  if (options.closeMissing) {
    for (const [uid, entry] of Object.entries(entries)) {
      if (entry.source !== options.closeSource || entry.closedRun !== null || present.has(uid)) continue;
      entries[uid] = { ...entry, closedRun: runId };
      closed += 1;
    }
  }

  return { index: { version: 1, firstRun, lastRun: runId, entries }, newOffers, closed, reopened };
}
