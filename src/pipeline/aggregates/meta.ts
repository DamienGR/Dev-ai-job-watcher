import { REGIONS } from '../../refs';
import { addWeeks, monthOf, weekStart } from '../runId';
import type { ProcessRecord } from '../processRecord';
import type { AggregateBase } from './context';
import { POPULATION } from './indicators';
import { sortRows, type Table } from './table';

// `quality.json` (indicateur 13) et `meta.json` (SPEC.md §7.2).

/** Indicateur 13 : une ligne par run et par source. */
export function quality(records: readonly ProcessRecord[]): Table {
  const counters = [
    'read', 'collectedA', 'collectedB', 'distinct', 'invalid', 'abroad', 'droppedRetention', 'retained', 'newOffers',
    'closed', 'reopened', 'classified', 'salaryDeclared', 'salaryOutOfBounds', 'salaryPredicted', 'tjm',
    'noCoordinates', 'noRegion', 'duplicates',
  ] as const;
  return {
    columns: [
      'run', 'source', 'status', 'collectStatus', 'coverageComplete', 'apiCalls', 'retries', 'errors',
      'truncatedPartitions', 'failedPartitions', ...counters, 'durationMs',
    ],
    rows: sortRows(
      records.map((r) => [
        r.runId, 'francetravail', r.status, r.collect.status, r.coverageComplete, r.collect.apiCalls, r.collect.retries,
        r.collect.errors, r.collect.truncatedPartitions, r.collect.failedPartitions,
        ...counters.map((c) => r.counters[c]), r.durationMs,
      ]),
    ),
  };
}

/** Classement d'un run : offres classées et offres retenues. */
export interface ClassifiedShare {
  classified: number;
  retained: number;
}

/** Version de la taxonomie appliquée aux données (`state/taxonomy-version`, SPEC.md §9.3). */
export interface TaxonomyHistoryEntry {
  version: number;
  /** Date de la version (`updated` de taxonomy.yaml) : place du marqueur sur les courbes. */
  date: string;
  /** Jour (Europe/Paris) du reclassement de tout l'historique ; absent pour la première version. */
  appliedAt?: string;
  /** Effet du reclassement sur le dernier run traité : classement avant et après (D66). */
  effect?: { run: string; before: ClassifiedShare; after: ClassifiedShare };
}

/**
 * Semaines de création partielles (SPEC.md §6.9) :
 * - avant le premier run (rattrapage : les offres déjà fermées n'ont pas été vues) ;
 * - la semaine du dernier run, pas encore terminée ;
 * - toute semaine que le run de la semaine suivante n'a pas couverte entièrement (run
 *   manquant, en échec ou à collecte incomplète).
 */
export function partialWeeks(dataWeeks: Iterable<string>, records: readonly ProcessRecord[], firstRun: string, lastRun: string): string[] {
  const covered = new Set(records.filter((r) => r.status !== 'failed' && r.coverageComplete).map((r) => r.runId));
  const partial = new Set<string>();
  for (const week of dataWeeks) if (week < firstRun) partial.add(week);
  for (let week = firstRun; week <= lastRun; week = addWeeks(week, 1)) {
    if (week === lastRun || !covered.has(addWeeks(week, 1))) partial.add(week);
  }
  return [...partial].sort();
}

/** Mois touchés par au moins une semaine partielle. */
export function partialMonths(weeks: readonly string[]): string[] {
  const months = new Set<string>();
  for (const week of weeks) {
    const monday = weekStart(week).getTime() + 12 * 3_600_000;
    months.add(monthOf(new Date(monday).toISOString()));
    months.add(monthOf(new Date(monday + 6 * 86_400_000).toISOString()));
  }
  return [...months].sort();
}

const CONTRACT_LABELS = {
  cdi: 'CDI', cdd: 'CDD', interim: 'Intérim', freelance: 'Freelance / indépendant', alternance: 'Alternance',
  stage: 'Stage', autre: 'Autre', unknown: 'Non précisé',
};
const EXPERIENCE_LABELS = {
  debutant: 'Débutant (moins d’un an)', '1_3': '1 à 3 ans', '3_5': '3 à 5 ans', '5_plus': '5 ans et plus',
  unknown: 'Non précisée',
};
const REMOTE_LABELS = { full_remote: 'Télétravail complet', hybrid: 'Hybride', on_site: 'Sur site', unknown: 'Non précisé' };

export interface MetaInput {
  base: AggregateBase;
  records: readonly ProcessRecord[];
  firstRun: string;
  taxonomyHistory: readonly TaxonomyHistoryEntry[];
  generatedAt: string;
}

/** `meta.json` : dernier run, semaines partielles, taxonomie, libellés (SPEC.md §7.2). */
export function meta({ base, records, firstRun, taxonomyHistory, generatedAt }: MetaInput) {
  const t = base.taxonomy.source;
  const last = records.find((r) => r.runId === base.lastRun) ?? null;
  const weeks = partialWeeks(new Set(base.dated.map((d) => d.week)), records, firstRun, base.lastRun);
  return {
    generatedAt,
    lastRun: last && {
      runId: last.runId,
      status: last.status,
      collectStatus: last.collect.status,
      coverageComplete: last.coverageComplete,
    },
    runs: records.map((r) => r.runId),
    firstRun,
    /** Semaines de création antérieures au premier run : partielles (rattrapage). */
    backfillBefore: firstRun,
    partialWeeks: weeks,
    partialMonths: partialMonths(weeks),
    /** Mois couverts par les lignes `month = '*'` des agrégats. */
    rollingMonths: [...base.rollingMonths].sort(),
    taxonomy: { version: t.version, updated: t.updated },
    taxonomyHistory,
    aiGroups: [...base.aiGroups],
    devGroup: 'g1_dev',
    sources: [{ id: 'francetravail', label: 'France Travail' }],
    population: {
      source: POPULATION.source,
      millesime: POPULATION.millesime,
      description: 'Population active de 15 à 64 ans (actifs occupés et chômeurs), recensement INSEE',
    },
    labels: {
      groups: t.groups.map((g) => ({ id: g.id, label: g.label, status: g.status, dashboard: g.dashboard })),
      roles: [
        ...t.roles.map((r) => ({ id: r.id, label: r.label, group: r.group, status: r.status ?? 'active' })),
        { id: 'non_classe', label: 'Non classé', group: 'non_classe', status: 'active' },
      ],
      technologyFamilies: t.technology_families.map((f) => ({ id: f.id, label: f.label })),
      technologies: t.technologies.map((x) => ({ id: x.id, label: x.label, family: x.family, status: x.status ?? 'active' })),
      regions: REGIONS.map((r) => ({ code: r.code, label: r.nom, drom: r.drom, population: POPULATION.values[r.code] ?? null })),
      employerTypes: [...t.employer_types.map((e) => ({ id: e.id, label: e.label })), { id: 'inconnu', label: 'Inconnu' }],
      contracts: CONTRACT_LABELS,
      experience: EXPERIENCE_LABELS,
      remote: REMOTE_LABELS,
    },
  };
}
