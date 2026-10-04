import { addWeeks, monthOf, weekStart } from '../../../src/pipeline/runId';

// Semaines ISO (« 2026-W40 ») et mois (« 2026-10 ») des agrégats, en Europe/Paris.

export { addWeeks };

/** Mois d'une semaine ISO : celui de son jeudi (D28). */
export function monthOfWeek(week: string): string {
  return monthOf(new Date(weekStart(week).getTime() + 3 * 86_400_000 + 12 * 3_600_000).toISOString());
}

/** `2026-10` décalé de `months` mois. */
export function addMonths(month: string, months: number): string {
  const [year, m] = month.split('-').map(Number) as [number, number];
  const index = year * 12 + (m - 1) + months;
  return `${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, '0')}`;
}

/** Semaines de `from` à `to` incluses, dans l'ordre. */
export function weekRange(from: string, to: string): string[] {
  const weeks: string[] = [];
  for (let week = from; week <= to && weeks.length < 1000; week = addWeeks(week, 1)) weeks.push(week);
  return weeks;
}

/** Les `count` semaines qui finissent à `end`, de la plus ancienne à `end`. */
export function lastWeeks(end: string, count: number): string[] {
  return weekRange(addWeeks(end, -(count - 1)), end);
}

/** Mois de `from` à `to` inclus. */
export function monthRange(from: string, to: string): string[] {
  const months: string[] = [];
  for (let month = from; month <= to && months.length < 600; month = addMonths(month, 1)) months.push(month);
  return months;
}

const dayFormat = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short', timeZone: 'UTC' });
const dayYearFormat = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
const monthFormat = new Intl.DateTimeFormat('fr-FR', { month: 'short', year: 'numeric', timeZone: 'UTC' });

/** Libellé court d'une semaine : son lundi (« 28 sept. »). */
export function weekLabel(week: string): string {
  return dayFormat.format(weekStart(week));
}

/** Libellé long d'une semaine (« semaine 40, du 28 sept. au 4 oct. 2026 »). */
export function weekLongLabel(week: string): string {
  const monday = weekStart(week);
  const sunday = new Date(monday.getTime() + 6 * 86_400_000);
  return `semaine ${Number(week.slice(-2))}, du ${dayFormat.format(monday)} au ${dayYearFormat.format(sunday)}`;
}

/** Libellé d'un mois (« oct. 2026 »). */
export function monthLabel(month: string): string {
  const [year, m] = month.split('-').map(Number) as [number, number];
  return monthFormat.format(new Date(Date.UTC(year, m - 1, 1)));
}

/** Semaine ISO d'une date AAAA-MM-JJ (marqueurs de version de taxonomie). */
export function weekOfDate(date: string, weeks: readonly string[]): string | null {
  const time = Date.parse(`${date}T12:00:00Z`);
  return weeks.find((week) => time >= weekStart(week).getTime() && time < weekStart(week).getTime() + 7 * 86_400_000) ?? null;
}

/** Plages contiguës de périodes partielles, pour `markArea`. */
export function partialRanges(partial: readonly boolean[]): [number, number][] {
  const ranges: [number, number][] = [];
  partial.forEach((isPartial, i) => {
    if (!isPartial) return;
    const last = ranges[ranges.length - 1];
    if (last && last[1] === i - 1) last[1] = i;
    else ranges.push([i, i]);
  });
  return ranges;
}
