// Fichiers d'agrégats lus par le dashboard (SPEC.md §7.2), tels que produits par
// `src/pipeline/aggregates`.

export type Cell = string | number | boolean | null;

export interface Table {
  columns: string[];
  rows: Cell[][];
}

export interface GroupLabel {
  id: string;
  label: string;
  status: string;
  dashboard: boolean;
}

export interface RoleLabel {
  id: string;
  label: string;
  group: string;
  status: string;
}

export interface RegionLabel {
  code: string;
  label: string;
  drom: boolean;
  population: number | null;
}

export interface Meta {
  generatedAt: string;
  lastRun: { runId: string; status: string; collectStatus: string; coverageComplete: boolean } | null;
  runs: string[];
  firstRun: string;
  backfillBefore: string;
  partialWeeks: string[];
  partialMonths: string[];
  rollingMonths: string[];
  taxonomy: { version: number; updated: string };
  taxonomyHistory: { version: number; date: string }[];
  aiGroups: string[];
  devGroup: string;
  sources: { id: string; label: string }[];
  population: { source: string; millesime: string; description: string };
  labels: {
    groups: GroupLabel[];
    roles: RoleLabel[];
    technologyFamilies: { id: string; label: string }[];
    technologies: { id: string; label: string; family: string; status: string }[];
    regions: RegionLabel[];
    employerTypes: { id: string; label: string }[];
    contracts: Record<string, string>;
    experience: Record<string, string>;
    remote: Record<string, string>;
  };
}

export interface TimeseriesFile {
  newOffers: Table;
  stock: Table;
}

export interface SalariesFile {
  salaries: Table;
  aiPremium: Table;
  tjm: Table;
}

export interface TechsFile {
  techs: Table;
  totals: Table;
}

export interface EmergingFile {
  unclassified: Table;
  ngrams: Table;
  roles: Table;
}
