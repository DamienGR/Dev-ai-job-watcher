import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { classify } from '../src/core/classify';
import { normalize } from '../src/core/normalize';
import { compileTaxonomy, loadTaxonomy, NON_CLASSE, type Taxonomy } from '../src/core/taxonomy';

const taxonomy = await loadTaxonomy();
const compiled = compileTaxonomy(taxonomy);

// Cas de l'annexe B, complétés par les revues mensuelles (SPEC.md §9.2).
const fixtureSchema = z.array(
  z.strictObject({
    source: z.string().min(1),
    title: z.string().min(1),
    description: z.string().optional(),
    role: z.string().min(1),
    group: z.string().min(1),
    requalified: z.boolean().optional(),
  }),
);
const cases = fixtureSchema.parse(
  JSON.parse(readFileSync(new URL('./fixtures/titles.json', import.meta.url), 'utf8')),
);

function classifyRaw(title: string, description = '', tax = compiled) {
  return classify(normalize(title), normalize(description), tax);
}

/** Copie modifiable de la taxonomie réelle, pour tester des variantes. */
function variant(mutate: (t: Taxonomy) => void) {
  const copy = structuredClone(taxonomy);
  mutate(copy);
  return compileTaxonomy(copy);
}

describe('tests/fixtures/titles.json', () => {
  it("reprend les 64 cas de l'annexe B et le cas de requalification", () => {
    const annexB = cases.filter((c) => c.source.startsWith('annexe B'));
    expect(annexB).toHaveLength(65);
  });

  it('ne référence que des rôles et groupes existants', () => {
    const roleGroup = new Map(taxonomy.roles.map((r) => [r.id, r.group]));
    for (const c of cases) {
      const expectedGroup = c.role === NON_CLASSE ? NON_CLASSE : roleGroup.get(c.role);
      expect(expectedGroup, `${c.source} : rôle « ${c.role} » inconnu`).toBeDefined();
      expect(c.group, `${c.source} : groupe incohérent avec le rôle`).toBe(expectedGroup);
    }
  });
});

describe('classification (SPEC.md §6.5)', () => {
  it.each(cases.map((c) => [`${c.source} — ${c.title}`, c] as const))('%s', (_, c) => {
    const result = classifyRaw(c.title, c.description);
    expect({ role: result.role, group: result.group, requalified: result.requalified }).toEqual({
      role: c.role,
      group: c.group,
      requalified: c.requalified ?? false,
    });
  });

  it('range les autres rôles reconnus en rôles secondaires, par priorité décroissante', () => {
    const result = classifyRaw('Applied AI, Forward Deployed Machine Learning Engineer - EMEA');
    expect(result.role).toBe('forward_deployed_engineer');
    expect(result.secondaryRoles).toEqual(['ai_engineer', 'ml_engineer']);
  });

  it('ne requalifie pas sans le signal dans la description', () => {
    const result = classifyRaw('Ingénieur IA (H/F)', 'Vous concevrez des modèles de prévision de la demande.');
    expect(result).toMatchObject({ role: 'ingenieur_ia', group: 'g3_ia_ml', requalified: false });
  });

  it("ne cherche pas le signal de requalification dans l'intitulé", () => {
    const result = classifyRaw('Développeur IA OpenAI', 'Intégration de modèles prédictifs.');
    expect(result).toMatchObject({ role: 'ingenieur_ia', requalified: false });
  });

  it('retire la cible de la requalification des rôles secondaires', () => {
    const result = classifyRaw('Ingénieur IA (H/F)', 'Agents IA et RAG.');
    expect(result.role).toBe('ai_engineer');
    expect(result.secondaryRoles).not.toContain('ai_engineer');
  });

  it("départage deux priorités égales par l'ordre de taxonomy.yaml", () => {
    // rag_engineer et llmops_platform ont la priorité 74 ; rag_engineer est défini avant.
    expect(classifyRaw('Ingénieur RAG LLMOps')).toMatchObject({
      role: 'rag_engineer',
      secondaryRoles: ['llmops_platform'],
    });

    const swapped = variant((t) => {
      const rag = t.roles.findIndex((r) => r.id === 'rag_engineer');
      const llmops = t.roles.findIndex((r) => r.id === 'llmops_platform');
      [t.roles[rag], t.roles[llmops]] = [t.roles[llmops]!, t.roles[rag]!];
    });
    expect(classifyRaw('Ingénieur RAG LLMOps', '', swapped).role).toBe('llmops_platform');
  });

  it('écarte un rôle dont un motif `exclude` matche', () => {
    const tax = variant((t) => {
      const role = t.roles.find((r) => r.id === 'prompt_engineer');
      if (role) role.title.exclude = ['\\bsenior\\b'];
    });
    expect(classifyRaw('Prompt Engineer', '', tax).role).toBe('prompt_engineer');
    expect(classifyRaw('Senior Prompt Engineer', '', tax).role).toBe(NON_CLASSE);
  });

  it('ignore les rôles dépréciés', () => {
    const tax = variant((t) => {
      const role = t.roles.find((r) => r.id === 'dev_cms');
      if (role) role.status = 'deprecated';
    });
    expect(classifyRaw('Développeur Full Stack Drupal', '', tax).role).toBe('dev_fullstack');
  });

  it('classe en non_classe sans rôle reconnu', () => {
    expect(classifyRaw('Boulanger pâtissier (H/F)')).toEqual({
      role: NON_CLASSE,
      group: NON_CLASSE,
      secondaryRoles: [],
      requalified: false,
    });
  });
});
