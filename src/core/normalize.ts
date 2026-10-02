/**
 * Normalisation de texte de référence (SPEC.md §6.4, exigée).
 *
 * Les motifs de taxonomy.yaml sont écrits pour ce texte : minuscules, sans accents,
 * apostrophes typographiques remplacées par `'`, marqueurs de genre supprimés
 * (« (H/F) », « F/H/X », « ·se », « (e) »…), espaces compactés.
 */
export function normalize(s: string): string {
  return s
    .replace(/[’‘`´]/g, "'") // apostrophes
    .replace(/œ/gi, 'oe')
    .replace(/æ/gi, 'ae') // ligatures
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // accents
    .toLowerCase()
    .replace(/\(\s*(h|f|x|nb|n|m|w|d)(\s*[/,-]\s*(h|f|x|nb|n|m|w|d))+\s*\)/g, ' ') // (H/F), (f/h/n)…
    .replace(/\b(h|f)\s*\/\s*(h|f)(\s*\/\s*(x|nb))?\b/g, ' ') // H/F, F/H/X sans parenthèses
    .replace(/(eur|teur)[·.]?(se|euse|rice|ice)\b/g, '$1') // développeur·se, développeurse
    .replace(/[·.]e(s)?\b(?!\w)/g, '') // consultant·e, ingénieur.e
    .replace(/\((e|se|ne|euse|rice)\)/g, '') // ingénieur(e), développeur(se)
    .replace(/[|–—_]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
