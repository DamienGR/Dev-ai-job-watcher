import { groupColor } from '../colors';
import { ignoredFilters } from '../lib/filters';
import { fmtDeltaPct, fmtInt, fmtPct, fmtSalary } from '../lib/format';
import { fmtPremium, fmtRoleMove, fmtTechMove, headline } from '../lib/headline';
import {
  chartWeeks,
  referenceMonth,
  roleMovers,
  scopedNewOffers,
  sumSeries,
  techMovers,
  type Mover,
  type Movers,
  type NewOfferRow,
  type PremiumRow,
  type TechRow,
  type TechTotalRow,
} from '../lib/indicators';
import { monthLabel, weekLongLabel } from '../lib/periods';
import { rowsOf } from '../lib/table';
import type { SalariesFile, TechsFile, TimeseriesFile } from '../lib/types';
import type { Page } from '../page';
import { append, card, h, ignoredNote, partialBadge, tile, valueOr, type Child } from '../ui';
import { chartBox, groupLabel, partialLegend, roleLabel, weekAxis } from './common';

function moversList(title: string, movers: Mover[], label: (id: string) => string, format: (m: Mover) => string): HTMLElement {
  return h(
    'div',
    { class: 'movers' },
    h('h3', null, title),
    movers.length
      ? h('ol', null, movers.map((m) => h('li', null, h('span', { class: 'mover-label' }, label(m.id)), h('span', { class: 'mover-value' }, format(m)))))
      : h('p', { class: 'note' }, 'Rien de notable avec l’historique disponible.'),
  );
}

function moversBlock(title: string, movers: Movers, period: string, label: (id: string) => string, format: (m: Mover) => string, note: Child = null): HTMLElement {
  return h(
    'div',
    { class: 'movers-block' },
    h('h3', { class: 'movers-title' }, title, ' ', movers.partial ? partialBadge() : null),
    h('p', { class: 'note' }, period),
    note,
    h('div', { class: 'movers-pair' }, moversList('Hausses', movers.up, label, format), moversList('Baisses', movers.down, label, format)),
  );
}

export const overviewPage: Page = {
  id: 'apercu',
  title: 'Vue d’ensemble',
  async render(ctx) {
    const { meta, filters, scope } = ctx;
    const [timeseries, salaries, techs] = await Promise.all([
      ctx.load<TimeseriesFile>('timeseries.json'),
      ctx.load<SalariesFile>('salaries.json'),
      ctx.load<TechsFile>('techs.json'),
    ]);
    const all = rowsOf<NewOfferRow>(timeseries.newOffers);
    const scoped = scopedNewOffers(all, scope);
    // Mêmes chiffres que l'accueil du site (SPEC.md §17.4).
    const { week, ai, premium, emerging } = headline(meta, all, scope, rowsOf<PremiumRow>(salaries.aiPremium));

    const tiles = h(
      'div',
      { class: 'tiles' },
      tile({
        label: 'Nouvelles offres de la semaine',
        value: fmtInt(week.n),
        detail: `${weekLongLabel(week.week)}`,
        partial: week.partial,
      }),
      tile({
        label: 'Écart à la moyenne 4 semaines',
        value: valueOr(week.delta, fmtDeltaPct),
        detail: week.mean4 === null ? null : `moyenne des 4 semaines précédentes : ${fmtInt(Math.round(week.mean4))}`,
        partial: week.partial,
      }),
      tile({
        label: 'Part IA',
        value: valueOr(ai.share, fmtPct),
        detail: `${fmtInt(ai.part)} offres IA sur n = ${fmtInt(ai.total)} (groupes g1 à g8), même semaine`,
        partial: week.partial,
      }),
      tile({
        label: 'Médiane salariale IA / dev',
        compact: true,
        value: premium
          ? h('span', null, valueOr(premium.p50Ai, fmtSalary), h('span', { class: 'tile-sep' }, ' / '), valueOr(premium.p50Dev, fmtSalary))
          : '—',
        detail: premium
          ? [
              `IA n = ${fmtInt(premium.nAi)}, dev n = ${fmtInt(premium.nDev)}`,
              premium.premium === null ? '' : ` · prime IA ${fmtPremium(premium)}`,
              ' · 12 derniers mois, France entière',
            ]
          : null,
      }),
      tile({
        label: 'Rôles émergents actifs',
        value: `${emerging.active.length} / ${emerging.total}`,
        detail: 'rôles des groupes émergents avec au moins une offre sur les 4 dernières semaines',
        partial: week.partial,
      }),
    );

    const weeks = chartWeeks(meta, filters, all.map((r) => r.week));
    const byGroup = sumSeries(scoped, weeks, (r) => r.week, (r) => scope.groupOf.get(r.role) ?? null);
    const axis = weekAxis(meta, weeks);
    const series = scope.groups
      .filter((g) => byGroup.has(g))
      .map((g) => ({ name: groupLabel(meta, g), color: groupColor(meta, g), values: byGroup.get(g)! }));

    const roles = roleMovers(scoped, meta);
    const techRows = rowsOf<TechRow>(techs.techs);
    const techTotals = rowsOf<TechTotalRow>(techs.totals);
    const technologies = techMovers(techRows, techTotals, meta, scope);
    const techLabel = (id: string) => meta.labels.technologies.find((t) => t.id === id)?.label ?? id;
    const month = referenceMonth(meta);

    const sections: Child[] = [
      tiles,
      filters.region !== '*' || filters.groups.length || filters.roles.length || filters.source !== '*' || filters.contract !== '*'
        ? h('p', { class: 'note' }, 'La part IA et les rôles émergents gardent leur définition (tous groupes) ; la médiane salariale porte sur la France entière, toutes offres.')
        : null,
      card(
        'Nouvelles offres par groupe et par semaine',
        h('p', { class: 'note' }, 'Offres dédoublonnées, comptées dans leur semaine de création. n = nombre d’offres.'),
        series.length ? chartBox(ctx, { ...axis, series, format: fmtInt, ariaLabel: 'Courbes des nouvelles offres par groupe et par semaine' }) : h('p', { class: 'empty' }, 'Aucune offre pour ces filtres.'),
        partialLegend(axis.partial),
      ),
      card(
        'Ce qui bouge',
        h(
          'div',
          { class: 'movers-grid' },
          moversBlock(
            'Rôles',
            roles,
            'Nouvelles offres des 4 dernières semaines complètes contre les 4 précédentes (au moins 10 offres sur les 8 semaines).',
            (id) => roleLabel(meta, id),
            fmtRoleMove,
          ),
          moversBlock(
            'Technologies',
            technologies,
            `Part des offres à description complète qui citent la techno, en ${monthLabel(month)} contre la moyenne des 3 mois précédents.`,
            techLabel,
            fmtTechMove,
            ignoredNote(ignoredFilters(filters, ['groups'])),
          ),
        ),
      ),
    ];
    append(ctx.root, sections);
  },
};
