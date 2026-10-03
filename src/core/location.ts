import { REGIONS, regionOfDepartement, type RegionCode } from '../refs';
import { normalize } from './normalize';
import type { Offer } from './offer';

// Localisation des offres (SPEC.md §6.2) : commune INSEE → département → région, avec repli
// sur le libellé du lieu de travail.

export type OfferLocation = Offer['location'];

/**
 * Département d'un code commune INSEE : 3 caractères pour les DROM (`97411` → `974`),
 * 2 sinon (`2A004` → `2A`). `null` si le code est mal formé.
 */
export function departementOfCommune(code: string): string | null {
  const commune = code.trim().toUpperCase();
  if (!/^(\d{5}|2[AB]\d{3})$/.test(commune)) return null;
  return commune.startsWith('97') || commune.startsWith('98') ? commune.slice(0, 3) : commune.slice(0, 2);
}

const placeKey = (text: string) =>
  normalize(text)
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

/** Anciennes régions (avant 2016) et abréviations courantes → code de la région actuelle. */
const REGION_ALIASES: Record<string, RegionCode> = {
  alsace: '44',
  lorraine: '44',
  'champagne ardenne': '44',
  aquitaine: '75',
  limousin: '75',
  'poitou charentes': '75',
  auvergne: '84',
  'rhone alpes': '84',
  bourgogne: '27',
  'franche comte': '27',
  'basse normandie': '28',
  'haute normandie': '28',
  'languedoc roussillon': '76',
  'midi pyrenees': '76',
  'nord pas de calais': '32',
  picardie: '32',
  centre: '24',
  paca: '93',
  idf: '11',
  reunion: '04',
};

const REGION_BY_NAME = new Map<string, RegionCode>([
  ...REGIONS.map((r): [string, RegionCode] => [placeKey(r.nom), r.code]),
  ...Object.entries(REGION_ALIASES),
]);

/** Code région d'un libellé de région (« Île-de-France », « Ile-de-France », « Rhône-Alpes »…). */
export function regionOfName(label: string): RegionCode | null {
  return REGION_BY_NAME.get(placeKey(label)) ?? null;
}

/** « 31 - Toulouse », « 974 - Saint-Denis », « 2A - Ajaccio » : département en préfixe. */
const DEPARTEMENT_PREFIX = /^\s*(\d{2,3}|2[AB])\s+-\s+/i;

export interface FtLieuTravail {
  libelle?: string | null;
  commune?: string | null;
  latitude?: number | null;
  longitude?: number | null;
}

const coordinate = (value: unknown, limit: number): number | null =>
  typeof value === 'number' && Number.isFinite(value) && Math.abs(value) <= limit ? value : null;

/**
 * Localisation d'une offre France Travail (SPEC.md §6.2), du plus précis au moins précis :
 * code commune, préfixe département du libellé, nom de région, « France ». Une collectivité
 * d'outre-mer hors des 18 régions (Saint-Barthélemy…) est en France mais sans région :
 * `precision='pays'`. Sans libellé ni commune : `precision='aucune'`.
 *
 * Renvoie `null` pour une offre localisée hors de France (code pays 99, ou tout autre libellé :
 * « Luxembourg », « Montréal, QC, Canada »…), à exclure.
 */
export function ftLocation(lieu: FtLieuTravail | null | undefined): OfferLocation | null {
  const label = lieu?.libelle?.trim() || null;
  const lat = coordinate(lieu?.latitude, 90);
  const lng = coordinate(lieu?.longitude, 180);
  const base = { label, communeInsee: null, departement: null, region: null, lat, lng };

  const commune = lieu?.commune?.trim().toUpperCase() || null;
  const fromCommune = commune ? departementOfCommune(commune) : null;
  const fromLabel = label ? DEPARTEMENT_PREFIX.exec(label)?.[1]?.toUpperCase() ?? null : null;
  const departement = fromCommune ?? fromLabel;
  // Code 99 : pays étranger dans la nomenclature INSEE.
  if (departement === '99') return null;
  if (departement) {
    const region = regionOfDepartement(departement);
    const communeInsee = fromCommune ? commune : null;
    if (!region) return { ...base, communeInsee, precision: 'pays' };
    return { ...base, communeInsee, departement, region, precision: fromCommune ? 'commune' : 'departement' };
  }

  if (!label) return { ...base, precision: 'aucune' };
  const region = regionOfName(label);
  if (region) return { ...base, region, precision: 'region' };
  if (placeKey(label) === 'france') return { ...base, precision: 'pays' };
  return null;
}
