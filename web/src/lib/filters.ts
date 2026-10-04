import type { Meta } from './types';

// Filtres globaux (SPEC.md §8.2), reflétés dans l'URL pour partager une vue.

export type Period = '3m' | '6m' | '12m' | 'all';

export interface Filters {
  period: Period;
  /** Code INSEE de région, ou `*` pour la France entière. */
  region: string;
  /** Groupes retenus ; vide = tous les groupes affichés. */
  groups: string[];
  /** Rôles retenus ; vide = tous les rôles des groupes retenus. */
  roles: string[];
  source: string;
  contract: string;
  /** Inclure le périmètre élargi (g9) et les offres non classées. */
  wide: boolean;
}

export const DEFAULT_FILTERS: Filters = {
  period: '12m',
  region: '*',
  groups: [],
  roles: [],
  source: '*',
  contract: '*',
  wide: false,
};

export const PERIODS: { id: Period; label: string; weeks: number | null; months: number | null }[] = [
  { id: '3m', label: '3 derniers mois', weeks: 13, months: 3 },
  { id: '6m', label: '6 derniers mois', weeks: 26, months: 6 },
  { id: '12m', label: '12 derniers mois', weeks: 52, months: 12 },
  { id: 'all', label: 'Tout l’historique', weeks: null, months: null },
];

/** Noms des paramètres d'URL. */
const KEYS = {
  period: 'periode',
  region: 'region',
  groups: 'groupes',
  roles: 'roles',
  source: 'source',
  contract: 'contrat',
  wide: 'elargi',
} as const;

export const NON_CLASSE = 'non_classe';

const list = (value: string | null): string[] => (value ? value.split(',').filter(Boolean) : []);

/** Filtres lus dans l'URL ; les valeurs inconnues de `meta` sont ignorées. */
export function parseFilters(params: URLSearchParams, meta: Meta): Filters {
  const groups = new Set([...meta.labels.groups.map((g) => g.id), NON_CLASSE]);
  const roles = new Set(meta.labels.roles.map((r) => r.id));
  const regions = new Set(meta.labels.regions.map((r) => r.code));
  const sources = new Set(meta.sources.map((s) => s.id));
  const period = params.get(KEYS.period);
  const region = params.get(KEYS.region);
  const source = params.get(KEYS.source);
  const contract = params.get(KEYS.contract);
  return {
    period: PERIODS.some((p) => p.id === period) ? (period as Period) : DEFAULT_FILTERS.period,
    region: region && regions.has(region) ? region : '*',
    groups: list(params.get(KEYS.groups)).filter((g) => groups.has(g)),
    roles: list(params.get(KEYS.roles)).filter((r) => roles.has(r)),
    source: source && sources.has(source) ? source : '*',
    contract: contract && contract in meta.labels.contracts ? contract : '*',
    wide: params.get(KEYS.wide) === '1',
  };
}

/** Paramètres d'URL des filtres, sans les valeurs par défaut. */
export function filtersToParams(filters: Filters): URLSearchParams {
  const params = new URLSearchParams();
  if (filters.period !== DEFAULT_FILTERS.period) params.set(KEYS.period, filters.period);
  if (filters.region !== '*') params.set(KEYS.region, filters.region);
  if (filters.groups.length) params.set(KEYS.groups, filters.groups.join(','));
  if (filters.roles.length) params.set(KEYS.roles, filters.roles.join(','));
  if (filters.source !== '*') params.set(KEYS.source, filters.source);
  if (filters.contract !== '*') params.set(KEYS.contract, filters.contract);
  if (filters.wide) params.set(KEYS.wide, '1');
  return params;
}

export function periodOf(filters: Filters) {
  return PERIODS.find((p) => p.id === filters.period)!;
}

/** Périmètre d'affichage : groupes et rôles visibles selon les filtres. */
export interface Scope {
  groupOf: ReadonlyMap<string, string>;
  /** Groupes affichés, dans l'ordre de la taxonomie. */
  groups: string[];
  roleOk(role: string): boolean;
  groupOk(group: string): boolean;
  /** Région, source et contrat d'une ligne (dimensions absentes : acceptées). */
  rowOk(row: { region?: string | null; source?: string; contract?: string }): boolean;
}

export function scopeOf(meta: Meta, filters: Filters): Scope {
  const groupOf = new Map(meta.labels.roles.map((r) => [r.id, r.group]));
  const base = meta.labels.groups.filter((g) => g.dashboard || filters.wide).map((g) => g.id);
  if (filters.wide) base.push(NON_CLASSE);
  const groups = filters.groups.length ? base.filter((g) => filters.groups.includes(g)) : base;
  const groupSet = new Set(groups);
  const roles = new Set(filters.roles);
  return {
    groupOf,
    groups,
    groupOk: (group) => groupSet.has(group),
    roleOk: (role) => groupSet.has(groupOf.get(role) ?? '') && (roles.size === 0 || roles.has(role)),
    rowOk: (row) =>
      (filters.region === '*' || row.region === undefined || row.region === filters.region) &&
      (filters.source === '*' || row.source === undefined || row.source === filters.source) &&
      (filters.contract === '*' || row.contract === undefined || row.contract === filters.contract),
  };
}

/** Filtres actifs qu'un indicateur ne peut pas appliquer, pour le signaler sous son titre. */
export function ignoredFilters(filters: Filters, supported: readonly (keyof Filters)[]): string[] {
  const labels: Partial<Record<keyof Filters, string>> = {
    region: 'région',
    groups: 'groupes',
    roles: 'rôles',
    source: 'source',
    contract: 'contrat',
  };
  const active: (keyof Filters)[] = [];
  if (filters.region !== '*') active.push('region');
  if (filters.groups.length) active.push('groups');
  if (filters.roles.length) active.push('roles');
  if (filters.source !== '*') active.push('source');
  if (filters.contract !== '*') active.push('contract');
  return active.filter((key) => !supported.includes(key)).map((key) => labels[key]!);
}
