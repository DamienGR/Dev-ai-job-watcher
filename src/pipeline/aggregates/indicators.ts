import { NON_CLASSE } from '../../core/taxonomy';
import { MIN_N, quartiles } from '../../core/stats';
import populationData from '../../refs/population-active.json';
import { addMonths, DEV_GROUP, recentWeeks, type AggregateBase, type AggregateOffer } from './context';
import { ALL, Counter, Grouper, sortRows, topN, type Cell, type Table } from './table';

// Indicateurs MVP 1, 4 à 12 (SPEC.md §7.1). Les flux (nouvelles offres, salaires, intitulés…)
// comptent chaque offre une fois, dans sa semaine ou son mois de création (§6.9).

export const POPULATION = populationData as {
  source: string;
  millesime: string;
  values: Record<string, number | null>;
};

/** Indicateurs 1, 2 et 4 : nouvelles offres par semaine de création, stock par run. */
export function timeseries(base: AggregateBase, stock: Table): { newOffers: Table; stock: Table } {
  const counter = new Counter();
  for (const { offer: o, week } of base.dated) {
    counter.add([week, o.role, o.location.region, o.source, o.contract, o.signals.aiAny]);
  }
  return { newOffers: counter.toTable(['week', 'role', 'region', 'source', 'contract', 'aiAny']), stock };
}

/** Indicateur 5 : top 10 des intitulés normalisés et top 5 des rôles secondaires, par mois × rôle. */
export function titles(base: AggregateBase): { titles: Table; secondaryRoles: Table } {
  const byTitle = new Counter();
  const bySecondary = new Counter();
  for (const { offer: o, month } of base.dated) {
    byTitle.add([month, o.role, o.titleNorm]);
    for (const secondary of o.secondaryRoles) bySecondary.add([month, o.role, secondary]);
  }
  const table = (counter: Counter, limit: number, columns: string[]): Table => ({
    columns,
    rows: sortRows(topN(counter, 2, limit).map(({ key, n }) => [...key, n])),
  });
  return {
    titles: table(byTitle, 10, ['month', 'role', 'title', 'n']),
    secondaryRoles: table(bySecondary, 5, ['month', 'role', 'secondaryRole', 'n']),
  };
}

/**
 * Indicateur 6 : offres citant chaque techno et total des offres, par mois × groupe, sur les
 * seules descriptions complètes (SPEC.md §6.6). Les groupes étant disjoints, les totaux tous
 * groupes s'obtiennent par somme.
 */
export function techs(base: AggregateBase): { techs: Table; totals: Table } {
  const byTech = new Counter();
  const totals = new Counter();
  for (const { offer: o, month } of base.dated) {
    if (!o.descriptionIsFull) continue;
    totals.add([month, o.group]);
    for (const tech of o.techs) byTech.add([month, o.group, tech]);
  }
  return { techs: byTech.toTable(['month', 'group', 'tech']), totals: totals.toTable(['month', 'group']) };
}

const flag = (value: boolean | null): string => (value === null ? 'unknown' : String(value));

/**
 * Indicateur 9 : répartitions par mois × groupe × rôle (contrat, télétravail, expérience,
 * cadre…). Le rôle sert la part de télétravail du tableau des rôles (SPEC.md §8.1, D35) ; les
 * comptages étant additifs, le dashboard somme les rôles d'un groupe.
 */
export function conditions(base: AggregateBase): Table {
  const counter = new Counter();
  for (const { offer: o, month } of base.dated) {
    const values: [string, string][] = [
      ['contract', o.contract],
      ['remote', o.remote],
      ['experience', o.experience],
      ['cadre', flag(o.cadre)],
      ['travel', flag(o.signals.travel)],
      ['fullTime', flag(o.fullTime)],
    ];
    for (const [dimension, value] of values) counter.add([month, o.group, o.role, dimension, value]);
  }
  return counter.toTable(['month', 'group', 'role', 'dimension', 'value']);
}

/** Période de l'offre et `*` si elle tombe dans la fenêtre glissante. */
function periodsOf(base: AggregateBase, month: string): string[] {
  return base.rollingMonths.has(month) ? [month, ALL] : [month];
}

/** Nom d'affichage d'un employeur : graphie la plus fréquente de son nom normalisé. */
function displayNames(offers: Iterable<AggregateOffer>): Map<string, string> {
  const spellings = new Counter();
  for (const o of offers) if (o.companyNorm && o.company) spellings.add([o.companyNorm, o.company]);
  const best = topN(spellings, 1, 1);
  return new Map(best.map(({ key }) => [key[0] as string, key[1] as string]));
}

/**
 * Indicateur 10 : top 20 des employeurs par mois × groupe, répartition par type d'employeur,
 * nouveaux recruteurs IA (premier poste d'un groupe IA, par date de création, dans le mois).
 */
export function employers(base: AggregateBase): { top: Table; types: Table; newAiRecruiters: Table } {
  const names = displayNames(base.dated.map((d) => d.offer));
  const byCompany = new Counter();
  const types = new Counter();
  const firstAi = new Map<string, string>();
  const aiByMonth = new Counter();
  const aiGroupByCompany = new Counter();

  for (const { offer: o, month } of base.dated) {
    for (const period of periodsOf(base, month)) {
      types.add([period, o.group, o.employerType]);
      if (o.companyNorm) byCompany.add([period, o.group, o.companyNorm]);
    }
    if (o.companyNorm && base.aiGroups.has(o.group)) {
      const first = firstAi.get(o.companyNorm);
      if (first === undefined || month < first) firstAi.set(o.companyNorm, month);
      aiByMonth.add([o.companyNorm, month]);
      aiGroupByCompany.add([o.companyNorm, o.group]);
    }
  }

  const mainAiGroup = new Map(topN(aiGroupByCompany, 1, 1).map(({ key }) => [key[0] as string, key[1] as string]));
  const recruiters = new Counter();
  for (const [company, month] of firstAi) recruiters.add([month, company], aiByMonth.get([company, month]));

  return {
    top: {
      columns: ['month', 'group', 'company', 'name', 'n'],
      rows: sortRows(topN(byCompany, 2, 20).map(({ key, n }) => [...key, names.get(key[2] as string) ?? null, n])),
    },
    types: types.toTable(['month', 'group', 'employerType']),
    newAiRecruiters: {
      columns: ['month', 'company', 'name', 'group', 'n'],
      rows: sortRows(
        topN(recruiters, 1, 50).map(({ key, n }) => [
          key[0]!,
          key[1]!,
          names.get(key[1] as string) ?? null,
          mainAiGroup.get(key[1] as string) ?? null,
          n,
        ]),
      ),
    },
  };
}

/** Densité pour 100 000 actifs (population active INSEE, `src/refs/population-active.json`). */
export function density(n: number, region: string): number | null {
  const population = POPULATION.values[region];
  return population ? Math.round((n * 100_000 * 100) / population) / 100 : null;
}

/**
 * Indicateur 11a : par mois × région, volume total, volume du périmètre (groupes g1 à g8),
 * volume IA (g3 à g8) et densité du périmètre pour 100 000 actifs.
 */
export function geoRegions(base: AggregateBase): Table {
  const counter = new Counter();
  for (const { offer: o, month } of base.dated) {
    const region = o.location.region;
    if (!region) continue;
    for (const period of periodsOf(base, month)) {
      counter.add([period, region, 'n']);
      if (base.coreGroups.has(o.group)) counter.add([period, region, 'nCore']);
      if (base.aiGroups.has(o.group)) counter.add([period, region, 'nAi']);
    }
  }
  const cells = new Map<string, Cell[]>();
  for (const { key, n } of counter.entries()) {
    const [period, region, measure] = key as [string, string, string];
    const id = `${period}|${region}`;
    const row = cells.get(id) ?? [period, region, 0, 0, 0, null];
    row[measure === 'n' ? 2 : measure === 'nCore' ? 3 : 4] = n;
    cells.set(id, row);
  }
  for (const row of cells.values()) row[5] = density(row[3] as number, row[1] as string);
  return { columns: ['month', 'region', 'n', 'nCore', 'nAi', 'density'], rows: sortRows([...cells.values()]) };
}

/**
 * Indicateur 11b : offres des 12 dernières semaines de création, coordonnées arrondies à
 * 0,01°, regroupées par point × groupe × rôle × semaine. Aucun texte d'offre.
 */
export function geoPoints(base: AggregateBase): Table {
  const weeks = recentWeeks(base.lastRun);
  const counter = new Counter();
  for (const { offer: o, week } of base.dated) {
    const { lat, lng, precision } = o.location;
    if (lat === null || lng === null || precision === 'pays' || precision === 'aucune' || !weeks.has(week)) continue;
    counter.add([Math.round(lat * 100) / 100, Math.round(lng * 100) / 100, o.group, o.role, week]);
  }
  return counter.toTable(['lat', 'lng', 'group', 'role', 'week']);
}

const STOP_WORDS = new Set([
  'a', 'au', 'aux', 'd', 'de', 'des', 'du', 'en', 'et', 'l', 'la', 'le', 'les', 'ou', 'par', 'pour', 'sur', 'un', 'une',
  'avec', 'dans', 'the', 'of', 'and', 'for', 'in', 'to', 'cdi', 'cdd', 'h', 'f', 'x', 'alternance', 'stage',
]);

/** N-grammes (1 à 3 mots) d'un intitulé normalisé, sans mot vide en tête ni en fin. */
export function titleNgrams(titleNorm: string): Set<string> {
  const words = titleNorm.split(/[^a-z0-9+#.]+/).filter((w) => w && !/^\d+$/.test(w));
  const grams = new Set<string>();
  for (let size = 1; size <= 3; size++) {
    for (let i = 0; i + size <= words.length; i++) {
      const gram = words.slice(i, i + size);
      if (STOP_WORDS.has(gram[0]!) || STOP_WORDS.has(gram[gram.length - 1]!)) continue;
      grams.add(gram.join(' '));
    }
  }
  return grams;
}

/** Seuils de l'émergence (SPEC.md §7.1 indicateur 12, §9.1). */
export const EMERGING = { ngramMin: 10, ngramRatio: 2, roleThreshold: 5, previousMonths: 3, topUnclassified: 50 };

/**
 * Indicateur 12 : non classés du filet ROME (top 50 par mois), n-grammes d'intitulés en hausse
 * (n du mois ≥ 10 et ≥ 2 × la moyenne des 3 mois précédents), tendance des rôles (seuil de
 * 5 offres franchi, baisse de moitié). La moyenne porte sur les mois précédents couverts par
 * les données (3 au plus) ; le premier mois n'a pas de tendance.
 */
export function emerging(base: AggregateBase): { unclassified: Table; ngrams: Table; roles: Table } {
  const unclassified = new Counter();
  const ngrams = new Counter();
  const roles = new Counter();
  const months = new Set<string>();
  for (const { offer: o, month } of base.dated) {
    months.add(month);
    if (o.role === NON_CLASSE) {
      if (o.collectedVia.includes('rome')) unclassified.add([month, o.titleNorm]);
    } else {
      roles.add([month, o.role]);
    }
    for (const gram of titleNgrams(o.titleNorm)) ngrams.add([month, gram]);
  }

  const firstMonth = [...months].sort()[0];
  const previous = (counter: Counter, month: string, id: string): number[] | null => {
    const values: number[] = [];
    for (let i = 1; i <= EMERGING.previousMonths; i++) {
      const m = addMonths(month, -i);
      if (firstMonth === undefined || m < firstMonth) break;
      values.push(counter.get([m, id]));
    }
    return values.length > 0 ? values : null;
  };
  const mean = (values: number[]) => Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 100) / 100;

  const ngramRows: Cell[][] = [];
  for (const { key, n } of ngrams.entries()) {
    const [month, gram] = key as [string, string];
    const before = previous(ngrams, month, gram);
    if (!before || n < EMERGING.ngramMin) continue;
    const prevMean = mean(before);
    if (n >= EMERGING.ngramRatio * prevMean) ngramRows.push([month, gram, n, prevMean]);
  }

  const roleIds = [...new Set(roles.entries().map(({ key }) => key[1] as string))];
  const roleRows: Cell[][] = [];
  for (const month of months) {
    for (const role of roleIds) {
      const n = roles.get([month, role]);
      const before = previous(roles, month, role);
      if (!before) {
        if (n > 0) roleRows.push([month, role, n, null, null]);
        continue;
      }
      const prevMean = mean(before);
      if (n === 0 && prevMean === 0) continue;
      const status =
        n >= EMERGING.roleThreshold && before[0]! < EMERGING.roleThreshold
          ? 'seuil'
          : prevMean >= EMERGING.roleThreshold && n <= prevMean / 2
            ? 'baisse'
            : 'stable';
      roleRows.push([month, role, n, prevMean, status]);
    }
  }

  return {
    unclassified: {
      columns: ['month', 'title', 'n'],
      rows: sortRows(topN(unclassified, 1, EMERGING.topUnclassified).map(({ key, n }) => [...key, n])),
    },
    ngrams: { columns: ['month', 'ngram', 'n', 'prevMean'], rows: sortRows(ngramRows) },
    roles: { columns: ['month', 'role', 'n', 'prevMean', 'status'], rows: sortRows(roleRows) },
  };
}

/**
 * Indicateurs 7 et 8 : salaires et TJM. Seuls les salaires déclarés comptent (les salaires
 * prédits d'Adzuna sont exclus, SPEC.md §6.3) ; quantiles masqués si n < 5.
 *
 * - `salaries` : mois (et `*`, 12 derniers mois) × groupe × rôle × expérience × région, avec
 *   `*` pour « tous » à chaque niveau ; `n` = offres de la cellule, `nSalary` = salaires
 *   exploitables (taux de renseignement = nSalary / n). Cellules de moins de 5 offres omises.
 * - `aiPremium` : médiane des groupes IA − médiane du groupe g1, par mois × expérience.
 * - `tjm` : TJM moyen de chaque offre (moyenne des bornes), par mois × groupe.
 */
export function salaries(base: AggregateBase): { salaries: Table; aiPremium: Table; tjm: Table } {
  const offersByCell = new Counter();
  const salaryByCell = new Grouper<number>();
  const premium = new Grouper<number>();
  const tjm = new Grouper<number>();

  for (const { offer: o, month } of base.dated) {
    const mid = o.salary.source === 'declared' ? o.salary.midAnnual : null;
    const roleLevels: [string, string][] = [[o.group, o.role], [o.group, ALL], [ALL, ALL]];
    for (const period of periodsOf(base, month)) {
      for (const [group, role] of roleLevels) {
        for (const experience of [o.experience, ALL]) {
          for (const region of o.location.region ? [o.location.region, ALL] : [ALL]) {
            const key = [period, group, role, experience, region];
            offersByCell.add(key);
            if (mid !== null) salaryByCell.add(key, mid);
          }
        }
      }
      if (mid !== null) {
        const side = base.aiGroups.has(o.group) ? 'ai' : o.group === DEV_GROUP ? 'dev' : null;
        if (side) for (const experience of [o.experience, ALL]) premium.add([period, experience, side], mid);
      }
      if (o.tjm && o.tjm.min !== null && o.tjm.max !== null) {
        const value = (o.tjm.min + o.tjm.max) / 2;
        for (const group of [o.group, ALL]) tjm.add([period, group], value);
      }
    }
  }

  // Une cellule de moins de 5 offres n'affiche que « n < 5 » (SPEC.md §8.3) : elle est omise.
  const salaryRows = offersByCell
    .entries()
    .filter(({ n }) => n >= MIN_N)
    .map(({ key, n }) => {
      const q = quartiles(salaryByCell.get(key));
      return [...key, n, q.n, q.p25, q.p50, q.p75];
    });

  const premiumKeys = new Counter();
  for (const { key } of premium.entries()) premiumKeys.add(key.slice(0, 2));
  const premiumRows = premiumKeys.entries().map(({ key }) => {
    const ai = quartiles(premium.get([...key, 'ai']));
    const dev = quartiles(premium.get([...key, 'dev']));
    const gap = ai.p50 !== null && dev.p50 !== null ? ai.p50 - dev.p50 : null;
    return [...key, ai.n, ai.p50, dev.n, dev.p50, gap];
  });

  const tjmRows = tjm.entries().map(({ key, values }) => {
    const q = quartiles(values);
    return [...key, q.n, q.p25, q.p50, q.p75];
  });

  return {
    salaries: {
      columns: ['month', 'group', 'role', 'experience', 'region', 'n', 'nSalary', 'p25', 'p50', 'p75'],
      rows: sortRows(salaryRows),
    },
    aiPremium: { columns: ['month', 'experience', 'nAi', 'p50Ai', 'nDev', 'p50Dev', 'premium'], rows: sortRows(premiumRows) },
    tjm: { columns: ['month', 'group', 'n', 'p25', 'p50', 'p75'], rows: sortRows(tjmRows) },
  };
}
