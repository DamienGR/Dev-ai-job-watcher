import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { parse } from 'yaml';
import { z } from 'zod';

// -----------------------------------------------------------------------------
// Schéma de taxonomy.yaml (SPEC.md §6.5, §13, annexe A)
// -----------------------------------------------------------------------------

/** Compile un motif de la taxonomie : source de RegExp, seul drapeau `i` (SPEC.md §6.5). */
export function compilePattern(source: string): RegExp {
  return new RegExp(source, 'i');
}

function isValidPattern(source: string): boolean {
  try {
    compilePattern(source);
    return true;
  } catch {
    return false;
  }
}

const id = z.string().regex(/^[a-z0-9_]+$/, 'identifiant attendu en snake_case (a-z, 0-9, _)');
const label = z.string().min(1);
const pattern = z.string().min(1).refine(isValidPattern, { message: 'RegExp invalide' });
const patterns = z.array(pattern).min(1);
const romeCode = z.string().regex(/^[A-N]\d{4}$/, 'code ROME attendu (ex. M1805)');
/** `deprecated` : l'id reste réservé (historique) mais n'est plus utilisé pour classer. */
const lifecycle = z.enum(['active', 'deprecated']).optional();

export const EMPLOYER_TYPE_IDS = [
  'recrutement_interim',
  'esn_conseil',
  'public_recherche',
  'editeur_logiciel',
  'client_final',
] as const;

/** Signaux à liste de motifs, utilisables par `requalify` et `extends`. */
export const PATTERN_SIGNAL_IDS = ['genai', 'ai_any', 'tjm', 'travel'] as const;
export type PatternSignalId = (typeof PATTERN_SIGNAL_IDS)[number];

const patternSignal = z.strictObject({
  description: label,
  extends: z.enum(PATTERN_SIGNAL_IDS).optional(),
  patterns,
});

export const taxonomySchema = z.strictObject({
  version: z.number().int().positive(),
  updated: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'date AAAA-MM-JJ attendue'),
  rome_codes: z.strictObject({
    core: z.array(romeCode).min(1),
    secondary: z.array(romeCode),
    extended: z.array(romeCode),
  }),
  groups: z
    .array(
      z.strictObject({
        id,
        label,
        status: z.enum(['socle', 'etabli', 'emergent', 'declin', 'hors_perimetre']),
        dashboard: z.boolean(),
        keyword_pass: z.boolean(),
      }),
    )
    .min(1),
  roles: z
    .array(
      z.strictObject({
        id,
        group: id,
        label,
        priority: z.number().int().min(0),
        status: lifecycle,
        keywords: z.array(z.string().min(1)).optional(),
        title: z.strictObject({
          include: patterns,
          exclude: z.array(pattern).optional(),
        }),
        requalify: z
          .strictObject({
            to: id,
            if_description_signal: z.enum(PATTERN_SIGNAL_IDS),
          })
          .optional(),
      }),
    )
    .min(1),
  signals: z.strictObject({
    genai: patternSignal,
    ai_any: patternSignal,
    remote: z.strictObject({
      description: label,
      full_remote: patterns,
      hybrid: patterns,
      on_site: patterns,
    }),
    tjm: patternSignal,
    travel: patternSignal,
  }),
  technology_families: z.array(z.strictObject({ id, label })).min(1),
  technologies: z
    .array(z.strictObject({ id, family: id, label, status: lifecycle, patterns }))
    .min(1),
  employer_types: z
    .array(
      z.strictObject({
        id: z.enum(EMPLOYER_TYPE_IDS),
        label,
        naf_prefixes: z.array(
          z.string().regex(/^(\*|\d{2}(\.\d{0,2}[A-Z]?)?)$/, 'préfixe NAF attendu (ex. "62.02") ou "*"'),
        ),
        name_patterns: z.array(pattern),
      }),
    )
    .min(1),
});

export type Taxonomy = z.infer<typeof taxonomySchema>;

/** Rôle et groupe des offres qu'aucun rôle ne reconnaît (SPEC.md §6.5). */
export const NON_CLASSE = 'non_classe';

/** Limite de l'API France Travail pour le paramètre `codeROME` (SPEC.md §4.1). */
const MAX_ROME_CODES = 200;

// -----------------------------------------------------------------------------
// Contrôles de cohérence (au-delà de la structure)
// -----------------------------------------------------------------------------

function duplicates(values: readonly string[]): string[] {
  const seen = new Set<string>();
  const dups = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) dups.add(value);
    seen.add(value);
  }
  return [...dups];
}

/** Liste les incohérences de la taxonomie (tableau vide si tout va bien). */
export function checkTaxonomy(t: Taxonomy): string[] {
  const problems: string[] = [];

  const namespaces: [string, string[]][] = [
    ['groupe', t.groups.map((g) => g.id)],
    ['rôle', t.roles.map((r) => r.id)],
    ['famille de technologies', t.technology_families.map((f) => f.id)],
    ['technologie', t.technologies.map((x) => x.id)],
    ["type d'employeur", t.employer_types.map((e) => e.id)],
  ];
  for (const [kind, ids] of namespaces) {
    for (const dup of duplicates(ids)) problems.push(`${kind} « ${dup} » défini plusieurs fois`);
  }

  for (const reserved of [...t.groups, ...t.roles].filter((x) => x.id === NON_CLASSE)) {
    problems.push(`l'id « ${reserved.id} » est réservé aux offres non classées`);
  }

  const groupIds = new Set(t.groups.map((g) => g.id));
  const roleById = new Map(t.roles.map((r) => [r.id, r]));
  for (const role of t.roles) {
    if (!groupIds.has(role.group)) {
      problems.push(`rôle « ${role.id} » : groupe « ${role.group} » inexistant`);
    }
    if (role.requalify) {
      const target = roleById.get(role.requalify.to);
      if (!target) {
        problems.push(`rôle « ${role.id} » : requalify.to « ${role.requalify.to} » inexistant`);
      } else if (target.id === role.id) {
        problems.push(`rôle « ${role.id} » : requalify.to pointe sur lui-même`);
      } else if (target.status === 'deprecated') {
        problems.push(`rôle « ${role.id} » : requalify.to « ${target.id} » est déprécié`);
      }
    }
  }

  const keywordGroups = new Set(t.groups.filter((g) => g.keyword_pass).map((g) => g.id));
  for (const role of t.roles) {
    if (role.status !== 'deprecated' && keywordGroups.has(role.group) && !role.keywords?.length) {
      problems.push(
        `rôle « ${role.id} » : le groupe « ${role.group} » est collecté par mots-clés (keyword_pass), keywords manquants`,
      );
    }
  }

  const familyIds = new Set(t.technology_families.map((f) => f.id));
  for (const tech of t.technologies) {
    if (!familyIds.has(tech.family)) {
      problems.push(`technologie « ${tech.id} » : famille « ${tech.family} » inexistante`);
    }
  }

  for (const signalId of PATTERN_SIGNAL_IDS) {
    const chain: string[] = [signalId];
    let parent = t.signals[signalId].extends;
    while (parent) {
      if (chain.includes(parent)) {
        problems.push(`signal « ${signalId} » : héritage circulaire (${[...chain, parent].join(' → ')})`);
        break;
      }
      chain.push(parent);
      parent = t.signals[parent].extends;
    }
  }

  const romeCodes = [...t.rome_codes.core, ...t.rome_codes.secondary, ...t.rome_codes.extended];
  for (const dup of duplicates(romeCodes)) problems.push(`code ROME « ${dup} » listé plusieurs fois`);
  if (romeCodes.length > MAX_ROME_CODES) {
    problems.push(`${romeCodes.length} codes ROME : l'API France Travail en accepte ${MAX_ROME_CODES} au plus`);
  }

  // `*` capte tous les codes NAF : placé ailleurs qu'en dernier, il masquerait les types suivants.
  t.employer_types.forEach((type, index) => {
    if (type.naf_prefixes.includes('*') && index !== t.employer_types.length - 1) {
      problems.push(`type d'employeur « ${type.id} » : le préfixe NAF « * » n'est permis que sur le dernier type`);
    }
  });

  return problems;
}

// -----------------------------------------------------------------------------
// Chargement
// -----------------------------------------------------------------------------

export class TaxonomyError extends Error {
  override name = 'TaxonomyError';
}

/** Analyse et valide le contenu YAML ; lève une `TaxonomyError` lisible en cas de problème. */
export function parseTaxonomy(yamlText: string): Taxonomy {
  return validateTaxonomy(parse(yamlText));
}

/** Valide une taxonomie déjà désérialisée : schéma zod puis `checkTaxonomy`. */
export function validateTaxonomy(data: unknown): Taxonomy {
  const result = taxonomySchema.safeParse(data);
  if (!result.success) {
    throw new TaxonomyError(`taxonomy.yaml invalide :\n${z.prettifyError(result.error)}`);
  }
  const problems = checkTaxonomy(result.data);
  if (problems.length > 0) {
    throw new TaxonomyError(`taxonomy.yaml incohérente :\n- ${problems.join('\n- ')}`);
  }
  return result.data;
}

/**
 * Lit taxonomy.yaml, par défaut à la racine du répertoire courant (racine du dépôt en
 * local et en test ; fichier embarqué via `included_files` dans les fonctions Netlify).
 */
export async function loadTaxonomy(path = resolve(process.cwd(), 'taxonomy.yaml')): Promise<Taxonomy> {
  return parseTaxonomy(await readFile(path, 'utf8'));
}

// -----------------------------------------------------------------------------
// Compilation (une fois par exécution, SPEC.md §6.5)
// -----------------------------------------------------------------------------

export interface CompiledRole {
  id: string;
  group: string;
  priority: number;
  /** Rang dans taxonomy.yaml : départage les rôles de même priorité. */
  order: number;
  include: RegExp[];
  exclude: RegExp[];
  requalify: { to: string; signal: PatternSignalId } | null;
}

export interface CompiledTechnology {
  id: string;
  family: string;
  patterns: RegExp[];
}

export interface CompiledEmployerType {
  id: (typeof EMPLOYER_TYPE_IDS)[number];
  nafPrefixes: string[];
  namePatterns: RegExp[];
}

export interface CompiledTaxonomy {
  version: number;
  source: Taxonomy;
  /** Rôles actifs (hors `deprecated`), dans l'ordre du fichier. */
  roles: CompiledRole[];
  roleById: ReadonlyMap<string, CompiledRole>;
  /** Motifs de chaque signal, héritage `extends` résolu. */
  signals: Record<PatternSignalId, RegExp[]>;
  remote: { full_remote: RegExp[]; hybrid: RegExp[]; on_site: RegExp[] };
  /** Technologies actives, dans l'ordre du fichier. */
  technologies: CompiledTechnology[];
  employerTypes: CompiledEmployerType[];
}

function resolveSignalPatterns(t: Taxonomy, signalId: PatternSignalId): string[] {
  const signal = t.signals[signalId];
  const inherited = signal.extends ? resolveSignalPatterns(t, signal.extends) : [];
  return [...signal.patterns, ...inherited];
}

/** Compile une taxonomie validée par `parseTaxonomy`. */
export function compileTaxonomy(t: Taxonomy): CompiledTaxonomy {
  const roles: CompiledRole[] = t.roles
    .map((role, order) => ({ role, order }))
    .filter(({ role }) => role.status !== 'deprecated')
    .map(({ role, order }) => ({
      id: role.id,
      group: role.group,
      priority: role.priority,
      order,
      include: role.title.include.map(compilePattern),
      exclude: (role.title.exclude ?? []).map(compilePattern),
      requalify: role.requalify
        ? { to: role.requalify.to, signal: role.requalify.if_description_signal }
        : null,
    }));

  const signals = Object.fromEntries(
    PATTERN_SIGNAL_IDS.map((signalId) => [signalId, resolveSignalPatterns(t, signalId).map(compilePattern)]),
  ) as Record<PatternSignalId, RegExp[]>;

  return {
    version: t.version,
    source: t,
    roles,
    roleById: new Map(roles.map((role) => [role.id, role])),
    signals,
    remote: {
      full_remote: t.signals.remote.full_remote.map(compilePattern),
      hybrid: t.signals.remote.hybrid.map(compilePattern),
      on_site: t.signals.remote.on_site.map(compilePattern),
    },
    technologies: t.technologies
      .filter((tech) => tech.status !== 'deprecated')
      .map((tech) => ({ id: tech.id, family: tech.family, patterns: tech.patterns.map(compilePattern) })),
    employerTypes: t.employer_types.map((type) => ({
      id: type.id,
      nafPrefixes: type.naf_prefixes,
      namePatterns: type.name_patterns.map(compilePattern),
    })),
  };
}

export async function loadCompiledTaxonomy(path?: string): Promise<CompiledTaxonomy> {
  return compileTaxonomy(await loadTaxonomy(path));
}

/** Vrai si au moins un motif reconnaît le texte. */
export function matchesAny(regexes: readonly RegExp[], text: string): boolean {
  return regexes.some((re) => re.test(text));
}
