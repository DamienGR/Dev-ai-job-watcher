import { z } from 'zod';
import { loadTaxonomy, type Taxonomy } from '../core/taxonomy';
import { env } from '../pipeline/env';
import { INTERNAL_SECRET_HEADER, safeEqual } from '../pipeline/internal';
import { jsonLogger, type Logger } from '../pipeline/log';
import { isRunId } from '../pipeline/runId';
import { createFtApi, FranceTravailSource } from '../sources/francetravail';
import type { FtApi } from '../sources/francetravail/api';
import { sourceMode, type SourceMode } from '../sources/mode';
import type { CollectReport } from '../sources/source';
import type { Stores } from '../storage/store';

/** Une fonction background dispose de 15 min ; on rend la main à 13 (SPEC.md §12). */
export const BACKGROUND_BUDGET_MS = 13 * 60_000;

export const collectRequestSchema = z.strictObject({
  runId: z.string().refine(isRunId, { message: 'runId attendu au format AAAA-Wss' }),
  reset: z.boolean().optional(),
});

export interface CollectHandlerDeps {
  stores: () => Stores;
  loadTaxonomy?: () => Promise<Taxonomy>;
  createApi?: (mode: SourceMode) => Promise<FtApi>;
  log?: Logger;
  now?: () => number;
}

/**
 * Corps de `collect-francetravail-background`, appelée en interne avec le secret partagé
 * (SPEC.md §3.3). Une erreur est relancée pour que Netlify retente l'exécution (1 puis 2 min).
 */
export function createCollectFranceTravailHandler(deps: CollectHandlerDeps) {
  const log = deps.log ?? jsonLogger;
  return async (req: Request): Promise<Response> => {
    if (!safeEqual(req.headers.get(INTERNAL_SECRET_HEADER), env('INTERNAL_SECRET'))) {
      log('internal.unauthorized', { function: 'collect-francetravail-background' });
      return new Response('Unauthorized', { status: 401 });
    }
    const parsed = collectRequestSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      log('internal.bad-request', { function: 'collect-francetravail-background', error: z.prettifyError(parsed.error) });
      return new Response('Bad Request', { status: 400 });
    }

    const { runId, reset } = parsed.data;
    const started = (deps.now ?? Date.now)();
    try {
      const taxonomy = await (deps.loadTaxonomy ?? loadTaxonomy)();
      const api = await (deps.createApi ?? createFtApi)(sourceMode());
      const report: CollectReport = await new FranceTravailSource({ api, taxonomy }).collect(runId, {
        stores: deps.stores(),
        log,
        reset,
        deadline: started + BACKGROUND_BUDGET_MS,
      });
      return Response.json(report);
    } catch (error) {
      log('collect.failed', { source: 'francetravail', runId, message: error instanceof Error ? error.message : String(error) });
      throw error;
    }
  };
}
