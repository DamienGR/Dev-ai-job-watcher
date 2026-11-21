import { getJson, setJson, type BlobStore } from '../storage/store';
import type { StepState } from './runState';
import { stepStateKey } from './runState';

// Compte rendu du traitement d'un run (`state/runs/{runId}/process.json`), source de
// `quality.json` (SPEC.md §7.1, indicateur 13).

export interface ProcessCounters {
  /** Offres lues dans `raw`, doublons entre partitions inclus. */
  read: number;
  /** Offres distinctes trouvées par passe (une offre peut figurer dans les deux). */
  collectedA: number;
  collectedB: number;
  /** Offres distinctes après dédoublonnage intra-source (par `uid`). */
  distinct: number;
  invalid: number;
  /** Offres localisées hors de France, écartées (SPEC.md §6.2). */
  abroad: number;
  /** Offres de la seule passe B hors des groupes IA, écartées (règle de rétention, §4.1). */
  droppedRetention: number;
  retained: number;
  newOffers: number;
  closed: number;
  reopened: number;
  classified: number;
  salaryDeclared: number;
  salaryOutOfBounds: number;
  /** Salaires prédits (Adzuna), exclus des statistiques ; 0 pour France Travail. */
  salaryPredicted: number;
  tjm: number;
  /** Offres sans coordonnées (absentes de la carte). */
  noCoordinates: number;
  /** Offres sans région (comptées au seul niveau national). */
  noRegion: number;
  /** Doublons inter-sources (lot 3). */
  duplicates: number;
}

export interface ProcessRecord {
  runId: string;
  step: 'process';
  status: 'running' | 'complete' | 'failed';
  startedAt: string;
  finishedAt: string | null;
  durationMs: number | null;
  taxonomyVersion: number;
  /** État de la collecte France Travail au moment du traitement. */
  collect: {
    status: StepState['status'];
    partitions: number;
    truncatedPartitions: number;
    failedPartitions: number;
    apiCalls: number;
    retries: number;
    errors: number;
    durationMs: number;
  };
  /** Collecte complète et sans partition tronquée : les absences valent disparition. */
  coverageComplete: boolean;
  counters: ProcessCounters;
  /** Libellés les plus fréquents des offres écartées comme étrangères (supervision). */
  abroadLabels: Record<string, number>;
  error: string | null;
  /** Dernier reclassement de tout l'historique (SPEC.md §9.3) ; les durées restent celles du run. */
  reclassifiedAt?: string;
}

export function processRecordKey(runId: string): string {
  return stepStateKey(runId, 'process');
}

export async function loadProcessRecord(store: BlobStore, runId: string): Promise<ProcessRecord | null> {
  return getJson<ProcessRecord>(store, processRecordKey(runId));
}

export async function saveProcessRecord(store: BlobStore, record: ProcessRecord): Promise<void> {
  await setJson(store, processRecordKey(record.runId), record);
}

/** Comptes rendus de tous les runs traités, par run croissant. */
export async function loadProcessRecords(store: BlobStore): Promise<ProcessRecord[]> {
  const keys = (await store.list('runs/')).filter((key) => key.endsWith('/process.json'));
  const records = await Promise.all(keys.map((key) => getJson<ProcessRecord>(store, key)));
  return records.filter((r): r is ProcessRecord => r !== null).sort((a, b) => (a.runId < b.runId ? -1 : 1));
}
