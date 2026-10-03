import { describe, expect, it } from 'vitest';
import { isRunId, runIdFor } from '../src/pipeline/runId';

describe('identifiant de run : semaine ISO, Europe/Paris (SPEC.md §3.3)', () => {
  it.each([
    ['2026-10-05T05:00:00Z', '2026-W41'], // lundi du premier run
    ['2026-10-04T21:59:59Z', '2026-W40'], // dimanche 23 h 59 à Paris
    ['2026-10-04T22:30:00Z', '2026-W41'], // lundi 0 h 30 à Paris, encore dimanche en UTC
    ['2026-01-01T12:00:00Z', '2026-W01'],
    ['2027-01-01T12:00:00Z', '2026-W53'],
    ['2024-12-30T12:00:00Z', '2025-W01'],
  ])('%s → %s', (date, runId) => {
    expect(runIdFor(new Date(date))).toBe(runId);
  });

  it('valide le format', () => {
    expect(isRunId('2026-W41')).toBe(true);
    expect(isRunId('2026-W00')).toBe(false);
    expect(isRunId('2026-W54')).toBe(false);
    expect(isRunId('2026-41')).toBe(false);
  });
});
