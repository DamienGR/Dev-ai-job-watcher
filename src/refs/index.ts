import departementsData from './departements.json';
import regionsData from './regions.json';

/** Codes INSEE des 13 régions métropolitaines et des 5 DROM (SPEC.md §6.1, §6.2). */
export const REGION_CODES = [
  '84', '27', '53', '24', '94', '44', '32', '11', '28', '75', '76', '52', '93',
  '01', '02', '03', '04', '06',
] as const;

export type RegionCode = (typeof REGION_CODES)[number];

export interface Region {
  code: RegionCode;
  nom: string;
  drom: boolean;
}

export interface Departement {
  /** `01`…`95` avec `2A`/`2B`, puis `971`…`976` pour les DROM. */
  code: string;
  nom: string;
  region: RegionCode;
}

export const REGIONS = regionsData as readonly Region[];
export const DEPARTEMENTS = departementsData as readonly Departement[];

const regionByDepartement = new Map<string, RegionCode>(
  DEPARTEMENTS.map((d) => [d.code, d.region]),
);

export function isRegionCode(code: string): code is RegionCode {
  return (REGION_CODES as readonly string[]).includes(code);
}

/** Région d'un code département, ou `null` si le code est inconnu (offre hors France…). */
export function regionOfDepartement(code: string): RegionCode | null {
  return regionByDepartement.get(code.trim().toUpperCase()) ?? null;
}
