import { describe, expect, it } from 'vitest';
import { addWeeks, isRunId, monthOf, runIdFor, weekStart } from '../src/pipeline/runId';

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

describe('arithmétique des semaines ISO', () => {
  it('donne le lundi d’une semaine', () => {
    expect(weekStart('2026-W40').toISOString()).toBe('2026-09-28T00:00:00.000Z');
    expect(weekStart('2026-W01').toISOString()).toBe('2025-12-29T00:00:00.000Z');
    expect(weekStart('2026-W53').toISOString()).toBe('2026-12-28T00:00:00.000Z');
  });

  it('avance et recule d’un nombre de semaines, en changeant d’année', () => {
    expect(addWeeks('2026-W40', 1)).toBe('2026-W41');
    expect(addWeeks('2026-W40', -11)).toBe('2026-W29');
    expect(addWeeks('2026-W53', 1)).toBe('2027-W01');
    expect(addWeeks('2026-W01', -1)).toBe('2025-W52');
  });

  it('donne le mois d’un instant à Paris', () => {
    expect(monthOf('2026-09-30T21:59:59.000Z')).toBe('2026-09');
    expect(monthOf('2026-09-30T22:30:00.000Z')).toBe('2026-10');
  });
});
