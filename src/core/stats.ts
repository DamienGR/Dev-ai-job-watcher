// Statistiques descriptives des agrégats (SPEC.md §7).

/** Effectif minimum pour publier des quantiles (SPEC.md §6.3, §8.3). */
export const MIN_N = 5;

/** Quantile `q` (0 à 1) par interpolation linéaire (méthode 7 de R, celle des tableurs). */
export function quantile(sorted: readonly number[], q: number): number {
  if (sorted.length === 0) throw new Error('quantile : liste vide');
  const position = (sorted.length - 1) * q;
  const low = Math.floor(position);
  const high = Math.ceil(position);
  return sorted[low]! + (sorted[high]! - sorted[low]!) * (position - low);
}

export interface Quartiles {
  n: number;
  p25: number | null;
  p50: number | null;
  p75: number | null;
}

/** p25, médiane et p75 arrondis à l'unité ; `null` si moins de `MIN_N` valeurs. */
export function quartiles(values: readonly number[]): Quartiles {
  if (values.length < MIN_N) return { n: values.length, p25: null, p50: null, p75: null };
  const sorted = [...values].sort((a, b) => a - b);
  return {
    n: values.length,
    p25: Math.round(quantile(sorted, 0.25)),
    p50: Math.round(quantile(sorted, 0.5)),
    p75: Math.round(quantile(sorted, 0.75)),
  };
}
