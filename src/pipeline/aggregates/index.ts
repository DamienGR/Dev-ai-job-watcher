import type { CompiledTaxonomy } from '../../core/taxonomy';
import type { BlobStore } from '../../storage/store';
import type { ProcessRecord } from '../processRecord';
import { aggregateBase, type AggregateOffer } from './context';
import { conditions, emerging, employers, geoPoints, geoRegions, salaries, techs, timeseries, titles } from './indicators';
import { meta, quality, type TaxonomyHistoryEntry } from './meta';
import { review, reviewKey, reviewMonths, type OfferText } from './review';
import type { Table } from './table';

export { StockCounter, toAggregateOffer, type AggregateOffer } from './context';
export { quality, type TaxonomyHistoryEntry } from './meta';
export { reviewMonths, type OfferText, type Review } from './review';

export interface AggregateInput {
  /** Dernière version de chaque offre, tous runs confondus. */
  offers: Iterable<AggregateOffer>;
  /** Stock actif par run (`StockCounter`). */
  stock: Table;
  records: readonly ProcessRecord[];
  taxonomy: CompiledTaxonomy;
  firstRun: string;
  lastRun: string;
  taxonomyHistory: readonly TaxonomyHistoryEntry[];
  generatedAt: string;
  /** Intitulés et descriptions des offres des mois de revue (`reviewMonths`), par `uid`. */
  texts?: ReadonlyMap<string, OfferText>;
}

/** Contenu des fichiers du store `aggregates` (SPEC.md §3.4, §7.2), par nom de fichier. */
export function computeAggregates(input: AggregateInput): Record<string, unknown> {
  const base = aggregateBase(input.offers, input.taxonomy, input.lastRun);
  const metaFile = meta({
    base,
    records: input.records,
    firstRun: input.firstRun,
    taxonomyHistory: input.taxonomyHistory,
    generatedAt: input.generatedAt,
  });
  const emergingFile = emerging(base);
  // Revue mensuelle (SPEC.md §9.1) : le mois du dernier run et le précédent.
  const reviews = Object.fromEntries(
    reviewMonths(input.lastRun).map((month) => [
      reviewKey(month),
      review({
        base,
        emerging: emergingFile,
        texts: input.texts ?? new Map(),
        month,
        partial: metaFile.partialMonths.includes(month),
        generatedAt: input.generatedAt,
      }),
    ]),
  );
  return {
    'meta.json': metaFile,
    'timeseries.json': timeseries(base, input.stock),
    'titles.json': titles(base),
    'techs.json': techs(base),
    'salaries.json': salaries(base),
    'conditions.json': conditions(base),
    'employers.json': employers(base),
    'geo-regions.json': geoRegions(base),
    'geo-points.json': geoPoints(base),
    'emerging.json': emergingFile,
    'quality.json': quality(input.records),
    ...reviews,
  };
}

/** Écrit les agrégats ; renvoie la taille de chaque fichier en octets. */
export async function writeAggregates(store: BlobStore, files: Record<string, unknown>): Promise<Record<string, number>> {
  const sizes: Record<string, number> = {};
  for (const [name, content] of Object.entries(files)) {
    const data = Buffer.from(JSON.stringify(content), 'utf8');
    await store.set(name, data);
    sizes[name] = data.byteLength;
  }
  return sizes;
}
