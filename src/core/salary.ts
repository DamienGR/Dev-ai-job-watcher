import { normalize } from './normalize';

// Salaires et TJM (SPEC.md §6.3). TJM livré au lot 0 (cas de signaux de l'annexe B), salaires
// au lot 2.

/** Bornes de cohérence d'un salaire brut annuel, en euros (SPEC.md §6.3, exigé). */
export const SALARY_MIN = 18_000;
export const SALARY_MAX = 250_000;
/** Durée légale annuelle du travail : conversion d'un taux horaire en brut annuel. */
export const HOURS_PER_YEAR = 1607;

export interface Salary {
  minAnnual: number | null;
  maxAnnual: number | null;
  midAnnual: number | null;
  source: 'declared' | 'predicted' | 'none';
  raw: string | null;
}

export interface SalaryParse {
  salary: Salary;
  /** Au moins un montant lu mais écarté par les bornes de cohérence (à journaliser). */
  outOfBounds: boolean;
}

const inBounds = (value: number) => value >= SALARY_MIN && value <= SALARY_MAX;

/**
 * Salaire à partir de bornes déjà annuelles : bornes hors de [18 000, 250 000] écartées,
 * inversion si `min > max`, `midAnnual` = moyenne des bornes ou valeur unique.
 */
function fromAnnual(values: number[], raw: string | null, source: 'declared' | 'predicted'): SalaryParse {
  const kept = values.filter(inBounds);
  const outOfBounds = kept.length < values.length;
  if (kept.length === 0) return { salary: noSalary(raw), outOfBounds };
  const min = Math.round(Math.min(...kept));
  const max = Math.round(Math.max(...kept));
  return { salary: { minAnnual: min, maxAnnual: max, midAnnual: Math.round((min + max) / 2), source, raw }, outOfBounds };
}

function noSalary(raw: string | null): Salary {
  return { minAnnual: null, maxAnnual: null, midAnnual: null, source: 'none', raw };
}

// « Annuel de 50000.0 Euros à 55000.0 Euros sur 12 mois », « Horaire de 11.88 Euros »… ; la suite
// éventuelle (« - Mutuelle + TR ») est un commentaire libre de l'employeur, ignoré.
const FT_LIBELLE =
  /^\s*(annuel|mensuel|horaire) de (\d+(?:\.\d+)?) euros(?: [àa] (\d+(?:\.\d+)?) euros)?(?: sur (\d+(?:[.,]\d+)?) mois)?/i;

/** `salaire.libelle` de France Travail ; `null` si le format n'est pas reconnu. */
function parseFtLibelle(libelle: string): number[] | null {
  const match = FT_LIBELLE.exec(libelle);
  if (!match) return null;
  const [, unit, low, high, months] = match;
  const kind = unit!.toLowerCase();
  // Le nombre de mois figure parfois dans le commentaire accolé (« … Euros - sur 13 mois »).
  const monthCount = months ?? /\bsur (\d+(?:[.,]\d+)?) mois\b/i.exec(libelle)?.[1] ?? '12';
  const factor = kind === 'annuel' ? 1 : kind === 'mensuel' ? Number(monthCount.replace(',', '.')) : HOURS_PER_YEAR;
  return [low, high].filter((v): v is string => v !== undefined).map((v) => Number(v) * factor);
}

// Commentaire libre (texte normalisé) : « 45 - 55 k€ », « 45k-55k », « 45 000 - 50 000 € annuel
// brut », « de 40 à 45 k€ ». Montant : milliers séparés par une espace ou un point, décimales.
const SALARY_AMOUNT = String.raw`(\d{1,3}(?:[ .\u00a0\u202f]\d{3})+(?!\d)|\d+(?:[.,]\d+)?)`;
const CURRENCY_OPT = String.raw`\s*(?:€|euros?\b|eur\b)?`;
const COMMENT_RANGE = new RegExp(
  String.raw`${SALARY_AMOUNT}\s*(k(?![a-z]))?${CURRENCY_OPT}\s*(?:-|a|au|et)\s*${SALARY_AMOUNT}\s*(k(?![a-z]))?${CURRENCY_OPT}`,
  'gi',
);
const COMMENT_SINGLE = new RegExp(String.raw`${SALARY_AMOUNT}\s*(k(?![a-z])|€|euros?\b)`, 'gi');
const MONTHLY = /\b(mois|mensuel(le)?|mensuellement)\b/;
const YEARLY = /\b(an|ans|annuel(le)?|annuellement)\b|\/ ?an\b/;

function toNumber(amount: string): number {
  return Number(amount.replace(/[ .\u00a0\u202f](?=\d{3}(?!\d))/g, '').replace(',', '.'));
}

/** Montant annuel d'un nombre lu dans un commentaire, ou `null` s'il n'est pas un salaire. */
function annualAmount(value: number, k: boolean, monthly: boolean): number | null {
  if (k) return value < 1000 ? value * 1000 : value;
  if (value >= 10_000) return value;
  if (value >= 1000 && monthly) return value * 12;
  return null;
}

/**
 * Montants annuels d'un commentaire de salaire : un montant suivi de « k » vaut des milliers
 * (« 45 - 55 k€ » : le « k » final s'applique aux deux bornes) ; sans « k », un montant d'au
 * moins 10 000 est annuel, un montant de 1 000 à 9 999 est mensuel si le texte parle de mois
 * et non d'année (× 12). Les petits montants (« 500 € par jour », « 3 à 5 ans ») sont ignorés.
 * Première fourchette exploitable, sinon premier montant exploitable suivi d'une devise ou d'un « k ».
 */
function parseFtCommentaire(commentaire: string): number[] | null {
  const text = normalize(commentaire);
  const monthly = MONTHLY.test(text) && !YEARLY.test(text);
  for (const range of text.matchAll(COMMENT_RANGE)) {
    const k = Boolean(range[4]);
    const values = [
      annualAmount(toNumber(range[1]!), Boolean(range[2]) || k, monthly),
      annualAmount(toNumber(range[3]!), k, monthly),
    ].filter((v): v is number => v !== null);
    if (values.length > 0) return values;
  }
  for (const single of text.matchAll(COMMENT_SINGLE)) {
    const value = annualAmount(toNumber(single[1]!), single[2]!.toLowerCase() === 'k', monthly);
    if (value !== null) return [value];
  }
  return null;
}

/**
 * Salaire d'une offre France Travail (SPEC.md §6.3, exigé) : `salaire.libelle`, puis repli sur
 * `salaire.commentaire`. Tout est ramené en brut annuel (mensuel × nombre de mois, 12 par
 * défaut ; horaire × 1 607 h) ; rien d'exploitable donne `source='none'`.
 */
export function parseFtSalary(libelle: string | null | undefined, commentaire: string | null | undefined): SalaryParse {
  const raw = [libelle, commentaire].filter((v): v is string => typeof v === 'string' && v.trim() !== '').join(' | ') || null;
  const fromLibelle = libelle ? parseFtLibelle(libelle) : null;
  const values = fromLibelle ?? (commentaire ? parseFtCommentaire(commentaire) : null);
  if (!values) return { salary: noSalary(raw), outOfBounds: false };
  return fromAnnual(values, raw, 'declared');
}

/**
 * Salaire Adzuna (SPEC.md §6.3) : `salary_min` / `salary_max` déjà annuels ;
 * `salary_is_predicted = 1` donne `source='predicted'`, exclu de toutes les statistiques (exigé).
 */
export function adzunaSalary(
  min: number | null | undefined,
  max: number | null | undefined,
  isPredicted: string | number | boolean | null | undefined,
): SalaryParse {
  const values = [min, max].filter((v): v is number => typeof v === 'number' && Number.isFinite(v));
  const raw = values.length > 0 ? values.join(' - ') : null;
  if (values.length === 0) return { salary: noSalary(raw), outOfBounds: false };
  const predicted = isPredicted === true || isPredicted === 1 || isPredicted === '1';
  return fromAnnual(values, raw, predicted ? 'predicted' : 'declared');
}

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
