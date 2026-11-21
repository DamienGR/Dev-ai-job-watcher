import type { TaxonomyHistoryEntry } from './types';

// État de chaque version de la taxonomie pour la page « Journal de la taxonomie » (SPEC.md
// §17.2, lot 6) : les versions viennent de TAXONOMY_CHANGELOG.md (au build), leur application
// aux données de `meta.taxonomyHistory` (lu en direct).

export interface JournalVersion {
  version: number;
  date: string;
}

/**
 * - `premier` : version des premières données ;
 * - `appliquee` : appliquée à tout l'historique par un reclassement ;
 * - `incluse` : fusionnée puis remplacée par une version suivante avant tout reclassement ;
 * - `avant` : antérieure au premier run, jamais appliquée ;
 * - `attente` : fusionnée, reclassement pas encore fait (la nuit qui suit la fusion).
 */
export type JournalStatus = 'premier' | 'appliquee' | 'incluse' | 'avant' | 'attente';

export interface JournalRow {
  version: number;
  status: JournalStatus;
  /** Jour du reclassement (`appliquee`). */
  appliedAt: string | null;
  effect: TaxonomyHistoryEntry['effect'] | null;
}

export function journalRows(versions: readonly JournalVersion[], history: readonly TaxonomyHistoryEntry[]): JournalRow[] {
  const applied = [...history].sort((a, b) => a.version - b.version);
  const first = applied[0];
  const last = applied.at(-1);
  return versions.map(({ version }) => {
    const row = (status: JournalStatus, entry?: TaxonomyHistoryEntry): JournalRow => ({
      version,
      status,
      appliedAt: status === 'appliquee' ? (entry?.appliedAt ?? entry?.date ?? null) : null,
      effect: status === 'appliquee' ? (entry?.effect ?? null) : null,
    });
    const entry = applied.find((e) => e.version === version);
    if (entry) return row(entry === first ? 'premier' : 'appliquee', entry);
    if (!first || !last || version > last.version) return row('attente');
    return row(version < first.version ? 'avant' : 'incluse');
  });
}
