import { createHash } from 'node:crypto';

// Clé de dédoublonnage inter-sources (SPEC.md §6.8), calculée dès le lot 2 et exploitée au
// lot 3 avec Adzuna. Le dédoublonnage intra-source se fait par `uid`.

const SENIORITY = new Set(['senior', 'junior', 'confirme', 'confirmee', 'experimente', 'experimentee', 'sr', 'jr']);
const STOP_WORDS = new Set([
  'a', 'au', 'aux', 'd', 'de', 'des', 'du', 'en', 'et', 'l', 'la', 'le', 'les', 'ou', 'par', 'pour', 'sur', 'un', 'une',
  'the', 'of', 'and', 'for', 'h', 'f', 'x',
]);

/** `titreClé` : intitulé normalisé sans marqueurs de séniorité ni mots vides. */
export function titleKey(titleNorm: string): string {
  return titleNorm
    .split(/[^a-z0-9+#]+/)
    .filter((word) => word && !SENIORITY.has(word) && !STOP_WORDS.has(word))
    .join(' ');
}

/**
 * `sha1(titreClé + '|' + companyNorm + '|' + (departement ?? region))` ; `null` sans
 * entreprise (pas de dédoublonnage inter-sources, risque de faux positifs).
 */
export function dedupKey(
  titleNorm: string,
  companyNorm: string | null,
  departement: string | null,
  region: string | null,
): string | null {
  if (!companyNorm) return null;
  return createHash('sha1')
    .update(`${titleKey(titleNorm)}|${companyNorm}|${departement ?? region ?? ''}`)
    .digest('hex');
}
