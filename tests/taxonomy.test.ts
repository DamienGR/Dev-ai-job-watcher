import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';
import {
  checkTaxonomy,
  compilePattern,
  compileTaxonomy,
  parseTaxonomy,
  validateTaxonomy,
  type Taxonomy,
} from '../src/core/taxonomy';

const yamlText = readFileSync(new URL('../taxonomy.yaml', import.meta.url), 'utf8');
const taxonomy = parseTaxonomy(yamlText);

/** Tous les motifs du fichier, avec leur emplacement. */
function allPatterns(t: Taxonomy): { where: string; source: string }[] {
  const list = (where: string, sources: readonly string[] = []) =>
    sources.map((source) => ({ where, source }));
  const { remote, ...patternSignals } = t.signals;
  return [
    ...t.roles.flatMap((r) => [
      ...list(`rôle ${r.id} (include)`, r.title.include),
      ...list(`rôle ${r.id} (exclude)`, r.title.exclude),
    ]),
    ...Object.entries(patternSignals).flatMap(([id, s]) => list(`signal ${id}`, s.patterns)),
    ...list('signal remote (full_remote)', remote.full_remote),
    ...list('signal remote (hybrid)', remote.hybrid),
    ...list('signal remote (on_site)', remote.on_site),
    ...t.technologies.flatMap((x) => list(`technologie ${x.id}`, x.patterns)),
    ...t.employer_types.flatMap((e) => list(`employeur ${e.id}`, e.name_patterns)),
  ];
}

describe('taxonomy.yaml — test de cohérence (SPEC.md §13)', () => {
  it('se charge, respecte le schéma et ne présente aucune incohérence', () => {
    expect(checkTaxonomy(taxonomy)).toEqual([]);
  });

  it('compile tous ses motifs avec le seul drapeau i', () => {
    const patterns = allPatterns(taxonomy);
    expect(patterns.length).toBeGreaterThan(0);
    for (const { where, source } of patterns) {
      expect(() => compilePattern(source), `${where} : ${source}`).not.toThrow();
    }
    expect(() => compileTaxonomy(taxonomy)).not.toThrow();
  });

  it('a une entrée datée dans TAXONOMY_CHANGELOG.md pour sa version', () => {
    const changelog = readFileSync(new URL('../TAXONOMY_CHANGELOG.md', import.meta.url), 'utf8');
    expect(changelog).toMatch(new RegExp(`^## v${taxonomy.version} — ${taxonomy.updated}$`, 'm'));
  });

  it("résout l'héritage des signaux (ai_any étend genai)", () => {
    const compiled = compileTaxonomy(taxonomy);
    const { genai, ai_any } = taxonomy.signals;
    expect(compiled.signals.ai_any).toHaveLength(ai_any.patterns.length + genai.patterns.length);
    expect(compiled.signals.genai).toHaveLength(genai.patterns.length);
  });
});

describe('contrôles de la taxonomie', () => {
  /** Erreur levée par la validation d'une variante de la taxonomie réelle. */
  function errorFor(mutate: (t: Taxonomy) => void): string {
    const copy = structuredClone(parse(yamlText) as Taxonomy);
    mutate(copy);
    try {
      validateTaxonomy(copy);
    } catch (error) {
      return (error as Error).message;
    }
    return 'aucune erreur';
  }

  const role = (t: Taxonomy, roleId: string) => {
    const found = t.roles.find((r) => r.id === roleId);
    if (!found) throw new Error(`rôle ${roleId} introuvable`);
    return found;
  };

  it.each<[string, (t: Taxonomy) => void, string]>([
    ['id de rôle en double', (t) => t.roles.push({ ...role(t, 'bi') }), 'rôle « bi » défini plusieurs fois'],
    ['groupe inexistant', (t) => (role(t, 'bi').group = 'g0_inconnu'), 'groupe « g0_inconnu » inexistant'],
    [
      'cible de requalification inexistante',
      (t) => (role(t, 'ingenieur_ia').requalify = { to: 'inconnu', if_description_signal: 'genai' }),
      'requalify.to « inconnu » inexistant',
    ],
    [
      'cible de requalification dépréciée',
      (t) => (role(t, 'ai_engineer').status = 'deprecated'),
      'requalify.to « ai_engineer » est déprécié',
    ],
    ['motif invalide', (t) => role(t, 'bi').title.include.push('(sans fin'), 'RegExp invalide'],
    ['clé inconnue (faute de frappe)', (t) => Object.assign(role(t, 'bi'), { prority: 1 }), 'prority'],
    ['champ obligatoire manquant', (t) => delete (role(t, 'bi') as Partial<Taxonomy['roles'][number]>).priority, 'priority'],
    ['id réservé', (t) => (role(t, 'bi').id = 'non_classe'), 'réservé aux offres non classées'],
    [
      'rôle collecté par mots-clés sans keywords',
      (t) => delete role(t, 'prompt_engineer').keywords,
      'rôle « prompt_engineer » : le groupe « g8_temoins » est collecté par mots-clés',
    ],
    [
      'famille de technologie inexistante',
      (t) => (t.technologies[0]!.family = 'inconnue'),
      'famille « inconnue » inexistante',
    ],
    ['héritage circulaire de signaux', (t) => (t.signals.genai.extends = 'ai_any'), 'héritage circulaire'],
    ['code ROME en double', (t) => t.rome_codes.extended.push('M1805'), 'code ROME « M1805 » listé plusieurs fois'],
    [
      'plus de 200 codes ROME',
      (t) => t.rome_codes.extended.push(...Array.from({ length: 200 }, (_, i) => `A${String(i).padStart(4, '0')}`)),
      "l'API France Travail en accepte 200 au plus",
    ],
    [
      'préfixe NAF « * » avant le dernier type',
      (t) => t.employer_types.reverse(),
      "le préfixe NAF « * » n'est permis que sur le dernier type",
    ],
  ])('détecte : %s', (_, mutate, expected) => {
    expect(errorFor(mutate)).toContain(expected);
  });
});
