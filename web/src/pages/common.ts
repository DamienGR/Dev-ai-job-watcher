import { lineChart, type LineSpec } from '../charts';
import { isPartialMonth, isPartialWeek } from '../lib/indicators';
import { monthLabel, weekLabel, weekLongLabel, weekOfDate } from '../lib/periods';
import type { Meta } from '../lib/types';
import type { PageContext } from '../page';
import { h, type Child } from '../ui';

export type Axis = Pick<LineSpec, 'labels' | 'titles' | 'partial' | 'markers'>;

/**
 * Marqueurs des changements de version de taxonomie (SPEC.md §8.3) : chaque version après la
 * première de l'historique, à la période de sa date.
 */
function markers(meta: Meta, periods: readonly string[], periodOfDate: (date: string) => string | null) {
  return meta.taxonomyHistory
    .slice()
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(1)
    .map((entry) => ({ index: periods.indexOf(periodOfDate(entry.date) ?? ''), label: `taxonomie v${entry.version}` }))
    .filter((m) => m.index >= 0);
}

export function weekAxis(meta: Meta, weeks: readonly string[]): Axis {
  return {
    labels: weeks.map(weekLabel),
    titles: weeks.map((w) => `Semaine du ${weekLongLabel(w).replace(/^semaine \d+, du /, '')}`),
    partial: weeks.map((w) => isPartialWeek(meta, w)),
    markers: markers(meta, weeks, (date) => weekOfDate(date, weeks)),
  };
}

export function monthAxis(meta: Meta, months: readonly string[]): Axis {
  return {
    labels: months.map(monthLabel),
    titles: months.map(monthLabel),
    partial: months.map((m) => isPartialMonth(meta, m)),
    markers: markers(meta, months, (date) => date.slice(0, 7)),
  };
}

/** Conteneur de graphique, dessiné une fois inséré dans la page. */
export function chartBox(ctx: PageContext, spec: LineSpec, className = ''): HTMLElement {
  const box = h('div', { class: `chart-box ${className}`.trim() });
  requestAnimationFrame(() => {
    if (box.isConnected) ctx.onDispose(lineChart(box, spec));
  });
  return h('div', { class: 'chart-figure' }, seriesLegend(spec), box);
}

/** Légende HTML des courbes (au-dessus du graphique), qui passe à la ligne sur mobile. */
function seriesLegend(spec: LineSpec): Child {
  if (spec.series.length < 2) return null;
  return h(
    'ul',
    { class: 'series-legend' },
    spec.series.map((s) => {
      const key = h('span', { class: 'series-key', 'aria-hidden': 'true' });
      key.style.background = s.color;
      return h('li', null, key, s.name);
    }),
  );
}

/** Légende des hachures, sous les graphiques qui en ont. */
export function partialLegend(partial: readonly boolean[]): Child {
  if (!partial.some(Boolean)) return null;
  return h(
    'p',
    { class: 'note' },
    h('span', { class: 'hatch-key', 'aria-hidden': 'true' }),
    ' Période partielle : rattrapage avant le premier run (offres déjà fermées jamais vues), mois en cours ou collecte incomplète.',
  );
}

/** Groupe de contrôles segmentés (choix exclusif), reflété dans l'URL. */
export function segmented(ctx: PageContext, name: string, label: string, options: [string, string][], current: string): HTMLElement {
  return h(
    'div',
    { class: 'segmented', role: 'group', 'aria-label': label },
    options.map(([value, text]) =>
      h(
        'button',
        {
          type: 'button',
          'aria-pressed': String(value === current),
          onclick: () => ctx.setParam(name, value === options[0]![0] ? null : value),
        },
        text,
      ),
    ),
  );
}

export function roleLabel(meta: Meta, role: string): string {
  return meta.labels.roles.find((r) => r.id === role)?.label ?? role;
}

export function groupLabel(meta: Meta, group: string): string {
  if (group === 'non_classe') return 'Non classé';
  if (group === '*') return 'Toutes les offres collectées';
  return meta.labels.groups.find((g) => g.id === group)?.label ?? group;
}

export function regionLabel(meta: Meta, region: string): string {
  if (region === '*') return 'France entière';
  return meta.labels.regions.find((r) => r.code === region)?.label ?? region;
}
