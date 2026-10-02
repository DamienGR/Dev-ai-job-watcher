import { normalize } from '../../core/normalize';
import type { Taxonomy } from '../../core/taxonomy';
import type { PartitionState } from '../../pipeline/runState';
import { DEPARTEMENTS, REGIONS } from '../../refs';

/**
 * Plafond de résultats accessibles par requête (SPEC.md §4.1) : borne prudente de la spec,
 * cohérente avec la limite documentée de `range` (dernier indice 1149). À confirmer sur l'API.
 */
export const FT_MAX_RESULTS = 1150;
/** Borne basse des découpages par date de création. */
export const EARLIEST_CREATION = Date.UTC(2000, 0, 1);

export type FtPartition = Pick<PartitionState, 'id' | 'stem' | 'parent' | 'pass' | 'level' | 'params'>;

export interface SplitContext {
  romeCodes: readonly string[];
  /** Borne haute des découpages par dates : début du run, pour des clés stables à la reprise. */
  referenceTime: Date;
}

export function romeCodes(t: Taxonomy): string[] {
  return [...t.rome_codes.core, ...t.rome_codes.secondary, ...t.rome_codes.extended];
}

export function slug(text: string): string {
  return normalize(text)
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** Mots-clés de la passe B : rôles actifs des groupes `keyword_pass`, sans doublon. */
export function collectionKeywords(t: Taxonomy): string[] {
  const groups = new Set(t.groups.filter((g) => g.keyword_pass).map((g) => g.id));
  const bySlug = new Map<string, string>();
  for (const role of t.roles) {
    if (role.status === 'deprecated' || !groups.has(role.group)) continue;
    for (const keyword of role.keywords ?? []) {
      const key = slug(keyword);
      if (key && !bySlug.has(key)) bySlug.set(key, keyword);
    }
  }
  return [...bySlug.values()];
}

/** Partitions de départ : passe A par département, passe B par mot-clé (SPEC.md §4.1). */
export function rootPartitions(t: Taxonomy): FtPartition[] {
  const codeROME = romeCodes(t).join(',');
  const passA = DEPARTEMENTS.map(
    (d): FtPartition => ({
      id: `a-d${d.code.toLowerCase()}`,
      stem: `a-d${d.code.toLowerCase()}`,
      parent: null,
      pass: 'A',
      level: 'departement',
      params: { codeROME, departement: d.code },
    }),
  );
  const passB = collectionKeywords(t).map(
    (keyword): FtPartition => ({
      id: `b-k${slug(keyword)}`,
      stem: `b-k${slug(keyword)}`,
      parent: null,
      pass: 'B',
      level: 'keyword',
      params: { motsCles: keyword },
    }),
  );
  return [...passA, ...passB];
}

/** Date au format attendu par `minCreationDate` / `maxCreationDate` : 2026-10-05T00:00:00Z. */
export function formatFtDate(ms: number): string {
  return new Date(ms).toISOString().replace(/\.\d{3}Z$/, 'Z');
}

function compactDate(ms: number): string {
  return formatFtDate(ms).replace(/[-:Z]/g, '').toLowerCase();
}

function child(p: FtPartition, suffix: string, level: string, params: Record<string, string>): FtPartition {
  const id = `${p.id}-${suffix}`;
  return { id, stem: id, parent: p.id, pass: p.pass, level, params };
}

/** Découpe par dates de création en deux moitiés ; aucune si la fenêtre fait moins de 2 s. */
function splitByDates(p: FtPartition, referenceTime: Date): FtPartition[] {
  const [min, max] =
    p.level === 'dates'
      ? [Date.parse(p.params.minCreationDate ?? ''), Date.parse(p.params.maxCreationDate ?? '')]
      : [EARLIEST_CREATION, Math.floor(referenceTime.getTime() / 1000) * 1000];
  if (!(max - min >= 2000)) return [];
  const mid = Math.floor((min + max) / 2 / 1000) * 1000;
  return [
    [min, mid],
    [mid + 1000, max],
  ].map(([from, to]) => ({
    id: `${p.stem}-c${compactDate(from!)}-${compactDate(to!)}`,
    stem: p.stem,
    parent: p.id,
    pass: p.pass,
    level: 'dates',
    params: { ...p.params, minCreationDate: formatFtDate(from!), maxCreationDate: formatFtDate(to!) },
  }));
}

/**
 * Sous-partitions d'une partition dont le total dépasse le plafond (SPEC.md §4.1) :
 * passe A par code ROME puis par dates ; passe B par région, puis département, puis dates.
 * Liste vide si plus aucun découpage n'est possible.
 */
export function splitPartition(p: FtPartition, { romeCodes: codes, referenceTime }: SplitContext): FtPartition[] {
  if (p.pass === 'A' && p.level === 'departement' && codes.length > 1) {
    return codes.map((code) => child(p, `r${code.toLowerCase()}`, 'rome', { ...p.params, codeROME: code }));
  }
  if (p.pass === 'B' && p.level === 'keyword') {
    return REGIONS.map((r) => child(p, `g${r.code}`, 'region', { ...p.params, region: r.code }));
  }
  if (p.pass === 'B' && p.level === 'region') {
    const departements = DEPARTEMENTS.filter((d) => d.region === p.params.region);
    if (departements.length > 1) {
      const params = { ...p.params };
      delete params.region;
      return departements.map((d) =>
        child(p, `d${d.code.toLowerCase()}`, 'departement', { ...params, departement: d.code }),
      );
    }
  }
  return splitByDates(p, referenceTime);
}
