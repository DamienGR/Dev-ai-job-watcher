import { normalize } from './normalize';
import type { Offer } from './offer';
import { matchesAny, type CompiledTaxonomy } from './taxonomy';

// Employeurs (SPEC.md §6.7) : nom normalisé et type d'employeur.

const LEGAL_WORDS = /\b(sas|sasu|sa|sarl|eurl|se|groupe|group|france)\b/g;

/**
 * `companyNorm` (SPEC.md §6.7) : normalisation §6.4, puis suppression de la ponctuation, des
 * formes juridiques (`sas`, `sasu`, `sa`, `sarl`, `eurl`, `se`) et des mots `groupe`, `group`,
 * `france`. `null` si rien ne reste.
 */
export function normalizeCompany(name: string | null | undefined): string | null {
  if (!name) return null;
  const norm = normalize(name)
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .replace(LEGAL_WORDS, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return norm || null;
}

/**
 * Type d'employeur (SPEC.md §6.7) : premier type de la taxonomie dont un préfixe NAF ou un
 * motif de nom reconnaît l'offre. `*` ne vaut que si le NAF est connu. Les motifs de nom sont
 * essayés sur `companyNorm` et sur le nom normalisé avec sa ponctuation, pour les noms qui en
 * contiennent (« ap-hp », « ernst & young »).
 */
export function employerType(
  nafCode: string | null,
  company: string | null,
  companyNorm: string | null,
  taxonomy: CompiledTaxonomy,
): Offer['employerType'] {
  const naf = nafCode?.trim().toUpperCase() || null;
  const names = [companyNorm, company ? normalize(company) : null].filter((n): n is string => Boolean(n));
  for (const type of taxonomy.employerTypes) {
    const byNaf = naf !== null && type.nafPrefixes.some((prefix) => prefix === '*' || naf.startsWith(prefix));
    if (byNaf || names.some((name) => matchesAny(type.namePatterns, name))) return type.id;
  }
  return 'inconnu';
}
