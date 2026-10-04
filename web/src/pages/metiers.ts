import { cssVar, groupColor, roleColors } from '../colors';
import { periodOf, scopeOf } from '../lib/filters';
import { fmtDecimal, fmtDeltaPct, fmtInt, fmtPct, fmtSalary } from '../lib/format';
import {
  aiShare,
  applyMode,
  chartMonths,
  chartWeeks,
  hybridation,
  roleTable,
  scopedNewOffers,
  sumSeries,
  type ConditionRow,
  type Mode,
  type NewOfferRow,
  type RoleStats,
  type SalaryRow,
} from '../lib/indicators';
import { monthOfWeek } from '../lib/periods';
import { rowsOf } from '../lib/table';
import type { SalariesFile, Table, TimeseriesFile } from '../lib/types';
import type { Page } from '../page';
import { append, card, dataTable, h, masked, partialBadge, swatch, tile, valueOr } from '../ui';
import { chartBox, groupLabel, monthAxis, partialLegend, regionLabel, roleLabel, segmented, weekAxis } from './common';

const OTHER = '__autres';
const MAX_ROLE_SERIES = 8;

export const metiersPage: Page = {
  id: 'metiers',
  title: 'Métiers',
  params: ['vue', 'mode', 'pas'],
  async render(ctx) {
    const { meta, filters, scope, params } = ctx;
    const [timeseries, conditions, salaries] = await Promise.all([
      ctx.load<TimeseriesFile>('timeseries.json'),
      ctx.load<Table>('conditions.json'),
      ctx.load<SalariesFile>('salaries.json'),
    ]);
    const all = rowsOf<NewOfferRow>(timeseries.newOffers);
    const scoped = scopedNewOffers(all, scope);
    const view = params.get('vue') === 'roles' ? 'roles' : 'groupes';
    const mode: Mode = params.get('mode') === 'base100' ? 'index' : params.get('mode') === 'part' ? 'share' : 'absolute';
    const monthly = params.get('pas') === 'mois';

    const monthCache = new Map<string, string>();
    const monthOf = (week: string) => {
      let month = monthCache.get(week);
      if (!month) monthCache.set(week, (month = monthOfWeek(week)));
      return month;
    };
    const weeks = chartWeeks(meta, filters, all.map((r) => r.week));
    const months = chartMonths(meta, filters, all.map((r) => monthOf(r.week)));
    const periods = monthly ? months : weeks;
    const periodOfRow = monthly ? (r: NewOfferRow) => monthOf(r.week) : (r: NewOfferRow) => r.week;
    const axis = monthly ? monthAxis(meta, months) : weekAxis(meta, weeks);

    // Rôles : les 8 plus fréquents de la période, les autres regroupés.
    const roleTotals = sumSeries(scoped, periods, periodOfRow, (r) => r.role);
    const topRoles = new Set(
      [...roleTotals]
        .map(([role, values]) => [role, values.reduce((a, b) => a + b, 0)] as const)
        .sort((a, b) => b[1] - a[1])
        .slice(0, MAX_ROLE_SERIES)
        .map(([role]) => role),
    );
    const keyOf = view === 'roles' ? (r: NewOfferRow) => (topRoles.has(r.role) ? r.role : OTHER) : (r: NewOfferRow) => scope.groupOf.get(r.role) ?? null;
    const counts = sumSeries(scoped, periods, periodOfRow, keyOf);
    const everyGroup = scopedNewOffers(all, scopeOf(meta, { ...filters, groups: [], roles: [] }));
    const total = sumSeries(everyGroup, periods, periodOfRow, () => 'n').get('n') ?? periods.map(() => 0);
    const values = applyMode(counts, total, mode);

    const keys =
      view === 'roles'
        ? [...meta.labels.roles.map((r) => r.id).filter((id) => counts.has(id)), ...(counts.has(OTHER) ? [OTHER] : [])]
        : scope.groups.filter((g) => counts.has(g));
    const colorOfRole = roleColors(keys.filter((key) => key !== OTHER));
    const series = keys.map((key) => ({
      name: view === 'roles' ? (key === OTHER ? 'Autres rôles' : roleLabel(meta, key)) : groupLabel(meta, key),
      color: view === 'roles' ? (colorOfRole.get(key) ?? cssVar('--series-other')) : groupColor(meta, key),
      values: values.get(key)!,
      counts: mode === 'absolute' ? undefined : counts.get(key),
    }));
    const format = mode === 'share' ? fmtPct : mode === 'index' ? fmtDecimal : fmtInt;

    const anyGroup = all.filter((r) => scope.rowOk(r));
    const ai = aiShare(anyGroup, meta, scope.groupOf, weeks);
    const hybrid = hybridation(anyGroup, meta, scope.groupOf, weeks);
    const partial = axis.partial.some(Boolean);

    const stats = roleTable(
      scoped,
      rowsOf<ConditionRow>(conditions),
      rowsOf<SalaryRow>(salaries.salaries),
      meta,
      filters,
      scope,
      weeks,
      months,
    );

    append(ctx.root, [
      h(
        'div',
        { class: 'tiles tiles-2' },
        tile({
          label: 'Part IA sur la période',
          value: valueOr(ai.share, fmtPct),
          detail: `${fmtInt(ai.part)} offres IA (g3 à g8) sur n = ${fmtInt(ai.total)} (g1 à g8) · ${periodOf(filters).label.toLowerCase()}`,
          partial,
        }),
        tile({
          label: 'Hybridation dev et data',
          value: valueOr(hybrid.share, fmtPct),
          detail: `${fmtInt(hybrid.part)} offres dev ou data citant l’IA sur n = ${fmtInt(hybrid.total)}`,
          partial,
        }),
      ),
      card(
        view === 'roles' ? 'Nouvelles offres par rôle' : 'Nouvelles offres par groupe',
        h(
          'div',
          { class: 'controls' },
          segmented(ctx, 'vue', 'Découpage', [['groupes', 'Groupes'], ['roles', 'Rôles']], view),
          segmented(ctx, 'mode', 'Mesure', [['absolu', 'Nombre'], ['base100', 'Base 100'], ['part', 'Part du total']], params.get('mode') ?? 'absolu'),
          segmented(ctx, 'pas', 'Pas de temps', [['semaine', 'Semaine'], ['mois', 'Mois']], monthly ? 'mois' : 'semaine'),
        ),
        h(
          'p',
          { class: 'note' },
          mode === 'index'
            ? 'Base 100 : première période d’au moins 5 offres de chaque courbe.'
            : mode === 'share'
              ? 'Part des nouvelles offres de tout le périmètre affiché (périodes d’au moins 5 offres).'
              : 'Offres dédoublonnées, comptées dans leur période de création.',
          view === 'roles' ? ' Les 8 rôles les plus fréquents de la période, les autres sont regroupés.' : '',
        ),
        series.length
          ? chartBox(ctx, { ...axis, series, format, countLabel: 'offres', ariaLabel: 'Courbes des nouvelles offres par métier' })
          : h('p', { class: 'empty' }, 'Aucune offre pour ces filtres.'),
        partialLegend(axis.partial),
      ),
      card(
        'Rôles',
        h(
          'p',
          { class: 'note' },
          `Volume : ${periodOf(filters).label.toLowerCase()}. Variation : 13 dernières semaines complètes contre les 13 précédentes. `,
          `Médiane : 12 derniers mois, ${regionLabel(meta, filters.region)}. Télétravail : parmi les offres qui le précisent.`,
        ),
        filters.region !== '*' || filters.source !== '*' || filters.contract !== '*'
          ? h('p', { class: 'note' }, 'La part de télétravail ne se filtre pas par région, source ni contrat ; la médiane ne se filtre pas par source ni contrat.')
          : null,
        dataTable<RoleStats>(
          [
            {
              label: 'Rôle',
              render: (r) => [swatch(groupColor(meta, r.group)), ' ', roleLabel(meta, r.role), h('span', { class: 'cell-sub' }, groupLabel(meta, r.group))],
            },
            { label: 'Groupe', secondary: true, render: (r) => groupLabel(meta, r.group) },
            { label: 'Nouvelles offres', numeric: true, render: (r) => fmtInt(r.n) },
            {
              label: 'Variation 3 mois',
              numeric: true,
              render: (r) => (r.variation === null ? masked() : [fmtDeltaPct(r.variation), r.variationPartial ? [' ', partialBadge('p')] : null]),
            },
            {
              label: 'Médiane salariale',
              numeric: true,
              render: (r) =>
                r.salary
                  ? [valueOr(r.salary.p50, fmtSalary), h('span', { class: 'cell-n' }, ` ${fmtInt(r.salary.nSalary)} / ${fmtInt(r.salary.n)}`)]
                  : masked(),
            },
            {
              label: 'Télétravail',
              numeric: true,
              render: (r) => [valueOr(r.remote.share, fmtPct), h('span', { class: 'cell-n' }, ` n = ${fmtInt(r.remote.total)}`)],
            },
          ],
          stats,
          'Rôles du périmètre affiché',
        ),
        h('p', { class: 'note' }, 'Salaires : « salaires exploitables / offres ». « p » : fenêtre qui contient des semaines partielles.'),
      ),
    ]);
  },
};
