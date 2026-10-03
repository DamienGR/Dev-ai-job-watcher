import { resolve } from 'node:path';
import type { Offer } from '../../core/offer';
import { compileTaxonomy, type CompiledTaxonomy, type Taxonomy } from '../../core/taxonomy';
import { requireEnv } from '../../pipeline/env';
import type { Clock } from '../http';
import type { SourceMode } from '../mode';
import type { CollectContext, CollectReport, Source } from '../source';
import { LiveFtApi, type FtApi } from './api';
import { collectFranceTravail, type FtRawPartition } from './collect';
import { FixtureFtApi } from './fixtures';
import { normalizeFtPartition } from './normalize';

export const FT_FIXTURES_DIR = 'fixtures/francetravail';

/** API réelle (identifiants `FT_CLIENT_ID` / `FT_CLIENT_SECRET`) ou fixtures selon le mode. */
export async function createFtApi(
  mode: SourceMode,
  options: { fetch?: typeof fetch; clock?: Clock; fixturesDir?: string } = {},
): Promise<FtApi> {
  if (mode === 'fixtures') {
    return FixtureFtApi.fromDirectory(resolve(process.cwd(), options.fixturesDir ?? FT_FIXTURES_DIR));
  }
  return new LiveFtApi({
    clientId: requireEnv('FT_CLIENT_ID'),
    clientSecret: requireEnv('FT_CLIENT_SECRET'),
    fetch: options.fetch,
    clock: options.clock,
  });
}

export class FranceTravailSource implements Source {
  readonly id = 'francetravail' as const;

  private compiled: CompiledTaxonomy | null = null;

  constructor(private readonly deps: { api: FtApi; taxonomy: Taxonomy; concurrency?: number }) {}

  collect(runId: string, ctx: CollectContext): Promise<CollectReport> {
    return collectFranceTravail(runId, { ...ctx, ...this.deps });
  }

  /** Offres normalisées d'une partition de `raw` (offres étrangères ou invalides écartées). */
  normalize(raw: unknown, runId: string): Offer[] {
    this.compiled ??= compileTaxonomy(this.deps.taxonomy);
    const partition = raw as FtRawPartition;
    return normalizeFtPartition({ ...partition, runId }, this.compiled);
  }
}
