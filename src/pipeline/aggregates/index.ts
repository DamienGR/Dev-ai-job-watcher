import type { CompiledTaxonomy } from '../../core/taxonomy';
import type { BlobStore } from '../../storage/store';
import type { ProcessRecord } from '../processRecord';
import { aggregateBase, type AggregateOffer } from './context';
import { conditions, emerging, employers, geoPoints, geoRegions, salaries, techs, timeseries, titles } from './indicators';
import { meta, quality, type TaxonomyHistoryEntry } from './meta';
import type { Table } from './table';

export { StockCounter, toAggregateOffer, type AggregateOffer } from './context';
export { quality, type TaxonomyHistoryEntry } from './meta';

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
}

/** Contenu des fichiers du store `aggregates` (SPEC.md §3.4, §7.2), par nom de fichier. */
export function computeAggregates(input: AggregateInput): Record<string, unknown> {
  const base = aggregateBase(input.offers, input.taxonomy, input.lastRun);
  return {
    'meta.json': meta({
      base,
      records: input.records,
      firstRun: input.firstRun,
      taxonomyHistory: input.taxonomyHistory,
      generatedAt: input.generatedAt,
    }),
    'timeseries.json': timeseries(base, input.stock),
    'titles.json': titles(base),
    'techs.json': techs(base),
    'salaries.json': salaries(base),
    'conditions.json': conditions(base),
    'employers.json': employers(base),
    'geo-regions.json': geoRegions(base),
    'geo-points.json': geoPoints(base),
    'emerging.json': emerging(base),
    'quality.json': quality(input.records),
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
