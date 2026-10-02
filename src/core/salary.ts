// Salaires et TJM (SPEC.md §6.3). Le lot 0 ne couvre que l'extraction du TJM, nécessaire
// aux cas de signaux de l'annexe B ; l'analyse des salaires arrive au lot 2.

/** Bornes de cohérence d'un TJM, en euros par jour (SPEC.md §6.3). */
export const TJM_MIN = 150;
export const TJM_MAX = 2000;

export interface TjmRange {
  min: number | null;
  max: number | null;
}

// Montant : « 550 », « 2 500 », « 1.200 » ; les décimales (« 550,00 ») sont ignorées.
const AMOUNT = String.raw`(?<![\d.,])(\d{1,3}(?:[ .\u00a0\u202f]\d{3})+(?!\d)|\d+)(?:[.,]\d{1,2})?`;
const CURRENCY = String.raw`(?:€|eur(?:os?)?\b)`;
const RANGE = String.raw`\s*(?:-|a|et|to)\s*`;

/** « TJM : 550 € », « taux journalier de 400 à 550 », « daily rate: €600 ». */
const AFTER_KEYWORD = new RegExp(
  String.raw`\b(?:tjm|taux journalier|tarif journalier|daily rate)\b\D{0,20}?${AMOUNT}(?:\s*${CURRENCY})?(?:${RANGE}(?:€\s*)?${AMOUNT})?`,
  'gi',
);

/** « 550 €/jour », « 400-550 € HT/j », « €600 per day » (devise obligatoire, vérifiée à part). */
const BEFORE_PER_DAY = new RegExp(
  String.raw`(?:€\s*)?${AMOUNT}(?:\s*${CURRENCY}?${RANGE}(?:€\s*)?${AMOUNT})?\s*${CURRENCY}?\s*(?:ht\s*)?(?:/|par|per)\s*(?:j|jour|day)\b`,
  'gi',
);

function amountsOf(match: RegExpMatchArray): number[] {
  return [match[1], match[2]]
    .filter((group): group is string => group !== undefined)
    .map((group) => Number(group.replace(/[ .\u00a0\u202f]/g, '')));
}

/**
 * Extrait le TJM d'un texte normalisé (SPEC.md §6.4) : montants qui suivent un mot-clé
 * (« tjm », « taux journalier »…) ou précèdent une unité par jour (« €/jour »…). Seuls les
 * montants entre 150 et 2 000 € sont retenus ; sans montant valable, `min` et `max` sont `null`.
 * À n'appeler que si le signal `tjm` est présent.
 */
export function parseTjm(text: string): TjmRange {
  const amounts = [
    ...[...text.matchAll(AFTER_KEYWORD)].flatMap(amountsOf),
    ...[...text.matchAll(BEFORE_PER_DAY)].filter((m) => /€|eur/.test(m[0])).flatMap(amountsOf),
  ].filter((amount) => amount >= TJM_MIN && amount <= TJM_MAX);

  if (amounts.length === 0) return { min: null, max: null };
  return { min: Math.min(...amounts), max: Math.max(...amounts) };
}
