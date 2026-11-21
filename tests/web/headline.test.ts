import { describe, expect, it } from 'vitest';
import { DEFAULT_FILTERS, scopeOf } from '../../web/src/lib/filters';
import { fmtInt, fmtPct, MASKED } from '../../web/src/lib/format';
import { fmtPremium, fmtRoleMove, fmtTechMove, headline, headlineFigures } from '../../web/src/lib/headline';
import { activeEmergingRoles, aiShare, newOffersTile, scopedNewOffers, type NewOfferRow, type PremiumRow } from '../../web/src/lib/indicators';
import { lastWeeks } from '../../web/src/lib/periods';
import { trendPoints, xPercent } from '../../web/src/lib/trend';
import { makeMeta } from './helpers';

// Chiffres de l'accueil (SPEC.md §17.2, §17.4) : identiques aux tuiles de la vue d'ensemble du
// tableau de bord avec ses filtres par défaut.

const meta = makeMeta({ backfillBefore: '2026-W30', firstRun: '2026-W30' });
const scope = scopeOf(meta, DEFAULT_FILTERS);

function offers(week: string, role: string, n: number, extra: Partial<NewOfferRow> = {}): NewOfferRow {
  return { week, role, region: '11', source: 'francetravail', contract: 'cdi', aiAny: false, n, ...extra };
}

const rows: NewOfferRow[] = [
  ...lastWeeks('2026-W40', 5).flatMap((w, i) => [offers(w, 'dev_backend', 10 + i), offers(w, 'ai_engineer', 3), offers(w, 'support_it', 50)]),
  offers('2026-W40', 'data_engineer', 4, { region: '53' }),
  offers('2026-W40', 'non_classe', 20),
];
const premiumRows: PremiumRow[] = [
  { month: '2026-09', experience: '*', nAi: 6, p50Ai: 60_000, nDev: 8, p50Dev: 50_000, premium: 10_000 },
  { month: '*', experience: '*', nAi: 12, p50Ai: 55_500, nDev: 40, p50Dev: 47_200, premium: 8_300 },
  { month: '*', experience: '1_3', nAi: 5, p50Ai: 48_000, nDev: 9, p50Dev: 41_000, premium: 7_000 },
];

describe('chiffres de tête communs à l’accueil et au tableau de bord', () => {
  it('reprend les calculs des tuiles de la vue d’ensemble', () => {
    const result = headline(meta, rows, scope, premiumRows);
    const anyGroup = rows.filter((r) => scope.rowOk(r));
    const week = newOffersTile(scopedNewOffers(rows, scope), meta);
    expect(result.week).toEqual(week);
    expect(result.ai).toEqual(aiShare(anyGroup, meta, scope.groupOf, [week.week]));
    expect(result.emerging).toEqual(activeEmergingRoles(anyGroup, meta, lastWeeks(week.week, 4)));
    expect(result.premium).toBe(premiumRows[1]);
  });

  it('compte la semaine de référence dans le périmètre g1 à g8, sans élargi ni non classés', () => {
    const { week, ai, emerging } = headline(meta, rows, scope, premiumRows);
    expect(week.week).toBe('2026-W40');
    expect(week.n).toBe(14 + 3 + 4);
    expect(ai).toEqual({ part: 3, total: 21, share: 3 / 21 });
    expect(emerging).toEqual({ active: ['ai_engineer'], total: 2 });
  });

  it('met en forme les quatre chiffres comme les tuiles', () => {
    const figures = headlineFigures(headline(meta, rows, scope, premiumRows));
    expect(figures.map((f) => [f.id, f.value])).toEqual([
      ['offres', fmtInt(21)],
      ['part-ia', fmtPct(3 / 21)],
      ['prime-ia', '+8,3 k€'],
      ['emergents', '1 / 2'],
    ]);
    expect(figures[0]!.detail).toContain('semaine 40');
    expect(figures[1]!.detail).toBe('3 offres en IA sur n = 21, même semaine');
    expect(figures[2]!.detail).toContain('IA 55,5 k€ (n = 12), dev 47,2 k€ (n = 40)');
    expect(figures.every((f) => !f.partial)).toBe(true);
  });

  it('masque sous 5 observations et signale les semaines partielles (SPEC.md §8.3)', () => {
    const fresh = makeMeta();
    const few = [offers('2026-W40', 'ai_engineer', 1), offers('2026-W40', 'dev_backend', 2)];
    const figures = headlineFigures(headline(fresh, few, scopeOf(fresh, DEFAULT_FILTERS), [{ ...premiumRows[1]!, premium: null, p50Ai: null }]));
    expect(figures.find((f) => f.id === 'part-ia')!.value).toBe(MASKED);
    expect(figures.find((f) => f.id === 'prime-ia')!.value).toBe(MASKED);
    expect(figures.find((f) => f.id === 'prime-ia')!.detail).toContain(`IA ${MASKED}`);
    expect(figures.find((f) => f.id === 'offres')!.partial).toBe(true);
  });

  it('partage la mise en forme de la prime et de « ce qui bouge »', () => {
    expect(fmtPremium(null)).toBe(MASKED);
    expect(fmtPremium({ ...premiumRows[1]!, premium: -1_250 })).toBe('−1,3 k€');
    expect(fmtRoleMove({ id: 'x', previous: 20, recent: 32, delta: 12 })).toBe('+12 (20 → 32)');
    expect(fmtTechMove({ id: 'x', previous: 0.03, recent: 0.042, delta: 0.012 })).toBe('+1,2 pt (3 % → 4,2 %)');
  });
});

describe('mini-courbe de l’accueil', () => {
  it('place les semaines sur toute la largeur et le maximum à 90 % de la hauteur', () => {
    expect([0, 1, 2].map((i) => xPercent(i, 3))).toEqual([0, 50, 100]);
    expect(xPercent(0, 1)).toBe(50);
    const points = trendPoints([0, 50, 100]);
    expect(points.map(([x]) => x)).toEqual([0, 300, 600]);
    expect(points.map(([, y]) => y)).toEqual([160, 88, 16]);
    expect(trendPoints([0, 0]).map(([, y]) => y)).toEqual([160, 160]);
  });
});
