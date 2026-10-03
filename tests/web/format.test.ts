import { describe, expect, it } from 'vitest';
import { fmtDelta, fmtDeltaPct, fmtEuro, fmtInt, fmtPct, fmtSalary, MASKED, orMasked, shareOf } from '../../web/src/lib/format';
import { parseInline, parseMarkdown } from '../../web/src/lib/markdown';
import { monthOfWeek, monthRange, partialRanges, weekLabel, weekOfDate, weekRange, lastWeeks } from '../../web/src/lib/periods';

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

describe('journal de la taxonomie', () => {
  it('découpe titres, paragraphes et listes, sans HTML', () => {
    const blocks = parseMarkdown('# Titre\n\nUn **mot** et `code`,\nsur deux lignes.\n\n- point [lien](x)\n  suite\n- second\n## v3 — 2026-10-03');
    expect(blocks.map((b) => b.kind)).toEqual(['heading', 'paragraph', 'list', 'heading']);
    expect(blocks[1]).toEqual({
      kind: 'paragraph',
      inlines: [{ text: 'Un ' }, { text: 'mot', bold: true }, { text: ' et ' }, { text: 'code', code: true }, { text: ', sur deux lignes.' }],
    });
    expect(blocks[2]).toEqual({ kind: 'list', items: [[{ text: 'point ' }, { text: 'lien' }, { text: ' suite' }], [{ text: 'second' }]] });
    expect(parseInline('<script>')).toEqual([{ text: '<script>' }]);
  });
});
