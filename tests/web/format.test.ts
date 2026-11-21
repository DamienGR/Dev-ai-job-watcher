import { describe, expect, it } from 'vitest';
import { fmtDelta, fmtDeltaPct, fmtEuro, fmtInt, fmtPct, fmtSalary, MASKED, orMasked, shareOf } from '../../web/src/lib/format';
import { journalRows } from '../../web/src/lib/journal';
import { dateLongLabel, monthOfWeek, monthRange, partialRanges, weekLabel, weekOfDate, weekRange, lastWeeks } from '../../web/src/lib/periods';

/** Espaces insécables de fr-FR remplacées par des espaces simples. */
const plain = (text: string) => text.replace(/[\u202f\u00a0]/g, ' ');

describe('règle n < 5 et mise en forme (SPEC.md §8.3)', () => {
  it('masque une part dont le dénominateur est sous 5', () => {
    expect(shareOf(2, 4)).toBeNull();
    expect(shareOf(1, 5)).toBe(0.2);
    expect(orMasked(null, fmtPct)).toBe(MASKED);
    expect(MASKED).toBe('n < 5');
  });

  it('met en forme à la française', () => {
    expect(plain(fmtInt(12345))).toBe('12 345');
    expect(plain(fmtPct(0.125))).toBe('12,5 %');
    expect(plain(fmtDeltaPct(-0.5))).toBe('−50 %');
    expect(plain(fmtDeltaPct(2.21))).toBe('+221 %');
    expect(fmtDelta(3)).toBe('+3');
    expect(plain(fmtDelta(-1.25, 1))).toBe('−1,3');
    expect(plain(fmtSalary(42_500))).toBe('42,5 k€');
    expect(plain(fmtEuro(550))).toBe('550 €');
  });
});

describe('périodes', () => {
  it('rattache une semaine au mois de son jeudi et parcourt les années', () => {
    expect(monthOfWeek('2026-W40')).toBe('2026-10');
    expect(monthOfWeek('2026-W01')).toBe('2026-01');
    expect(weekRange('2025-W52', '2026-W02')).toEqual(['2025-W52', '2026-W01', '2026-W02']);
    expect(lastWeeks('2026-W02', 3)).toEqual(['2025-W52', '2026-W01', '2026-W02']);
    expect(monthRange('2025-11', '2026-02')).toEqual(['2025-11', '2025-12', '2026-01', '2026-02']);
    expect(plain(weekLabel('2026-W40'))).toBe('28 sept.');
    expect(weekOfDate('2026-10-03', ['2026-W39', '2026-W40'])).toBe('2026-W40');
    expect(weekOfDate('2026-10-05', ['2026-W39', '2026-W40'])).toBeNull();
  });

  it('regroupe les périodes partielles contiguës', () => {
    expect(partialRanges([true, true, false, true, false, false, true])).toEqual([[0, 1], [3, 3], [6, 6]]);
    expect(partialRanges([false, false])).toEqual([]);
  });
});

describe('journal de la taxonomie (lot 6)', () => {
  const versions = [5, 4, 3, 2, 1].map((version) => ({ version, date: `2026-1${version % 2}-0${version}` }));
  const effect = { run: '2026-W49', before: { classified: 1700, retained: 3000 }, after: { classified: 1850, retained: 3010 } };

  it('distingue versions d’avant le premier run, premières données, reclassement et attente', () => {
    const history = [
      { version: 3, date: '2026-10-03' },
      { version: 5, date: '2026-12-01', appliedAt: '2026-12-02', effect },
    ];
    expect(journalRows(versions, history)).toEqual([
      { version: 5, status: 'appliquee', appliedAt: '2026-12-02', effect },
      // v4 et v5 fusionnées avant le même reclassement : v4 n'a jamais été appliquée seule.
      { version: 4, status: 'incluse', appliedAt: null, effect: null },
      { version: 3, status: 'premier', appliedAt: null, effect: null },
      { version: 2, status: 'avant', appliedAt: null, effect: null },
      { version: 1, status: 'avant', appliedAt: null, effect: null },
    ]);
  });

  it('montre une version fusionnée en attente du reclassement de la nuit', () => {
    const rows = journalRows(versions.slice(1), [{ version: 3, date: '2026-10-03' }]);
    expect(rows.map((r) => r.status)).toEqual(['attente', 'premier', 'avant', 'avant']);
  });

  it('date en toutes lettres', () => {
    expect(dateLongLabel('2026-10-03')).toBe('3 octobre 2026');
  });
});
