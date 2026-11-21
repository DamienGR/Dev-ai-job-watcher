import { isPartialMonth, isPartialWeek } from './indicators';
import { monthLabel, weekLabel, weekLongLabel, weekOfDate } from './periods';
import type { Meta } from './types';

// Axes des courbes (SPEC.md §8.3) : libellés, périodes partielles hachurées, marqueurs des
// changements de version de taxonomie. Sans dépendance à ECharts : servent aussi à l'accueil.

export interface Axis {
  /** Libellés courts de l'axe. */
  labels: string[];
  /** Libellés longs, en tête d'infobulle. */
  titles: string[];
  /** Périodes partielles, hachurées. */
  partial: boolean[];
  /** Changements de version de taxonomie : index de période et libellé. */
  markers: { index: number; label: string }[];
}

/**
 * Marqueurs des changements de version de taxonomie : chaque version après la première de
 * l'historique, à la période de sa date.
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
