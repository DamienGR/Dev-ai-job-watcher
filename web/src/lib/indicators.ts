import { periodOf, type Filters, type Scope } from './filters';
import { MIN_N, shareOf } from './format';
import { addMonths, addWeeks, lastWeeks, monthOfWeek, monthRange, weekRange } from './periods';
import { ALL, indexBy } from './table';
import type { Meta } from './types';

// Calculs du dashboard à partir des agrégats (SPEC.md §7.1, §8.1). Les comptages sont
// additifs : le dashboard somme les lignes qui passent les filtres (D28). Les statistiques
// (parts, variations, densités) sont masquées sous 5 observations (§8.3, D34).

export interface NewOfferRow {
  week: string;
  role: string;
  region: string | null;
  source: string;
  contract: string;
  aiAny: boolean;
  n: number;
}

export interface SalaryRow {
  month: string;
  group: string;
  role: string;
  experience: string;
  region: string;
  n: number;
  nSalary: number;
  p25: number | null;
  p50: number | null;
  p75: number | null;
}

export interface PremiumRow {
  month: string;
  experience: string;
  nAi: number;
  p50Ai: number | null;
  nDev: number;
  p50Dev: number | null;
  premium: number | null;
}

export interface TjmRow {
  month: string;
  group: string;
  n: number;
  p25: number | null;
  p50: number | null;
  p75: number | null;
}

export interface ConditionRow {
  month: string;
  group: string;
  role: string;
  dimension: string;
  value: string;
  n: number;
}

export interface TechRow {
  month: string;
  group: string;
  tech: string;
  n: number;
}

export interface TechTotalRow {
  month: string;
  group: string;
  n: number;
}

export interface GeoRegionRow {
  month: string;
  region: string;
  n: number;
  nCore: number;
  nAi: number;
  density: number | null;
}

export interface GeoPointRow {
  lat: number;
  lng: number;
  group: string;
  role: string;
  week: string;
  n: number;
}

/** Dernier run traité. */
export function lastRunId(meta: Meta): string {
  return meta.lastRun?.runId ?? meta.runs[meta.runs.length - 1] ?? meta.firstRun;
}

/**
 * Semaine des tuiles : celle qui précède le dernier run, la plus récente que la collecte du
 * lundi couvre en entier (la semaine du run lui-même vient de commencer).
 */
export function referenceWeek(meta: Meta): string {
  return addWeeks(lastRunId(meta), -1);
}

/** Mois de référence : celui qui précède le mois du dernier run. */
export function referenceMonth(meta: Meta): string {
  return addMonths(monthOfWeek(lastRunId(meta)), -1);
}

/** Semaine partielle (SPEC.md §6.9) : rattrapage avant le premier run, ou mal couverte. */
export function isPartialWeek(meta: Meta, week: string): boolean {
  return week < meta.backfillBefore || meta.partialWeeks.includes(week);
}

export function isPartialMonth(meta: Meta, month: string): boolean {
  return month < monthOfWeek(meta.backfillBefore) || meta.partialMonths.includes(month);
}

/**
 * Semaines affichées pour la période choisie, jusqu'à la semaine de référence incluse. La
 * semaine du dernier run n'est pas dessinée : le run du lundi n'en voit que quelques heures et
 * elle n'est collectée qu'au run suivant, d'où un point proche de zéro (D44).
 */
export function chartWeeks(meta: Meta, filters: Filters, dataWeeks: Iterable<string>): string[] {
  const end = referenceWeek(meta);
  const { weeks } = periodOf(filters);
  if (weeks) return lastWeeks(end, weeks);
  let first = end;
  for (const week of dataWeeks) if (week < first) first = week;
  return weekRange(first, end);
}

/** Mois affichés pour la période choisie, jusqu'au mois du dernier run inclus. */
export function chartMonths(meta: Meta, filters: Filters, dataMonths: Iterable<string>): string[] {
  const end = monthOfWeek(lastRunId(meta));
  const { months } = periodOf(filters);
  if (months) return monthRange(addMonths(end, -(months - 1)), end);
  let first = end;
  for (const month of dataMonths) if (month !== ALL && month < first) first = month;
  return monthRange(first, end);
}

/**
 * Somme `n` par clé et par période, alignée sur `periods` (zéro si aucune ligne). Une clé
 * `null` écarte la ligne.
 */
export function sumSeries<T extends { n: number }>(
  rows: readonly T[],
  periods: readonly string[],
  periodOfRow: (row: T) => string,
  keyOf: (row: T) => string | null,
): Map<string, number[]> {
  const index = new Map(periods.map((p, i) => [p, i]));
  const series = new Map<string, number[]>();
  for (const row of rows) {
    const i = index.get(periodOfRow(row));
    if (i === undefined) continue;
    const key = keyOf(row);
    if (key === null) continue;
    let values = series.get(key);
    if (!values) {
      values = new Array<number>(periods.length).fill(0);
      series.set(key, values);
    }
    values[i]! += row.n;
  }
  return series;
}

const sum = (values: readonly number[]) => values.reduce((a, b) => a + b, 0);
const zeros = (length: number) => new Array<number>(length).fill(0);

/** Nouvelles offres dans le périmètre affiché (rôles, région, source, contrat). */
export function scopedNewOffers(rows: readonly NewOfferRow[], scope: Scope): NewOfferRow[] {
  return rows.filter((r) => scope.roleOk(r.role) && scope.rowOk(r));
}

/** Total d'une liste de lignes sur un ensemble de semaines. */
export function totalOver(rows: readonly NewOfferRow[], weeks: readonly string[]): number {
  return sum(sumSeries(rows, weeks, (r) => r.week, () => 'n').get('n') ?? []);
}

export interface WeekTile {
  week: string;
  n: number;
  mean4: number | null;
  /** Écart relatif à la moyenne des 4 semaines précédentes. */
  delta: number | null;
  partial: boolean;
}

/** Tuile « nouvelles offres de la semaine » et écart à la moyenne des 4 semaines précédentes. */
export function newOffersTile(rows: readonly NewOfferRow[], meta: Meta): WeekTile {
  const week = referenceWeek(meta);
  const weeks = lastWeeks(week, 5);
  const counts = sumSeries(rows, weeks, (r) => r.week, () => 'n').get('n') ?? zeros(5);
  const n = counts[4]!;
  const mean4 = sum(counts.slice(0, 4)) / 4;
  return {
    week,
    n,
    mean4,
    delta: mean4 >= MIN_N ? (n - mean4) / mean4 : null,
    partial: weeks.some((w) => isPartialWeek(meta, w)),
  };
}

export interface ShareValue {
  part: number;
  total: number;
  share: number | null;
}

const coreGroups = (meta: Meta) => new Set(meta.labels.groups.filter((g) => g.status !== 'hors_perimetre').map((g) => g.id));

/**
 * Part IA (indicateur 4) : groupes IA (g3 à g8) / groupes du périmètre (g1 à g8), sur les
 * semaines données. Les filtres de groupe et de rôle ne s'appliquent pas à cette définition.
 */
export function aiShare(rows: readonly NewOfferRow[], meta: Meta, groupOf: ReadonlyMap<string, string>, weeks: readonly string[]): ShareValue {
  const weekSet = new Set(weeks);
  const core = coreGroups(meta);
  const ai = new Set(meta.aiGroups);
  let part = 0;
  let total = 0;
  for (const r of rows) {
    if (!weekSet.has(r.week)) continue;
    const group = groupOf.get(r.role) ?? '';
    if (!core.has(group)) continue;
    total += r.n;
    if (ai.has(group)) part += r.n;
  }
  return { part, total, share: shareOf(part, total) };
}

/** Hybridation (indicateur 4) : part des offres des groupes socle (dev, data) qui citent l'IA. */
export function hybridation(rows: readonly NewOfferRow[], meta: Meta, groupOf: ReadonlyMap<string, string>, weeks: readonly string[]): ShareValue {
  const weekSet = new Set(weeks);
  const socle = new Set(meta.labels.groups.filter((g) => g.status === 'socle').map((g) => g.id));
  let part = 0;
  let total = 0;
  for (const r of rows) {
    if (!weekSet.has(r.week) || !socle.has(groupOf.get(r.role) ?? '')) continue;
    total += r.n;
    if (r.aiAny) part += r.n;
  }
  return { part, total, share: shareOf(part, total) };
}

/** Rôles émergents actifs : rôles des groupes émergents ayant au moins une offre sur les semaines données (D34). */
export function activeEmergingRoles(rows: readonly NewOfferRow[], meta: Meta, weeks: readonly string[]): { active: string[]; total: number } {
  const emergent = new Set(meta.labels.groups.filter((g) => g.status === 'emergent').map((g) => g.id));
  const roles = meta.labels.roles.filter((r) => emergent.has(r.group) && r.status === 'active').map((r) => r.id);
  const counts = sumSeries(rows, weeks, (r) => r.week, (r) => r.role);
  return { active: roles.filter((role) => sum(counts.get(role) ?? []) > 0), total: roles.length };
}

export interface Mover {
  id: string;
  recent: number;
  previous: number;
  delta: number;
}

export interface Movers {
  up: Mover[];
  down: Mover[];
  partial: boolean;
}

function rankMovers(movers: Mover[], limit: number): { up: Mover[]; down: Mover[] } {
  const up = movers.filter((m) => m.delta > 0).sort((a, b) => b.delta - a.delta || a.id.localeCompare(b.id));
  const down = movers.filter((m) => m.delta < 0).sort((a, b) => a.delta - b.delta || a.id.localeCompare(b.id));
  return { up: up.slice(0, limit), down: down.slice(0, limit) };
}

/**
 * « Ce qui bouge », rôles : nouvelles offres des 4 dernières semaines complètes contre les 4
 * précédentes, pour les rôles qui totalisent au moins 10 offres sur les 8 semaines.
 */
export function roleMovers(rows: readonly NewOfferRow[], meta: Meta, limit = 5): Movers {
  const end = referenceWeek(meta);
  const weeks = lastWeeks(end, 8);
  const counts = sumSeries(rows, weeks, (r) => r.week, (r) => r.role);
  const movers: Mover[] = [];
  for (const [id, values] of counts) {
    const previous = sum(values.slice(0, 4));
    const recent = sum(values.slice(4));
    if (recent + previous >= 2 * MIN_N) movers.push({ id, recent, previous, delta: recent - previous });
  }
  return { ...rankMovers(movers, limit), partial: weeks.some((w) => isPartialWeek(meta, w)) };
}

/**
 * « Ce qui bouge », technos : part des offres à description complète citant la techno, au
 * mois de référence contre la moyenne des 3 mois précédents (en points). Mois de moins de
 * 5 offres ignorés.
 */
export function techMovers(techs: readonly TechRow[], totals: readonly TechTotalRow[], meta: Meta, scope: Scope, limit = 5): Movers {
  const month = referenceMonth(meta);
  const months = monthRange(addMonths(month, -3), month);
  const total = sumSeries(totals.filter((t) => scope.groupOk(t.group)), months, (t) => t.month, () => 'n').get('n') ?? zeros(4);
  const counts = sumSeries(techs.filter((t) => scope.groupOk(t.group)), months, (t) => t.month, (t) => t.tech);
  const movers: Mover[] = [];
  if (total[3]! >= MIN_N) {
    const previousMonths = [0, 1, 2].filter((i) => total[i]! >= MIN_N);
    for (const [id, values] of counts) {
      if (!previousMonths.length || values[3]! + sum(previousMonths.map((i) => values[i]!)) < MIN_N) continue;
      const recent = values[3]! / total[3]!;
      const previous = sum(previousMonths.map((i) => values[i]! / total[i]!)) / previousMonths.length;
      movers.push({ id, recent, previous, delta: recent - previous });
    }
  }
  return { ...rankMovers(movers, limit), partial: months.some((m) => isPartialMonth(meta, m)) };
}

export type Mode = 'absolute' | 'index' | 'share';

/**
 * Courbes en valeur absolue, en base 100 (première période d'au moins 5 offres) ou en part du
 * total (périodes d'au moins 5 offres au total).
 */
export function applyMode(series: ReadonlyMap<string, number[]>, total: readonly number[], mode: Mode): Map<string, (number | null)[]> {
  const out = new Map<string, (number | null)[]>();
  for (const [key, values] of series) {
    if (mode === 'absolute') out.set(key, [...values]);
    else if (mode === 'share') out.set(key, values.map((v, i) => shareOf(v, total[i] ?? 0)));
    else {
      const start = values.findIndex((v) => v >= MIN_N);
      out.set(key, start < 0 ? values.map(() => null) : values.map((v, i) => (i < start ? null : (v / values[start]!) * 100)));
    }
  }
  return out;
}

/** Index des salaires par cellule (mois, groupe, rôle, expérience, région). */
export function salaryLookup(rows: readonly SalaryRow[]) {
  const index = indexBy(rows, (r) => [r.month, r.group, r.role, r.experience, r.region].join('|'));
  return (month: string, group: string, role: string, experience: string, region: string): SalaryRow | undefined =>
    index.get([month, group, role, experience, region].join('|'));
}

export interface RoleStats {
  role: string;
  group: string;
  n: number;
  /** Variation des 13 dernières semaines complètes contre les 13 précédentes. */
  variation: number | null;
  variationPartial: boolean;
  salary: SalaryRow | undefined;
  remote: ShareValue;
}

/**
 * Tableau des rôles (page Métiers) : volume sur la période, variation sur 3 mois, médiane
 * salariale des 12 derniers mois, part de télétravail parmi les offres qui la précisent.
 */
export function roleTable(
  rows: readonly NewOfferRow[],
  conditions: readonly ConditionRow[],
  salaries: readonly SalaryRow[],
  meta: Meta,
  filters: Filters,
  scope: Scope,
  weeks: readonly string[],
  months: readonly string[],
): RoleStats[] {
  const volume = sumSeries(rows, weeks, (r) => r.week, (r) => r.role);
  const end = referenceWeek(meta);
  const window = lastWeeks(end, 26);
  const trend = sumSeries(rows, window, (r) => r.week, (r) => r.role);
  const trendPartial = window.some((w) => isPartialWeek(meta, w));
  const salary = salaryLookup(salaries);
  const monthSet = new Set(months);
  const remote = new Map<string, { part: number; total: number }>();
  for (const c of conditions) {
    if (c.dimension !== 'remote' || c.value === 'unknown' || !monthSet.has(c.month)) continue;
    const entry = remote.get(c.role) ?? { part: 0, total: 0 };
    entry.total += c.n;
    if (c.value === 'full_remote' || c.value === 'hybrid') entry.part += c.n;
    remote.set(c.role, entry);
  }
  return meta.labels.roles
    .filter((r) => scope.roleOk(r.id))
    .map((r) => {
      const values = trend.get(r.id) ?? zeros(26);
      const previous = sum(values.slice(0, 13));
      const recent = sum(values.slice(13));
      const telework = remote.get(r.id) ?? { part: 0, total: 0 };
      return {
        role: r.id,
        group: r.group,
        n: sum(volume.get(r.id) ?? []),
        variation: previous >= MIN_N ? (recent - previous) / previous : null,
        variationPartial: trendPartial,
        salary: salary(ALL, r.group, r.id, ALL, filters.region),
        remote: { ...telework, share: shareOf(telework.part, telework.total) },
      };
    })
    .filter((r) => r.n > 0 || r.salary !== undefined)
    .sort((a, b) => b.n - a.n || a.role.localeCompare(b.role));
}

export interface RegionTotals {
  n: number;
  nCore: number;
  nAi: number;
  density: number | null;
}

/**
 * Totaux régionaux (indicateur 11a) : lignes `*` pour les 12 derniers mois, sinon somme des
 * mois demandés ; densité recalculée pour 100 000 actifs.
 */
export function regionTotals(rows: readonly GeoRegionRow[], months: readonly string[] | null, meta: Meta): Map<string, RegionTotals> {
  const population = new Map(meta.labels.regions.map((r) => [r.code, r.population]));
  const monthSet = months ? new Set(months) : null;
  const totals = new Map<string, RegionTotals>();
  for (const row of rows) {
    if (monthSet ? !monthSet.has(row.month) : row.month !== ALL) continue;
    const entry = totals.get(row.region) ?? { n: 0, nCore: 0, nAi: 0, density: null };
    entry.n += row.n;
    entry.nCore += row.nCore;
    entry.nAi += row.nAi;
    totals.set(row.region, entry);
  }
  for (const [region, entry] of totals) {
    const pop = population.get(region);
    entry.density = pop ? Math.round((entry.nCore * 100_000 * 100) / pop) / 100 : null;
  }
  return totals;
}
