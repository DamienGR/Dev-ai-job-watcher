// Fichiers du store `aggregates` (SPEC.md §3.4) : les seuls noms que `api-ingest` accepte et
// que `api-data` sert.

export const AGGREGATE_FILES = [
  'meta.json',
  'timeseries.json',
  'salaries.json',
  'techs.json',
  'conditions.json',
  'employers.json',
  'titles.json',
  'geo-regions.json',
  'geo-points.json',
  'emerging.json',
  'quality.json',
  'adzuna-stats.json',
] as const;

/** Préparation de la revue mensuelle (SPEC.md §9.1), lue par `api-export` au lot 6. */
const REVIEW_FILE = /^review\/\d{4}-(0[1-9]|1[0-2])\.json$/;

export function isAggregateFile(name: string): boolean {
  return (AGGREGATE_FILES as readonly string[]).includes(name) || REVIEW_FILE.test(name);
}

/** Taille maximale d'un fichier envoyé (SPEC.md §3.2 : chaque fichier reste sous 4 Mo). */
export const MAX_AGGREGATE_BYTES = 4 * 1024 * 1024;

/** Fichier envoyé en dernier, pour que le dashboard passe d'un run au suivant d'un seul coup. */
export const META_FILE = 'meta.json';

/** Ordre d'envoi (SPEC.md §3.3) : ordre alphabétique, `meta.json` en dernier. */
export function pushOrder(names: readonly string[]): string[] {
  return [...names].sort((a, b) => Number(a === META_FILE) - Number(b === META_FILE) || (a < b ? -1 : a > b ? 1 : 0));
}
