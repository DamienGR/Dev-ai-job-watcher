import { normalize } from '../../core/normalize';
import { NON_CLASSE, type CompiledTechnology } from '../../core/taxonomy';
import { addMonths, monthOfWeek, type AggregateBase } from './context';
import type { emerging } from './indicators';
import { Counter, topN } from './table';

// Préparation de la revue mensuelle de la taxonomie (SPEC.md §9.1, lot 6) : un fichier
// `review/AAAA-MM.json` par mois, écrit avec les agrégats et lu par `api-export`, qui le met en
// forme en Markdown pour la tâche planifiée Claude. Il ne contient que des comptages et des
// intitulés : aucune description ni aucun autre texte d'offre (D65).

/** Plafonds des listes de l'export (Markdown < 50 Ko, SPEC.md §9.1). */
export const REVIEW_LIMITS = {
  unclassified: 100,
  examples: 3,
  exampleLength: 90,
  emergingTerms: 80,
  techCandidates: 50,
  techMinOffers: 5,
  confusions: 30,
};

/** Texte de la dernière version d'une offre, gardé pour les seuls mois de revue. */
export interface OfferText {
  title: string;
  description: string;
}

export interface Review {
  month: string;
  generatedAt: string;
  lastRun: string;
  /** Mois incomplet : en cours, ou reconstitué avant le premier run (SPEC.md §6.9). */
  partial: boolean;
  taxonomy: { version: number; updated: string };
  totals: {
    /** Offres créées dans le mois (doublons inter-sources exclus). */
    offers: number;
    classified: number;
    /** Offres du filet ROME (passe A), et parmi elles les non classées. */
    romeNet: number;
    unclassifiedRome: number;
  };
  unclassified: { title: string; n: number; examples: string[]; rome: Record<string, number> }[];
  emergingTerms: { ngram: string; n: number; prevMean: number }[];
  roles: { role: string; group: string; n: number; prevMean: number | null; status: string | null }[];
  techCandidates: { term: string; n: number }[];
  confusions: { role: string; secondary: string; n: number }[];
}

/** Mois préparés à chaque traitement : celui du dernier run et le précédent. */
export function reviewMonths(lastRun: string): string[] {
  const current = monthOfWeek(lastRun);
  return [addMonths(current, -1), current];
}

export function reviewKey(month: string): string {
  return `review/${month}.json`;
}

// Termes candidats (SPEC.md §9.1) : mots du texte brut qui portent un chiffre, un point
// intérieur ou une majuscule après la première lettre (Node.js, GPT-4o, PyTorch, K8s), absents
// des technologies de la taxonomie. Heuristique simple, relue par la revue : les mots en
// capitales de 5 lettres ou plus (titres de rubrique) et quelques sigles du recrutement sont
// écartés, un mot en minuscules (« dbt ») n'est pas vu.
const TOKEN = /(?<![\p{L}\p{N}])[A-Za-z][A-Za-z0-9]*(?:[.+#-][A-Za-z0-9]+)*[+#]*(?![\p{L}\p{N}])/gu;
const STOP_TERMS = new Set([
  'cdi', 'cdd', 'rtt', 'pme', 'eti', 'tpe', 'rh', 'drh', 'it', 'ia', 'ai', 'esn', 'ssii', 'cv', 'tt', 'ue', 'sas',
  'sarl', 'sa', 'se', 'kpi', 'kpis', 'smic', 'cse', 'ce', 'vae', 'cpf', 'btp', 'pdf', 'ok', 'faq', 'qvt', 'rse', 'rgpd',
  'gdpr', 'hf', 'fh', 'nb', 'etc', 'via', 'mr', 'mme', 'msc', 'phd', 'bts', 'dut', 'but', 'iut', 'mba', 'jo', 'ttc', 'ht',
]);

function isCandidate(token: string): boolean {
  if (token.length < 2 || token.length > 30) return false;
  const lower = token.toLowerCase();
  if (STOP_TERMS.has(lower) || /^bac\b|^(www|https?)\b|\.(fr|com|io|org|net|eu|html?)$/.test(lower)) return false;
  const digit = /\d/.test(token);
  if (!digit && /^[A-Z]{5,}$/.test(token)) return false;
  return digit || /[A-Za-z0-9]\.[A-Za-z]/.test(token) || /^.+[A-Z]/.test(token);
}

/** Repère, pour un texte, les termes candidats non couverts par les technologies. */
export function techCandidateFinder(technologies: readonly CompiledTechnology[]): (text: string) => string[] {
  const covered = new Map<string, boolean>();
  const isCovered = (term: string) => {
    const key = normalize(term);
    let value = covered.get(key);
    if (value === undefined) {
      const padded = ` ${key} `;
      value = technologies.some((tech) => tech.patterns.some((re) => re.test(padded)));
      covered.set(key, value);
    }
    return value;
  };
  return (text) => {
    const found = new Set<string>();
    for (const match of text.matchAll(TOKEN)) {
      const token = match[0];
      if (isCandidate(token) && !isCovered(token)) found.add(token);
    }
    return [...found];
  };
}

const clip = (text: string) =>
  text.length <= REVIEW_LIMITS.exampleLength ? text : `${text.slice(0, REVIEW_LIMITS.exampleLength - 1)}…`;

export interface ReviewInput {
  base: AggregateBase;
  /** Résultat de l'indicateur 12, calculé une fois pour tous les mois. */
  emerging: ReturnType<typeof emerging>;
  texts: ReadonlyMap<string, OfferText>;
  month: string;
  partial: boolean;
  generatedAt: string;
}

/** Revue d'un mois (SPEC.md §9.1). */
export function review({ base, emerging: indicator, texts, month, partial, generatedAt }: ReviewInput): Review {
  const t = base.taxonomy;
  const findCandidates = techCandidateFinder(t.technologies);
  const totals = { offers: 0, classified: 0, romeNet: 0, unclassifiedRome: 0 };
  const unclassified = new Counter();
  const examples = new Map<string, Counter>();
  const rome = new Map<string, Counter>();
  const candidates = new Counter();
  const forms = new Map<string, Counter>();
  const confusions = new Counter();

  for (const { offer: o, month: m } of base.dated) {
    if (m !== month) continue;
    totals.offers += 1;
    if (o.role !== NON_CLASSE) totals.classified += 1;
    const romeNet = o.collectedVia.includes('rome');
    if (romeNet) totals.romeNet += 1;
    const text = texts.get(o.uid);

    if (o.role === NON_CLASSE && romeNet) {
      totals.unclassifiedRome += 1;
      unclassified.add([o.titleNorm]);
      if (text) (examples.get(o.titleNorm) ?? examples.set(o.titleNorm, new Counter()).get(o.titleNorm)!).add([text.title.trim()]);
      if (o.romeCode) (rome.get(o.titleNorm) ?? rome.set(o.titleNorm, new Counter()).get(o.titleNorm)!).add([o.romeCode]);
    }
    for (const secondary of o.secondaryRoles) confusions.add([o.role, secondary]);
    if (text && o.descriptionIsFull) {
      for (const term of findCandidates(text.description)) {
        const key = term.toLowerCase();
        candidates.add([key]);
        (forms.get(key) ?? forms.set(key, new Counter()).get(key)!).add([term]);
      }
    }
  }

  const top = (counter: Counter | undefined, limit: number) => (counter ? topN(counter, 0, limit) : []);
  const ofMonth = (rows: (string | number | boolean | null)[][]) => rows.filter((row) => row[0] === month);

  return {
    month,
    generatedAt,
    lastRun: base.lastRun,
    partial,
    taxonomy: { version: t.version, updated: t.source.updated },
    totals,
    unclassified: top(unclassified, REVIEW_LIMITS.unclassified).map(({ key, n }) => {
      const title = key[0] as string;
      return {
        title,
        n,
        examples: top(examples.get(title), REVIEW_LIMITS.examples).map((e) => clip(e.key[0] as string)),
        rome: Object.fromEntries(top(rome.get(title), 10).map((r) => [r.key[0] as string, r.n])),
      };
    }),
    emergingTerms: ofMonth(indicator.ngrams.rows)
      .map(([, ngram, n, prevMean]) => ({ ngram: ngram as string, n: n as number, prevMean: prevMean as number }))
      .sort((a, b) => b.n - a.n || (a.ngram < b.ngram ? -1 : 1))
      .slice(0, REVIEW_LIMITS.emergingTerms),
    roles: ofMonth(indicator.roles.rows).map(([, role, n, prevMean, status]) => ({
      role: role as string,
      group: t.roleById.get(role as string)?.group ?? NON_CLASSE,
      n: n as number,
      prevMean: prevMean as number | null,
      status: status as string | null,
    })),
    techCandidates: top(candidates, REVIEW_LIMITS.techCandidates)
      .filter(({ n }) => n >= REVIEW_LIMITS.techMinOffers)
      .map(({ key, n }) => ({ term: top(forms.get(key[0] as string), 1)[0]?.key[0] as string, n })),
    confusions: top(confusions, REVIEW_LIMITS.confusions).map(({ key, n }) => ({
      role: key[0] as string,
      secondary: key[1] as string,
      n,
    })),
  };
}
