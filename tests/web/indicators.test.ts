import { describe, expect, it } from 'vitest';
import { DEFAULT_FILTERS, scopeOf } from '../../web/src/lib/filters';
import {
  activeEmergingRoles,
  aiShare,
  applyMode,
  chartWeeks,
  hybridation,
  isPartialWeek,
  newOffersTile,
  referenceMonth,
  referenceWeek,
  regionTotals,
  roleMovers,
  roleTable,
  scopedNewOffers,
  sumSeries,
  techMovers,
  type ConditionRow,
  type NewOfferRow,
  type SalaryRow,
} from '../../web/src/lib/indicators';
import { lastWeeks } from '../../web/src/lib/periods';
import { rowsOf } from '../../web/src/lib/table';
import { makeMeta } from './helpers';

const meta = makeMeta();
const scope = scopeOf(meta, DEFAULT_FILTERS);

function offers(week: string, role: string, n: number, extra: Partial<NewOfferRow> = {}): NewOfferRow {
  return { week, role, region: '11', source: 'francetravail', contract: 'cdi', aiAny: false, n, ...extra };
}

describe('tables de faits', () => {
  it('convertit les lignes en objets et somme par clé et période', () => {
    const rows = rowsOf<{ week: string; role: string; n: number }>({ columns: ['week', 'role', 'n'], rows: [['2026-W40', 'a', 2], ['2026-W40', 'a', 3], ['2026-W41', 'b', 1], ['2026-W30', 'a', 9]] });
    expect(rows[0]).toEqual({ week: '2026-W40', role: 'a', n: 2 });
    const series = sumSeries(rows, ['2026-W40', '2026-W41'], (r) => r.week, (r) => r.role);
    expect(Object.fromEntries(series)).toEqual({ a: [5, 0], b: [0, 1] });
  });
});

describe('périodes de référence et périodes partielles', () => {
  it('prend la semaine qui précède le dernier run et le mois qui précède le sien', () => {
    expect(referenceWeek(meta)).toBe('2026-W40');
    expect(referenceMonth(meta)).toBe('2026-09');
    expect([isPartialWeek(meta, '2026-W39'), isPartialWeek(meta, '2026-W40'), isPartialWeek(meta, '2026-W41')]).toEqual([true, false, true]);
  });

  it('arrête les courbes à la semaine de référence : la semaine du dernier run n’est pas encore collectée', () => {
    expect(chartWeeks(meta, { ...DEFAULT_FILTERS, period: '3m' }, [])).toEqual(lastWeeks('2026-W40', 13));
    expect(chartWeeks(meta, { ...DEFAULT_FILTERS, period: 'all' }, ['2026-W38', '2026-W41'])).toEqual(['2026-W38', '2026-W39', '2026-W40']);
  });
});

describe('tuiles de la vue d’ensemble (SPEC.md §8.1)', () => {
  const settled = makeMeta({ backfillBefore: '2026-W30', firstRun: '2026-W30' });

  it('compare la semaine de référence à la moyenne des 4 précédentes', () => {
    const rows = [...lastWeeks('2026-W39', 4).map((w) => offers(w, 'dev_backend', 10)), offers('2026-W40', 'dev_backend', 15)];
    expect(newOffersTile(rows, settled)).toEqual({ week: '2026-W40', n: 15, mean4: 10, delta: 0.5, partial: false });
    expect(newOffersTile(rows, meta).partial).toBe(true);
  });

  it('masque l’écart quand la moyenne des 4 semaines est sous 5', () => {
    expect(newOffersTile([offers('2026-W39', 'dev_backend', 8), offers('2026-W40', 'dev_backend', 3)], settled).delta).toBeNull();
  });

  it('calcule la part IA sur g1 à g8 seulement, et l’hybridation sur les groupes socle', () => {
    const rows = [
      offers('2026-W40', 'dev_backend', 4, { aiAny: true }),
      offers('2026-W40', 'data_engineer', 2),
      offers('2026-W40', 'ai_engineer', 4, { aiAny: true }),
      offers('2026-W40', 'support_it', 5),
      offers('2026-W39', 'ai_engineer', 50),
    ];
    expect(aiShare(rows, meta, scope.groupOf, ['2026-W40'])).toEqual({ part: 4, total: 10, share: 0.4 });
    expect(hybridation(rows, meta, scope.groupOf, ['2026-W40'])).toEqual({ part: 4, total: 6, share: 4 / 6 });
    expect(aiShare(rows.slice(0, 1), meta, scope.groupOf, ['2026-W40']).share).toBeNull();
  });

  it('compte les rôles des groupes émergents qui ont des offres', () => {
    expect(activeEmergingRoles([offers('2026-W40', 'ai_engineer', 1), offers('2026-W40', 'dev_backend', 9)], meta, ['2026-W40'])).toEqual({
      active: ['ai_engineer'],
      total: 2,
    });
  });
});

describe('ce qui bouge', () => {
  it('classe les rôles par écart entre les 4 dernières semaines et les 4 précédentes', () => {
    const weeks = lastWeeks('2026-W40', 8);
    const rows = weeks.flatMap((w, i) => [
      offers(w, 'dev_backend', i < 4 ? 2 : 3),
      offers(w, 'dev_frontend', i < 4 ? 5 : 2),
      offers(w, 'data_engineer', i < 4 ? 1 : 0),
    ]);
    const movers = roleMovers(rows, meta);
    expect(movers.up).toEqual([{ id: 'dev_backend', recent: 12, previous: 8, delta: 4 }]);
    expect(movers.down).toEqual([{ id: 'dev_frontend', recent: 8, previous: 20, delta: -12 }]);
    expect(movers.partial).toBe(true);
  });

  it('classe les technos par écart de part au mois de référence, dans les groupes affichés', () => {
    const months = ['2026-06', '2026-07', '2026-08', '2026-09'];
    const totals = months.flatMap((month) => [{ month, group: 'g1_dev', n: 10 }, { month, group: 'g9_elargi', n: 100 }]);
    const techs = months.flatMap((month, i) => [
      { month, group: 'g1_dev', tech: 'python', n: i < 3 ? 1 : 5 },
      { month, group: 'g1_dev', tech: 'java', n: i < 3 ? 5 : 2 },
      { month, group: 'g9_elargi', tech: 'python', n: 90 },
    ]);
    const movers = techMovers(techs, totals, meta, scope);
    expect(movers.up.map((m) => [m.id, Math.round(m.delta * 100) / 100])).toEqual([['python', 0.4]]);
    expect(movers.down.map((m) => [m.id, Math.round(m.delta * 100) / 100])).toEqual([['java', -0.3]]);
  });
});

describe('courbes des métiers', () => {
  it('calcule la base 100 depuis la première période d’au moins 5 offres et la part du total', () => {
    const series = new Map([['g1_dev', [2, 5, 10]]]);
    expect(applyMode(series, [4, 10, 20], 'index').get('g1_dev')).toEqual([null, 100, 200]);
    expect(applyMode(series, [4, 10, 20], 'share').get('g1_dev')).toEqual([null, 0.5, 0.5]);
    expect(applyMode(series, [4, 10, 20], 'absolute').get('g1_dev')).toEqual([2, 5, 10]);
    expect(applyMode(new Map([['x', [1, 2]]]), [9, 9], 'index').get('x')).toEqual([null, null]);
  });

  it('donne volume, variation 3 mois, médiane et part de télétravail par rôle', () => {
    const settled = makeMeta({ backfillBefore: '2026-W01', firstRun: '2026-W01', partialWeeks: [] });
    const weeks = lastWeeks('2026-W40', 26);
    const rows = scopedNewOffers(
      weeks.map((w, i) => offers(w, 'dev_backend', i < 13 ? 1 : 2)),
      scope,
    );
    const conditions: ConditionRow[] = [
      { month: '2026-09', group: 'g1_dev', role: 'dev_backend', dimension: 'remote', value: 'hybrid', n: 3 },
      { month: '2026-09', group: 'g1_dev', role: 'dev_backend', dimension: 'remote', value: 'full_remote', n: 1 },
      { month: '2026-09', group: 'g1_dev', role: 'dev_backend', dimension: 'remote', value: 'on_site', n: 2 },
      { month: '2026-09', group: 'g1_dev', role: 'dev_backend', dimension: 'remote', value: 'unknown', n: 10 },
      { month: '2026-01', group: 'g1_dev', role: 'dev_backend', dimension: 'remote', value: 'on_site', n: 50 },
    ];
    const salary: SalaryRow = { month: '*', group: 'g1_dev', role: 'dev_backend', experience: '*', region: '*', n: 30, nSalary: 12, p25: 38_000, p50: 42_000, p75: 48_000 };
    const [row, ...others] = roleTable(rows, conditions, [salary], settled, DEFAULT_FILTERS, scope, weeks, ['2026-09', '2026-10']);
    expect(others).toEqual([]);
    expect(row).toMatchObject({ role: 'dev_backend', group: 'g1_dev', n: 39, variation: 1, variationPartial: false, salary });
    expect(row!.remote).toEqual({ part: 4, total: 6, share: 4 / 6 });
  });
});

describe('carte (indicateur 11a)', () => {
  const rows = [
    { month: '*', region: '11', n: 80, nCore: 60, nAi: 20, density: 1 },
    { month: '2026-09', region: '11', n: 40, nCore: 30, nAi: 6, density: 0.5 },
    { month: '2026-08', region: '11', n: 20, nCore: 12, nAi: 3, density: 0.2 },
    { month: '2026-09', region: '06', n: 4, nCore: 3, nAi: 0, density: null },
  ];

  it('prend les lignes des 12 derniers mois, ou somme les mois demandés et recalcule la densité', () => {
    expect(regionTotals(rows, null, meta).get('11')).toEqual({ n: 80, nCore: 60, nAi: 20, density: 1 });
    expect(regionTotals(rows, ['2026-08', '2026-09'], meta).get('11')).toEqual({ n: 60, nCore: 42, nAi: 9, density: 0.7 });
    expect(regionTotals(rows, ['2026-09'], meta).get('06')).toEqual({ n: 4, nCore: 3, nAi: 0, density: null });
  });
});
