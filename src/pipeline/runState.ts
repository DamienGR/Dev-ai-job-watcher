import { getJson, setJson, type BlobStore } from '../storage/store';

/** Étapes d'un run, relançables par le job `admin` du VPS (SPEC.md §3.3). */
export const STEPS = ['collect-ft', 'collect-adzuna', 'process', 'reclassify'] as const;
export type StepId = (typeof STEPS)[number];

export type PartitionStatus = 'pending' | 'done' | 'split' | 'failed';

/** Une requête de collecte et son avancement : clé déterministe → réécriture sans doublon. */
export interface PartitionState {
  id: string;
  /** Id sans le découpage par dates, base des sous-partitions par dates. */
  stem: string;
  parent: string | null;
  pass: string;
  level: string;
  /** Paramètres de requête de la partition (hors pagination). */
  params: Record<string, string>;
  status: PartitionStatus;
  /** Total annoncé par l'API. */
  total: number | null;
  /** Offres écrites dans `raw`. */
  written: number | null;
  /** Total supérieur au plafond et découpage impossible : seule une partie a été lue. */
  truncated: boolean;
  attempts: number;
  error: string | null;
}

export interface StepState {
  runId: string;
  step: StepId;
  /** `complete` : tout est fait ; `incomplete` : terminé avec des partitions en échec. */
  status: 'running' | 'complete' | 'incomplete';
  /** Instant de référence du run (borne haute des découpages par dates). */
  referenceTime: string;
  createdAt: string;
  updatedAt: string;
  invocations: number;
  counters: { apiCalls: number; retries: number; durationMs: number };
  partitions: PartitionState[];
  errors: { at: string; partition: string | null; message: string }[];
}

const MAX_ERRORS = 200;

/**
 * Un objet d'état par étape (`runs/<runId>/<étape>.json`) et non un seul par run : les deux
 * collecteurs tournent en parallèle et s'écraseraient (voir docs/decisions.md).
 */
export function stepStateKey(runId: string, step: StepId): string {
  return `runs/${runId}/${step}.json`;
}

export async function loadStepState(store: BlobStore, runId: string, step: StepId): Promise<StepState | null> {
  return getJson<StepState>(store, stepStateKey(runId, step));
}

export async function saveStepState(store: BlobStore, state: StepState): Promise<void> {
  state.updatedAt = new Date().toISOString();
  if (state.errors.length > MAX_ERRORS) state.errors.splice(0, state.errors.length - MAX_ERRORS);
  await setJson(store, stepStateKey(state.runId, state.step), state);
}

export function newStepState(runId: string, step: StepId, now: Date): StepState {
  const at = now.toISOString();
  return {
    runId,
    step,
    status: 'running',
    referenceTime: at,
    createdAt: at,
    updatedAt: at,
    invocations: 0,
    counters: { apiCalls: 0, retries: 0, durationMs: 0 },
    partitions: [],
    errors: [],
  };
}
