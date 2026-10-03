import { z } from 'zod';
import { classify } from '../../core/classify';
import { dedupKey } from '../../core/dedup';
import { employerType, normalizeCompany } from '../../core/employer';
import { ftLocation } from '../../core/location';
import { normalize } from '../../core/normalize';
import type { Offer } from '../../core/offer';
import { parseFtSalary, parseTjm } from '../../core/salary';
import { detectSignals, detectTechs } from '../../core/signals';
import { matchesAny, type CompiledTaxonomy } from '../../core/taxonomy';
import type { FtRawPartition } from './collect';

// Normalisation des offres France Travail vers le schéma `Offer` (SPEC.md §6.1).

const text = z.string().nullish();
const number = z.union([z.number(), z.string()]).nullish().transform((v) => {
  const n = typeof v === 'string' ? Number(v) : v;
  return typeof n === 'number' && Number.isFinite(n) ? n : null;
});

/** Champs exploités d'une offre de l'API ; les autres sont ignorés. */
const ftOfferSchema = z.looseObject({
  id: z.string().min(1),
  intitule: z.string().min(1),
  description: text,
  dateCreation: z.string().refine((v) => Number.isFinite(Date.parse(v)), { message: 'date invalide' }),
  lieuTravail: z
    .looseObject({ libelle: text, commune: text, latitude: number, longitude: number })
    .nullish(),
  romeCode: text,
  entreprise: z.looseObject({ nom: text }).nullish(),
  typeContrat: text,
  natureContrat: text,
  alternance: z.boolean().nullish(),
  experienceExige: text,
  experienceLibelle: text,
  salaire: z.looseObject({ libelle: text, commentaire: text }).nullish(),
  dureeTravailLibelleConverti: text,
  qualificationCode: z.union([z.string(), z.number()]).nullish(),
  codeNAF: text,
  trancheEffectifEtab: text,
});

type FtOfferFields = z.infer<typeof ftOfferSchema>;

const CONTRACTS: Record<string, Offer['contract']> = { CDI: 'cdi', CDD: 'cdd', MIS: 'interim', LIB: 'freelance' };

/**
 * Contrat (SPEC.md §6.1, D18) : `CDI`, `CDD`, `MIS` (intérim), `LIB` (libéral → freelance),
 * autres codes → `autre` ; alternance (drapeau ou contrat d'apprentissage / de
 * professionnalisation) → `alternance`.
 */
export function ftContract(o: Pick<FtOfferFields, 'typeContrat' | 'natureContrat' | 'alternance'>): Offer['contract'] {
  if (o.alternance === true || /apprentissage|professionnalisation/i.test(o.natureContrat ?? '')) return 'alternance';
  if (!o.typeContrat) return 'unknown';
  return CONTRACTS[o.typeContrat.toUpperCase()] ?? 'autre';
}

/**
 * Expérience : `D` (débutant accepté) → `debutant` ; sinon durée de `experienceLibelle`
 * (« 3 An(s) », « 18 Mois ») ramenée en années : moins d'un an → `debutant`, puis 1-3, 3-5,
 * 5 et plus. Sans durée (« Expérience exigée ») → `unknown`.
 */
export function ftExperience(exige: string | null | undefined, libelle: string | null | undefined): Offer['experience'] {
  if (exige?.toUpperCase() === 'D') return 'debutant';
  const label = normalize(libelle ?? '');
  if (/^debutant/.test(label)) return 'debutant';
  const match = /(\d+(?:[.,]\d+)?)\s*(an|mois)/.exec(label);
  if (!match) return 'unknown';
  const years = Number(match[1]!.replace(',', '.')) / (match[2] === 'mois' ? 12 : 1);
  if (years < 1) return 'debutant';
  if (years < 3) return '1_3';
  if (years < 5) return '3_5';
  return '5_plus';
}

/** Statut cadre : `qualificationCode` 9 (« Cadre ») ; absent → `null`. */
export function ftCadre(code: string | number | null | undefined): boolean | null {
  if (code === null || code === undefined || String(code).trim() === '') return null;
  return String(code).trim() === '9';
}

/** Temps plein / partiel d'après `dureeTravailLibelleConverti`. */
export function ftFullTime(label: string | null | undefined): boolean | null {
  const norm = normalize(label ?? '');
  if (norm.includes('plein')) return true;
  if (norm.includes('partiel')) return false;
  return null;
}

export interface FtNormalizeStats {
  /** Offres lues dans les partitions (doublons entre partitions inclus). */
  read: number;
  /** Offres au format inattendu (champs obligatoires absents), écartées. */
  invalid: number;
  /** Offres localisées hors de France, écartées (SPEC.md §6.2). */
  abroad: number;
  /** Libellés des offres écartées comme étrangères, pour la supervision. */
  abroadLabels: Record<string, number>;
  /** Offres dont un montant de salaire a été écarté par les bornes de cohérence. */
  salaryOutOfBounds: number;
}

export function emptyNormalizeStats(): FtNormalizeStats {
  return { read: 0, invalid: 0, abroad: 0, abroadLabels: {}, salaryOutOfBounds: 0 };
}

/**
 * Offre normalisée et classée, ou la raison de son exclusion. Les champs de suivi
 * (`firstSeenRun`, `lastSeenRun`, `closedRun`, `isBackfill`) valent ceux d'une offre vue pour
 * la première fois ; le process les complète avec l'index `seen` (SPEC.md §6.9).
 */
export function normalizeFtOffer(
  raw: unknown,
  ctx: { runId: string; pass: string; taxonomy: CompiledTaxonomy },
): { offer: Offer; salaryOutOfBounds: boolean } | { excluded: 'invalid' } | { excluded: 'abroad'; label: string | null } {
  const parsed = ftOfferSchema.safeParse(raw);
  if (!parsed.success) return { excluded: 'invalid' };
  const o = parsed.data;

  const location = ftLocation(o.lieuTravail);
  if (!location) return { excluded: 'abroad', label: o.lieuTravail?.libelle ?? null };

  const { taxonomy } = ctx;
  const title = o.intitule;
  const description = o.description ?? '';
  const titleNorm = normalize(title);
  const descriptionNorm = normalize(description);
  const classification = classify(titleNorm, descriptionNorm, taxonomy);
  const signals = detectSignals(titleNorm, descriptionNorm, taxonomy);
  const { salary, outOfBounds } = parseFtSalary(o.salaire?.libelle, o.salaire?.commentaire);

  // Le commentaire de salaire porte souvent le TJM des missions (« 500 € par jour »).
  const salaryComment = normalize(o.salaire?.commentaire ?? '');
  const hasTjm = signals.tjm || matchesAny(taxonomy.signals.tjm, salaryComment);
  const tjm = hasTjm ? parseTjm(`${titleNorm} ${descriptionNorm} ${salaryComment}`) : null;

  let contract = ftContract(o);
  if (hasTjm && (contract === 'autre' || contract === 'unknown')) contract = 'freelance';

  const company = o.entreprise?.nom?.trim() || null;
  const companyNorm = normalizeCompany(company);
  const nafCode = o.codeNAF?.trim() || null;

  const offer: Offer = {
    uid: `francetravail:${o.id}`,
    source: 'francetravail',
    sourceId: o.id,
    runId: ctx.runId,
    collectedVia: [ctx.pass === 'A' ? 'rome' : 'keyword'],
    title,
    titleNorm,
    description,
    descriptionIsFull: true,
    createdAt: new Date(Date.parse(o.dateCreation)).toISOString(),
    firstSeenRun: ctx.runId,
    lastSeenRun: ctx.runId,
    closedRun: null,
    isBackfill: false,
    company,
    companyNorm,
    employerType: employerType(nafCode, company, companyNorm, taxonomy),
    nafCode,
    companySizeBand: o.trancheEffectifEtab?.trim() || null,
    location,
    remote: signals.remote,
    contract,
    fullTime: ftFullTime(o.dureeTravailLibelleConverti),
    experience: ftExperience(o.experienceExige, o.experienceLibelle),
    cadre: ftCadre(o.qualificationCode),
    salary,
    tjm,
    romeCode: o.romeCode?.trim() || null,
    role: classification.role,
    group: classification.group,
    secondaryRoles: classification.secondaryRoles,
    requalified: classification.requalified,
    signals: { aiAny: signals.aiAny, genai: signals.genai, travel: signals.travel },
    techs: detectTechs(titleNorm, descriptionNorm, taxonomy),
    taxonomyVersion: taxonomy.version,
    dedup: { key: dedupKey(titleNorm, companyNorm, location.departement, location.region), duplicateOf: null },
  };
  return { offer, salaryOutOfBounds: outOfBounds };
}

/** Offres normalisées d'une partition de `raw` ; `stats` cumule les compteurs. */
export function normalizeFtPartition(
  raw: FtRawPartition,
  taxonomy: CompiledTaxonomy,
  stats: FtNormalizeStats = emptyNormalizeStats(),
): Offer[] {
  const offers: Offer[] = [];
  for (const item of raw.offers) {
    stats.read += 1;
    const result = normalizeFtOffer(item, { runId: raw.runId, pass: raw.partition.pass, taxonomy });
    if ('offer' in result) {
      offers.push(result.offer);
      if (result.salaryOutOfBounds) stats.salaryOutOfBounds += 1;
    } else if (result.excluded === 'abroad') {
      stats.abroad += 1;
      const label = result.label ?? '(sans libellé)';
      stats.abroadLabels[label] = (stats.abroadLabels[label] ?? 0) + 1;
    } else {
      stats.invalid += 1;
    }
  }
  return offers;
}
