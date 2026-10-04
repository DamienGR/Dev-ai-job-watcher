import type { Meta } from '../../web/src/lib/types';

/** `meta.json` minimal : trois groupes du périmètre, un groupe élargi, quelques rôles. */
export function makeMeta(overrides: Partial<Meta> = {}): Meta {
  return {
    generatedAt: '2026-10-05T07:01:00.000Z',
    lastRun: { runId: '2026-W41', status: 'complete', collectStatus: 'complete', coverageComplete: true },
    runs: ['2026-W40', '2026-W41'],
    firstRun: '2026-W40',
    backfillBefore: '2026-W40',
    partialWeeks: ['2026-W41'],
    partialMonths: ['2026-10'],
    rollingMonths: [],
    taxonomy: { version: 3, updated: '2026-10-03' },
    taxonomyHistory: [{ version: 3, date: '2026-10-03' }],
    aiGroups: ['g4_genai_agentique'],
    devGroup: 'g1_dev',
    sources: [{ id: 'francetravail', label: 'France Travail' }],
    population: { source: 'INSEE', millesime: 'RP2023', description: 'Population active' },
    labels: {
      groups: [
        { id: 'g1_dev', label: 'Dev', status: 'socle', dashboard: true },
        { id: 'g2_data', label: 'Data', status: 'socle', dashboard: true },
        { id: 'g4_genai_agentique', label: 'GenAI', status: 'emergent', dashboard: true },
        { id: 'g9_elargi', label: 'Élargi', status: 'hors_perimetre', dashboard: false },
      ],
      roles: [
        { id: 'dev_backend', label: 'Back-end', group: 'g1_dev', status: 'active' },
        { id: 'dev_frontend', label: 'Front-end', group: 'g1_dev', status: 'active' },
        { id: 'data_engineer', label: 'Data Engineer', group: 'g2_data', status: 'active' },
        { id: 'ai_engineer', label: 'AI Engineer', group: 'g4_genai_agentique', status: 'active' },
        { id: 'agentic_engineer', label: 'Agentic', group: 'g4_genai_agentique', status: 'active' },
        { id: 'support_it', label: 'Support', group: 'g9_elargi', status: 'active' },
        { id: 'non_classe', label: 'Non classé', group: 'non_classe', status: 'active' },
      ],
      technologyFamilies: [],
      technologies: [],
      regions: [
        { code: '11', label: 'Île-de-France', drom: false, population: 6_000_000 },
        { code: '53', label: 'Bretagne', drom: false, population: 1_500_000 },
        { code: '06', label: 'Mayotte', drom: true, population: null },
      ],
      employerTypes: [],
      contracts: { cdi: 'CDI', cdd: 'CDD', unknown: 'Non précisé' },
      experience: { debutant: 'Débutant', unknown: 'Non précisée' },
      remote: { full_remote: 'Télétravail complet', hybrid: 'Hybride', on_site: 'Sur site', unknown: 'Non précisé' },
    },
    ...overrides,
  };
}
