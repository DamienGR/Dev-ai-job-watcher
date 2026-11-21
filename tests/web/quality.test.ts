import { describe, expect, it } from 'vitest';
import { fmtDuration, qualityRows } from '../../web/src/lib/quality';

// Lignes de `quality.json` lues par la page Méthodologie et la page « Données & qualité ».

describe('qualité des runs', () => {
  const table = {
    columns: ['run', 'source', 'retained', 'durationMs'],
    rows: [
      ['2026-W46', 'francetravail', 3495, 11803],
      ['2026-W47', 'francetravail', 3410, 12849],
      ['2026-W47', 'adzuna', 120, 900],
    ],
  };

  it('range les runs du plus récent au plus ancien, pour une source', () => {
    expect(qualityRows(table, 'francetravail').map((r) => [r.run, r.retained])).toEqual([
      ['2026-W47', 3410],
      ['2026-W46', 3495],
    ]);
    expect(qualityRows(table)).toHaveLength(3);
  });

  it('donne la durée en secondes, au dixième, à la française', () => {
    expect(fmtDuration(12849)).toBe('12,8 s');
    expect(fmtDuration(9000)).toBe('9 s');
  });
});
