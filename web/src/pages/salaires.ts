import { groupColor } from '../colors';
import { ignoredFilters } from '../lib/filters';
import { fmtDelta, fmtEuro, fmtInt, fmtPct, fmtSalary, shareOf } from '../lib/format';
import { chartMonths, salaryLookup, type PremiumRow, type SalaryRow, type TjmRow } from '../lib/indicators';
import { ALL, rowsOf } from '../lib/table';
import type { SalariesFile } from '../lib/types';
import type { Page, PageContext } from '../page';
import { append, card, dataTable, h, ignoredNote, masked, rangeBar, swatch, valueOr, type Child } from '../ui';
import { chartBox, groupLabel, monthAxis, partialLegend, regionLabel, roleLabel } from './common';

/** Colonnes communes : effectif, taux de renseignement, quartiles et bande. */
function salaryColumns<T extends { cell: SalaryRow }>(scale: { min: number; max: number }) {
  return [
    { label: 'Offres', numeric: true, render: (r: T) => fmtInt(r.cell.n) },
    {
      label: 'Renseigné',
      numeric: true,
      title: 'Taux de renseignement : offres avec un salaire exploitable',
      render: (r: T) => [valueOr(shareOf(r.cell.nSalary, r.cell.n), fmtPct), h('span', { class: 'cell-n' }, ` ${fmtInt(r.cell.nSalary)}`)],
    },
    { label: 'p25', numeric: true, render: (r: T) => valueOr(r.cell.p25, fmtSalary) },
    { label: 'Médiane', numeric: true, render: (r: T) => (r.cell.p50 === null ? masked() : h('strong', null, fmtSalary(r.cell.p50))) },
    { label: 'p75', numeric: true, render: (r: T) => valueOr(r.cell.p75, fmtSalary) },
    {
      label: 'p25 – p75',
      render: (r: T): Child =>
        r.cell.p25 !== null && r.cell.p50 !== null && r.cell.p75 !== null ? rangeBar(r.cell.p25, r.cell.p50, r.cell.p75, scale.min, scale.max) : null,
    },
  ];
}

function scaleOf(cells: readonly SalaryRow[]) {
  const lows = cells.map((c) => c.p25).filter((v): v is number => v !== null);
  const highs = cells.map((c) => c.p75).filter((v): v is number => v !== null);
  return { min: Math.min(...lows, Infinity) === Infinity ? 0 : Math.min(...lows) * 0.9, max: Math.max(...highs, 1) * 1.05 };
}

function select(ctx: PageContext, name: string, label: string, options: [string, string][], current: string): HTMLElement {
  return h(
    'label',
    { class: 'inline-select' },
    `${label} `,
    h(
      'select',
      { onchange: (event: Event) => ctx.setParam(name, (event.target as HTMLSelectElement).value === options[0]![0] ? null : (event.target as HTMLSelectElement).value) },
      options.map(([value, text]) => h('option', { value, selected: value === current }, text)),
    ),
  );
}

export const salairesPage: Page = {
  id: 'salaires',
  title: 'Salaires',
  params: ['xp', 'ref'],
  async render(ctx) {
    const { meta, filters, scope, params } = ctx;
    const file = await ctx.load<SalariesFile>('salaries.json');
    const rows = rowsOf<SalaryRow>(file.salaries);
    const cell = salaryLookup(rows);
    const experiences = Object.keys(meta.labels.experience);
    const xp = experiences.includes(params.get('xp') ?? '') ? params.get('xp')! : ALL;
    const ref = scope.groups.includes(params.get('ref') ?? '') ? params.get('ref')! : ALL;
    const region = filters.region;
    const where = `${regionLabel(meta, region)}, ${xp === ALL ? 'toutes expériences' : meta.labels.experience[xp]!.toLowerCase()}`;

    // 1. Par rôle : ligne du groupe puis ses rôles, 12 derniers mois.
    type RoleLine = { cell: SalaryRow; group: string; role: string };
    const roleLines: RoleLine[] = [];
    for (const group of scope.groups) {
      const groupCell = cell(ALL, group, ALL, xp, region);
      const roles = meta.labels.roles
        .filter((r) => r.group === group && scope.roleOk(r.id))
        .map((r) => ({ role: r.id, cell: cell(ALL, group, r.id, xp, region) }))
        .filter((r): r is { role: string; cell: SalaryRow } => r.cell !== undefined)
        .sort((a, b) => b.cell.n - a.cell.n);
      if (groupCell && !filters.roles.length) roleLines.push({ cell: groupCell, group, role: ALL });
      for (const r of roles) roleLines.push({ cell: r.cell, group, role: r.role });
    }
    const roleScale = scaleOf(roleLines.map((l) => l.cell));

    // 2. Évolution mensuelle de la médiane par groupe.
    const months = chartMonths(meta, filters, rows.map((r) => r.month));
    const axis = monthAxis(meta, months);
    const series = scope.groups
      .map((group) => {
        const cells = months.map((m) => cell(m, group, ALL, xp, region));
        return {
          name: groupLabel(meta, group),
          color: groupColor(meta, group),
          values: cells.map((c) => c?.p50 ?? null),
          counts: cells.map((c) => c?.nSalary ?? 0),
        };
      })
      .filter((s) => s.values.some((v) => v !== null));

    // 3. Prime IA, par expérience (France entière).
    const premium = rowsOf<PremiumRow>(file.aiPremium).filter((r) => r.month === ALL);
    const premiumOrder = [ALL, ...experiences];
    premium.sort((a, b) => premiumOrder.indexOf(a.experience) - premiumOrder.indexOf(b.experience));

    // 4 et 5. Par expérience et par région, pour le groupe de référence.
    type Line = { cell: SalaryRow; label: string };
    const byExperience: Line[] = experiences
      .map((e) => ({ label: meta.labels.experience[e]!, cell: cell(ALL, ref, ALL, e, region) }))
      .filter((l): l is Line => l.cell !== undefined);
    const byRegion: Line[] = meta.labels.regions
      .map((r) => ({ label: r.label, cell: cell(ALL, ref, ALL, xp, r.code) }))
      .filter((l): l is Line => l.cell !== undefined)
      .sort((a, b) => (b.cell.p50 ?? -1) - (a.cell.p50 ?? -1));

    // 6. TJM par groupe.
    const tjm = rowsOf<TjmRow>(file.tjm).filter((r) => r.month === ALL && (r.group === ALL || scope.groupOk(r.group)));
    tjm.sort((a, b) => (a.group === ALL ? -1 : b.group === ALL ? 1 : scope.groups.indexOf(a.group) - scope.groups.indexOf(b.group)));

    const refOptions: [string, string][] = [[ALL, groupLabel(meta, ALL)], ...scope.groups.map((g): [string, string] => [g, groupLabel(meta, g)])];

    append(ctx.root, [
      h(
        'div',
        { class: 'controls card-controls' },
        select(ctx, 'xp', 'Expérience', [[ALL, 'Toutes'], ...experiences.map((e): [string, string] => [e, meta.labels.experience[e]!])], xp),
      ),
      card(
        'Salaires par rôle',
        h('p', { class: 'note' }, `Salaire annuel brut, milieu de fourchette ; 12 derniers mois, ${where}. Salaires prédits exclus. Rôles de moins de 5 offres absents.`),
        ignoredNote(ignoredFilters(filters, ['region', 'groups', 'roles'])),
        dataTable<RoleLine>(
          [
            {
              label: 'Rôle',
              render: (l) =>
                l.role === ALL ? h('strong', null, swatch(groupColor(meta, l.group)), ' ', groupLabel(meta, l.group)) : roleLabel(meta, l.role),
            },
            ...salaryColumns<RoleLine>(roleScale),
          ],
          roleLines,
        ),
      ),
      card(
        'Évolution de la médiane',
        h('p', { class: 'note' }, `Médiane mensuelle par groupe, ${where}. Mois de moins de 5 salaires masqués ; n = salaires exploitables.`),
        series.length
          ? chartBox(ctx, { ...axis, series, format: fmtSalary, countLabel: 'salaires', ariaLabel: 'Courbes de la médiane salariale mensuelle par groupe' })
          : h('p', { class: 'empty' }, 'Pas encore assez de salaires par mois pour tracer une courbe.'),
        partialLegend(axis.partial),
      ),
      card(
        'Prime IA',
        h('p', { class: 'note' }, 'Médiane des groupes IA (g3 à g8) moins médiane du développement logiciel (g1), à expérience égale ; 12 derniers mois, France entière.'),
        dataTable<PremiumRow>(
          [
            { label: 'Expérience', render: (r) => (r.experience === ALL ? 'Toutes' : meta.labels.experience[r.experience] ?? r.experience) },
            { label: 'Médiane IA', numeric: true, render: (r) => [valueOr(r.p50Ai, fmtSalary), h('span', { class: 'cell-n' }, ` n = ${fmtInt(r.nAi)}`)] },
            { label: 'Médiane dev', numeric: true, render: (r) => [valueOr(r.p50Dev, fmtSalary), h('span', { class: 'cell-n' }, ` n = ${fmtInt(r.nDev)}`)] },
            { label: 'Prime IA', numeric: true, render: (r) => valueOr(r.premium, (v) => `${fmtDelta(v / 1000, 1)} k€`) },
          ],
          premium,
        ),
      ),
      card(
        'Par expérience et par région',
        h('div', { class: 'controls' }, select(ctx, 'ref', 'Groupe', refOptions, ref)),
        h('p', { class: 'note' }, `12 derniers mois. « ${groupLabel(meta, ALL)} » inclut le périmètre élargi et les non classés.`),
        h('h3', null, `Par expérience · ${regionLabel(meta, region)}`),
        dataTable<Line>([{ label: 'Expérience', render: (l) => l.label }, ...salaryColumns<Line>(scaleOf(byExperience.map((l) => l.cell)))], byExperience),
        h('h3', null, `Par région · ${xp === ALL ? 'toutes expériences' : meta.labels.experience[xp]!}`),
        dataTable<Line>([{ label: 'Région', render: (l) => l.label }, ...salaryColumns<Line>(scaleOf(byRegion.map((l) => l.cell)))], byRegion),
      ),
      card(
        'TJM des indépendants',
        h('p', { class: 'note' }, 'Taux journalier moyen de chaque offre (milieu de fourchette) ; 12 derniers mois, France entière.'),
        ignoredNote(ignoredFilters(filters, ['groups'])),
        dataTable<TjmRow>(
          [
            { label: 'Groupe', render: (r) => (r.group === ALL ? h('strong', null, 'Toutes les offres') : [swatch(groupColor(meta, r.group)), ' ', groupLabel(meta, r.group)]) },
            { label: 'n', numeric: true, render: (r) => fmtInt(r.n) },
            { label: 'p25', numeric: true, render: (r) => valueOr(r.p25, fmtEuro) },
            { label: 'Médiane', numeric: true, render: (r) => (r.p50 === null ? masked() : h('strong', null, fmtEuro(r.p50))) },
            { label: 'p75', numeric: true, render: (r) => valueOr(r.p75, fmtEuro) },
          ],
          tjm,
        ),
      ),
    ]);
  },
};
