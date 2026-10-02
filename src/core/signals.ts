import { matchesAny, type CompiledTaxonomy } from './taxonomy';

export type RemoteMode = 'full_remote' | 'hybrid' | 'on_site' | 'unknown';

export interface Signals {
  aiAny: boolean;
  genai: boolean;
  /** Rémunération journalière mentionnée ; montants extraits par `parseTjm`. */
  tjm: boolean;
  travel: boolean;
  remote: RemoteMode;
}

const REMOTE_ORDER = ['full_remote', 'hybrid', 'on_site'] as const;

/** Mode de travail : premier mode dont un motif matche, dans l'ordre full_remote > hybrid > on_site. */
export function detectRemote(text: string, taxonomy: CompiledTaxonomy): RemoteMode {
  return REMOTE_ORDER.find((mode) => matchesAny(taxonomy.remote[mode], text)) ?? 'unknown';
}

/**
 * Signaux (SPEC.md §6.6), sur textes normalisés. Portée :
 * - aiAny, genai (§6.6) et tjm (§6.3) : intitulé + description ;
 * - remote, travel : description seule (règle par défaut de taxonomy.yaml).
 */
export function detectSignals(
  titleNorm: string,
  descriptionNorm: string,
  taxonomy: CompiledTaxonomy,
): Signals {
  const text = `${titleNorm} ${descriptionNorm}`;
  return {
    aiAny: matchesAny(taxonomy.signals.ai_any, text),
    genai: matchesAny(taxonomy.signals.genai, text),
    tjm: matchesAny(taxonomy.signals.tjm, text),
    travel: matchesAny(taxonomy.signals.travel, descriptionNorm),
    remote: detectRemote(descriptionNorm, taxonomy),
  };
}

/** Technologies citées (SPEC.md §6.6) : ids sans doublon, dans l'ordre de taxonomy.yaml. */
export function detectTechs(
  titleNorm: string,
  descriptionNorm: string,
  taxonomy: CompiledTaxonomy,
): string[] {
  const text = `${titleNorm} ${descriptionNorm}`;
  return taxonomy.technologies.filter((tech) => matchesAny(tech.patterns, text)).map((tech) => tech.id);
}
