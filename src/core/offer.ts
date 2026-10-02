import type { RegionCode } from '../refs';

// Schéma normalisé d'une offre (SPEC.md §6.1, exigé). Produit par `Source.normalize` à
// partir du lot 2.

export type SourceId = 'francetravail' | 'adzuna';

export interface Offer {
  uid: string; // `${source}:${sourceId}`
  source: SourceId;
  sourceId: string;
  runId: string; // semaine ISO de collecte, ex. "2026-W41"
  collectedVia: ('rome' | 'keyword' | 'category')[];
  title: string; // intitulé brut
  titleNorm: string; // intitulé normalisé (§6.4)
  description: string;
  descriptionIsFull: boolean; // true pour France Travail, false pour Adzuna
  createdAt: string; // ISO 8601, date de création à la source
  firstSeenRun: string;
  lastSeenRun: string;
  closedRun: string | null; // première semaine où l'offre n'apparaît plus (France Travail)
  isBackfill: boolean; // découverte au premier run alors que créée avant (§6.9)
  company: string | null;
  companyNorm: string | null;
  employerType:
    | 'recrutement_interim'
    | 'esn_conseil'
    | 'public_recherche'
    | 'editeur_logiciel'
    | 'client_final'
    | 'inconnu';
  nafCode: string | null;
  companySizeBand: string | null;
  location: {
    label: string | null;
    communeInsee: string | null;
    departement: string | null;
    region: RegionCode | null;
    lat: number | null;
    lng: number | null;
    precision: 'commune' | 'departement' | 'region' | 'pays' | 'aucune';
  };
  remote: 'full_remote' | 'hybrid' | 'on_site' | 'unknown';
  contract: 'cdi' | 'cdd' | 'interim' | 'freelance' | 'alternance' | 'stage' | 'autre' | 'unknown';
  fullTime: boolean | null;
  experience: 'debutant' | '1_3' | '3_5' | '5_plus' | 'unknown';
  cadre: boolean | null;
  salary: {
    minAnnual: number | null; // brut annuel en euros
    maxAnnual: number | null;
    midAnnual: number | null;
    source: 'declared' | 'predicted' | 'none';
    raw: string | null;
  };
  tjm: { min: number | null; max: number | null } | null;
  romeCode: string | null;
  role: string; // id de rôle, ou 'non_classe'
  group: string; // id de groupe, ou 'non_classe'
  secondaryRoles: string[];
  requalified: boolean;
  signals: { aiAny: boolean; genai: boolean; travel: boolean };
  techs: string[]; // ids de technologies
  taxonomyVersion: number;
  dedup: { key: string | null; duplicateOf: string | null };
}
