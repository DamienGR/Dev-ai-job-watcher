import { describe, expect, it } from 'vitest';
import { normalize } from '../src/core/normalize';
import { parseTjm } from '../src/core/salary';
import { detectSignals, detectTechs } from '../src/core/signals';
import { compileTaxonomy, loadTaxonomy } from '../src/core/taxonomy';

const taxonomy = compileTaxonomy(await loadTaxonomy());

function analyse(title: string, description: string) {
  const titleNorm = normalize(title);
  const descriptionNorm = normalize(description);
  const signals = detectSignals(titleNorm, descriptionNorm, taxonomy);
  return {
    signals,
    techs: detectTechs(titleNorm, descriptionNorm, taxonomy),
    tjm: signals.tjm ? parseTjm(`${titleNorm} ${descriptionNorm}`) : null,
  };
}

describe('annexe B — signaux et technologies', () => {
  it('cas de signaux', () => {
    const result = analyse(
      '',
      "J'ai le plaisir… Télétravail 2 jours par semaine. TJM : 550 €/jour. Déplacements fréquents chez nos clients. Stack : Python, FastAPI, LangChain, Qdrant, Azure OpenAI, vue d'ensemble, tableau de bord, Spring France recrute.",
    );
    expect(result.signals).toEqual({ aiAny: true, genai: true, tjm: true, travel: true, remote: 'hybrid' });
    expect(result.tjm).toEqual({ min: 550, max: 550 });
    expect([...result.techs].sort()).toEqual(
      ['python', 'fastapi_flask', 'langchain', 'openai', 'qdrant', 'azure', 'azure_ai'].sort(),
    );
    expect(result.techs).not.toContain('vue');
    expect(result.techs).not.toContain('tableau');
    expect(result.techs).not.toContain('spring');
  });

  it('faux positifs à éviter', () => {
    const result = analyse('', "J'ai 10 ans d'expérience, vue globale du SI, mise à jour du tableau.");
    expect(result.signals.aiAny).toBe(false);
    expect(result.signals.genai).toBe(false);
    expect(result.techs).toEqual([]);
  });
});

describe('signaux (SPEC.md §6.6)', () => {
  it.each([
    ['100 % télétravail, équipe distribuée', 'full_remote'],
    ['Full remote possible, sinon 2 jours de télétravail par semaine', 'full_remote'],
    ['Télétravail partiel possible', 'hybrid'],
    ['2 jours sur site par semaine', 'hybrid'],
    ['Pas de télétravail, poste en atelier', 'on_site'],
    ['Poste basé à Lyon', 'unknown'],
  ])('télétravail : « %s » → %s', (description, expected) => {
    expect(analyse('Développeur', description).signals.remote).toBe(expected);
  });

  it("lit le télétravail et les déplacements dans la description seule", () => {
    const result = analyse('Développeur full remote, déplacements fréquents', 'Poste basé à Nantes.');
    expect(result.signals.remote).toBe('unknown');
    expect(result.signals.travel).toBe(false);
  });

  it.each([
    ['Déplacements fréquents chez nos clients', true],
    ['Travel up to 30% across EMEA', true],
    ['20 % de déplacements en France', true],
    ['Remboursement des frais de transport', false],
  ])('déplacements : « %s » → %s', (description, expected) => {
    expect(analyse('Développeur', description).signals.travel).toBe(expected);
  });

  it("détecte l'IA dans l'intitulé comme dans la description", () => {
    expect(analyse('Ingénieur LLM', '').signals).toMatchObject({ genai: true, aiAny: true });
    expect(analyse('Développeur', 'Projets en intelligence artificielle.').signals).toMatchObject({
      genai: false,
      aiAny: true,
    });
    expect(analyse('Développeur Java', 'Application de gestion.').signals).toMatchObject({
      genai: false,
      aiAny: false,
    });
  });

  it("détecte le TJM dans l'intitulé", () => {
    const result = analyse('Développeur Java - TJM 500 €', 'Mission longue.');
    expect(result.signals.tjm).toBe(true);
    expect(result.tjm).toEqual({ min: 500, max: 500 });
  });
});

describe('technologies ambiguës (motifs stricts de taxonomy.yaml)', () => {
  it.each<[string, string[], string[]]>([
    ['Golang, microservices', ['go'], []],
    ['Développeur Go confirmé', ['go'], []],
    ['Stratégie go-to-market', [], ['go']],
    ['Langage C embarqué, C/C++', ['c', 'cpp'], []],
    ['Python et R, RStudio', ['python', 'r'], []],
    ['Pôle R&D', [], ['r']],
    ['Vue.js 3, Nuxt', ['vue'], []],
    ["Une vue d'ensemble du projet", [], ['vue']],
    ['Tableau Desktop et Power BI', ['tableau', 'power_bi'], []],
    ['Suivi via un tableau de bord', [], ['tableau']],
    ['Java 21, Spring Boot', ['java', 'spring'], ['javascript']],
    ['JavaScript et TypeScript', ['javascript', 'typescript'], ['java']],
    ['Spring France recrute pour son client', [], ['spring']],
    ['Claude Code et Cursor AI au quotidien', ['claude_code', 'anthropic', 'cursor'], []],
    ['Contact : Claude Martin, DRH', [], ['anthropic', 'claude_code']],
    ['Optimisation des curseurs SQL', ['sql'], ['cursor']],
    ['Développement de serveurs MCP', ['mcp'], []],
    ['Certification MCP Microsoft', [], ['mcp']],
    ['C#, .NET 8', ['csharp_dotnet'], []],
    ['React Native et React', ['react_native', 'react'], []],
    ['Application React Native', ['react_native'], ['react']],
    ['Site sous django CMS', ['django_cms'], ['django']],
    ['LlamaIndex et Llama 3', ['llamaindex', 'llama'], []],
    ['RAG avec LlamaIndex', ['rag', 'llamaindex'], ['llama']],
    ['GitHub Copilot', ['github_copilot'], ['copilot_studio']],
    ['Agents Copilot Studio', ['copilot_studio'], ['github_copilot']],
  ])('« %s »', (description, present, absent) => {
    const techs = analyse('', description).techs;
    for (const id of present) expect(techs, `${id} attendu`).toContain(id);
    for (const id of absent) expect(techs, `${id} inattendu`).not.toContain(id);
  });

  it('renvoie des ids sans doublon, dans l’ordre de taxonomy.yaml', () => {
    const techs = analyse('Développeur Python', 'Python, Docker, Python, AWS, Docker');
    expect(techs.techs).toEqual(['python', 'aws', 'docker']);
  });
});
