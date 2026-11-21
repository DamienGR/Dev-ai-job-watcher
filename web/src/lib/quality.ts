import { rowsOf } from './table';
import type { Table } from './types';

// Lignes de `quality.json` (SPEC.md §7.1, indicateur 13), lues par la page « Données & qualité »
// du tableau de bord et par la page Méthodologie du site.

export interface QualityRow {
  run: string;
  source: string;
  status: string;
  collectStatus: string;
  coverageComplete: boolean;
  apiCalls: number;
  errors: number;
  truncatedPartitions: number;
  failedPartitions: number;
  read: number;
  collectedA: number;
  collectedB: number;
  distinct: number;
  abroad: number;
  droppedRetention: number;
  retained: number;
  newOffers: number;
  closed: number;
  classified: number;
  salaryDeclared: number;
  salaryPredicted: number;
  tjm: number;
  noCoordinates: number;
  noRegion: number;
  duplicates: number;
  durationMs: number;
}

export const RUN_STATUS: Record<string, string> = { complete: 'complet', partial: 'partiel', failed: 'en échec', running: 'en cours' };

/** Lignes d'une source, du run le plus récent au plus ancien. */
export function qualityRows(table: Table, source?: string): QualityRow[] {
  return rowsOf<QualityRow>(table)
    .filter((r) => source === undefined || r.source === source)
    .sort((a, b) => b.run.localeCompare(a.run));
}

/** Durée d'un run en secondes, au dixième (« 12,8 s »). */
export function fmtDuration(ms: number): string {
  return `${(Math.round(ms / 100) / 10).toLocaleString('fr-FR')} s`;
}
