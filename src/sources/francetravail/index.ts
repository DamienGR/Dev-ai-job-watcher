import { resolve } from 'node:path';
import type { Offer } from '../../core/offer';
import type { Taxonomy } from '../../core/taxonomy';
import { requireEnv } from '../../pipeline/env';
import type { Clock } from '../http';
import type { SourceMode } from '../mode';
import type { CollectContext, CollectReport, Source } from '../source';
import { LiveFtApi, type FtApi } from './api';
import { collectFranceTravail } from './collect';
import { FixtureFtApi } from './fixtures';

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

  constructor(private readonly deps: { api: FtApi; taxonomy: Taxonomy; concurrency?: number }) {}

  collect(runId: string, ctx: CollectContext): Promise<CollectReport> {
    return collectFranceTravail(runId, { ...ctx, ...this.deps });
  }

  normalize(): Offer[] {
    throw new Error('France Travail : la normalisation des offres arrive au lot 2 (SPEC.md §14)');
  }
}
