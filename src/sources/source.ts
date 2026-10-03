import type { Offer, SourceId } from '../core/offer';
import type { Logger } from '../pipeline/log';
import type { PartitionStatus, StepState } from '../pipeline/runState';
import type { Stores } from '../storage/store';
import type { Clock } from './http';

export interface CollectContext {
  stores: Stores;
  log: Logger;
  clock?: Clock;
  /** Échéance (ms epoch) : au-delà, le collecteur enregistre son état et rend la main (§12). */
  deadline?: number;
  /** Repart de zéro : efface l'état et les données brutes du run pour cette source. */
  reset?: boolean;
}

export interface CollectReport {
  source: SourceId;
  runId: string;
  status: StepState['status'];
  invocations: number;
  partitions: Record<PartitionStatus | 'total', number>;
  /** Offres écrites dans `raw`, au total et par passe (doublons entre partitions inclus). */
  offersWritten: number;
  offersByPass: Record<string, number>;
  truncatedPartitions: number;
  apiCalls: number;
  retries: number;
  durationMs: number;
  errors: { partition: string | null; message: string }[];
}

/** Interface commune des sources (SPEC.md §4.3), exigée dès le lot 1. */
export interface Source {
  id: SourceId;
  /** Écrit les réponses dans le store `raw` ; reprend là où l'état du run s'est arrêté. */
  collect(runId: string, ctx: CollectContext): Promise<CollectReport>;
  /** Offres normalisées (§6.1) d'un objet de `raw` (lot 2). */
  normalize(raw: unknown, runId: string): Offer[];
}

export function collectReport(source: SourceId, state: StepState): CollectReport {
  const count = (status: PartitionStatus) => state.partitions.filter((p) => p.status === status).length;
  const done = state.partitions.filter((p) => p.status === 'done');
  const offersByPass: Record<string, number> = {};
  for (const p of done) offersByPass[p.pass] = (offersByPass[p.pass] ?? 0) + (p.written ?? 0);
  return {
    source,
    runId: state.runId,
    status: state.status,
    invocations: state.invocations,
    partitions: {
      total: state.partitions.length,
      pending: count('pending'),
      done: count('done'),
      split: count('split'),
      failed: count('failed'),
    },
    offersWritten: done.reduce((sum, p) => sum + (p.written ?? 0), 0),
    offersByPass,
    truncatedPartitions: state.partitions.filter((p) => p.truncated).length,
    apiCalls: state.counters.apiCalls,
    retries: state.counters.retries,
    durationMs: state.counters.durationMs,
    errors: state.errors.slice(-20).map(({ partition, message }) => ({ partition, message })),
  };
}
