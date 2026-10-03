import type { Offer } from '../../core/offer';
import type { CompiledTaxonomy } from '../../core/taxonomy';
import { addWeeks, monthOf, runIdFor, weekStart } from '../runId';
import { Counter, type Table } from './table';

/** Offre telle que lue pour les agrégats : sans le texte, inutile aux comptages. */
export type AggregateOffer = Omit<Offer, 'description' | 'title'>;

export function toAggregateOffer(offer: Offer): AggregateOffer {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { description, title, ...rest } = offer;
  return rest;
}

/** Groupe de référence de la prime IA (SPEC.md §7.1, indicateur 7). */
export const DEV_GROUP = 'g1_dev';
/** Fenêtre glissante des lignes « toutes périodes » (`month = '*'`). */
export const ROLLING_MONTHS = 12;

/** Offre et ses périodes de création (Europe/Paris). */
export interface Dated {
  offer: AggregateOffer;
  week: string;
  month: string;
}

export interface AggregateBase {
  taxonomy: CompiledTaxonomy;
  /** Groupes IA : collectés par mots-clés (g3 à g8). */
  aiGroups: ReadonlySet<string>;
  /** Groupes du périmètre (hors `hors_perimetre`), sans `non_classe`. */
  coreGroups: ReadonlySet<string>;
  /** Offres comptées : dernière version de chaque `uid`, doublons inter-sources exclus. */
  dated: Dated[];
  /** Dernier run traité, et son mois. */
  lastRun: string;
  lastMonth: string;
  /** Mois de la fenêtre glissante (les `ROLLING_MONTHS` derniers, jusqu'à `lastMonth`). */
  rollingMonths: ReadonlySet<string>;
}

/** `2026-10` décalé de `months` mois. */
export function addMonths(month: string, months: number): string {
  const [year, m] = month.split('-').map(Number) as [number, number];
  const index = year * 12 + (m - 1) + months;
  return `${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, '0')}`;
}

/** Mois d'une semaine ISO : celui de son jeudi. */
export function monthOfWeek(runId: string): string {
  return monthOf(new Date(weekStart(runId).getTime() + 3 * 86_400_000 + 12 * 3_600_000).toISOString());
}

/** Semaine et mois de création, mis en cache à l'heure près (décalage de Paris en heures pleines). */
export function datePeriods(): (createdAt: string) => { week: string; month: string } {
  const cache = new Map<string, { week: string; month: string }>();
  return (createdAt) => {
    const hour = createdAt.slice(0, 13);
    let periods = cache.get(hour);
    if (!periods) {
      periods = { week: runIdFor(new Date(createdAt)), month: monthOf(createdAt) };
      cache.set(hour, periods);
    }
    return periods;
  };
}

export function aggregateBase(offers: Iterable<AggregateOffer>, taxonomy: CompiledTaxonomy, lastRun: string): AggregateBase {
  const groups = taxonomy.source.groups;
  const periods = datePeriods();
  const dated: Dated[] = [];
  for (const offer of offers) {
    if (offer.dedup.duplicateOf !== null) continue;
    dated.push({ offer, ...periods(offer.createdAt) });
  }
  const lastMonth = monthOfWeek(lastRun);
  return {
    taxonomy,
    aiGroups: new Set(groups.filter((g) => g.keyword_pass).map((g) => g.id)),
    coreGroups: new Set(groups.filter((g) => g.status !== 'hors_perimetre').map((g) => g.id)),
    dated,
    lastRun,
    lastMonth,
    rollingMonths: new Set(Array.from({ length: ROLLING_MONTHS }, (_, i) => addMonths(lastMonth, -i))),
  };
}

/** Semaines de la carte : les 12 dernières jusqu'au dernier run inclus. */
export function recentWeeks(lastRun: string, count = 12): Set<string> {
  return new Set(Array.from({ length: count }, (_, i) => addWeeks(lastRun, -i)));
}

/**
 * Stock actif (SPEC.md §7.1, indicateur 2) : offres France Travail présentes à chaque run,
 * compté fichier par fichier pendant la lecture de `offers/*`.
 */
export class StockCounter {
  private readonly counter = new Counter();

  add(runId: string, offer: AggregateOffer): void {
    if (offer.source !== 'francetravail') return;
    this.counter.add([runId, offer.role, offer.location.region, offer.contract, offer.signals.aiAny]);
  }

  toTable(): Table {
    return this.counter.toTable(['run', 'role', 'region', 'contract', 'aiAny']);
  }
}
