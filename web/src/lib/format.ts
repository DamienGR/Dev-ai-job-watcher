// Mise en forme des nombres et règle d'affichage n < 5 (SPEC.md §8.3).

/** Effectif minimum pour afficher une statistique (médiane, part, densité, variation). */
export const MIN_N = 5;
export const MASKED = 'n < 5';

const integer = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 });
const decimal = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 1 });

export function fmtInt(value: number): string {
  return integer.format(value);
}

export function fmtDecimal(value: number): string {
  return decimal.format(value);
}

/** Part en pourcentage (« 12,5 % »). */
export function fmtPct(value: number): string {
  return `${decimal.format(value * 100)} %`;
}

/** Variation en pourcentage, signée (« +12 % »). */
export function fmtDeltaPct(value: number): string {
  const sign = value > 0 ? '+' : value < 0 ? '−' : '';
  return `${sign}${integer.format(Math.abs(value * 100))} %`;
}

/** Écart signé en valeur absolue (« +3 », « −2 »). */
export function fmtDelta(value: number, digits = 0): string {
  const sign = value > 0 ? '+' : value < 0 ? '−' : '';
  const abs = Math.abs(value);
  return `${sign}${digits ? decimal.format(abs) : integer.format(abs)}`;
}

/** Salaire annuel en k€ (« 42 k€ »). */
export function fmtSalary(value: number): string {
  return `${decimal.format(Math.round(value / 100) / 10)} k€`;
}

/** TJM en euros (« 550 € »). */
export function fmtEuro(value: number): string {
  return `${integer.format(value)} €`;
}

/** Part `part / total`, ou `null` si le dénominateur est sous le seuil d'affichage. */
export function shareOf(part: number, total: number): number | null {
  return total >= MIN_N ? part / total : null;
}

/** Valeur formatée, ou « n < 5 » si elle est masquée (`null`). */
export function orMasked(value: number | null | undefined, format: (v: number) => string): string {
  return value === null || value === undefined ? MASKED : format(value);
}
