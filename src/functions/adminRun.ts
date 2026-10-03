import { z } from 'zod';
import { env } from '../pipeline/env';
import { callBackgroundFunction, safeEqual } from '../pipeline/internal';
import { jsonLogger, type Logger } from '../pipeline/log';
import { isRunId } from '../pipeline/runId';
import { STEPS, type StepId } from '../pipeline/runState';

export const adminRunSchema = z.strictObject({
  step: z.enum(STEPS),
  runId: z.string().refine(isRunId, { message: 'runId attendu au format AAAA-Wss' }),
  /** Repart de zéro pour l'étape (état et données brutes du run effacés). */
  reset: z.boolean().optional(),
});

/** Fonction background de chaque étape ; les autres arrivent avec leur lot (SPEC.md §14). */
const STEP_FUNCTIONS: Record<StepId, { fn: string } | { lot: number }> = {
  'collect-ft': { fn: 'collect-francetravail-background' },
  'collect-adzuna': { lot: 3 },
  process: { lot: 2 },
  reclassify: { lot: 6 },
};

export interface AdminRunDeps {
  callBackground?: typeof callBackgroundFunction;
  log?: Logger;
}

/** URL du site d'après le contexte Netlify, sinon la variable `URL`. */
interface SiteContext {
  site?: { url?: string };
}

/**
 * `POST /api/admin/run` (SPEC.md §3.3) : relance une étape d'un run. Corps
 * `{ "step": "collect-ft", "runId": "2026-W41", "reset"?: true }`, en-tête
 * `Authorization: Bearer <ADMIN_TOKEN>`.
 */
export function createAdminRunHandler(deps: AdminRunDeps = {}) {
  const log = deps.log ?? jsonLogger;
  const callBackground = deps.callBackground ?? callBackgroundFunction;
  return async (req: Request, context?: SiteContext): Promise<Response> => {
    if (req.method !== 'POST') return Response.json({ error: 'méthode non autorisée' }, { status: 405 });

    const authorization = req.headers.get('authorization') ?? '';
    const token = authorization.startsWith('Bearer ') ? authorization.slice('Bearer '.length) : null;
    if (!safeEqual(token, env('ADMIN_TOKEN'))) {
      log('admin.unauthorized', {});
      return Response.json({ error: 'non autorisé' }, { status: 401 });
    }

    const parsed = adminRunSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return Response.json({ error: 'requête invalide', details: z.prettifyError(parsed.error) }, { status: 400 });
    }
    const { step, runId, reset = false } = parsed.data;
    const target = STEP_FUNCTIONS[step];
    if ('lot' in target) {
      return Response.json({ error: `l'étape « ${step} » arrive au lot ${target.lot}` }, { status: 501 });
    }

    const siteUrl = context?.site?.url ?? env('URL');
    const secret = env('INTERNAL_SECRET');
    if (!siteUrl || !secret) {
      return Response.json({ error: 'configuration incomplète : URL du site ou INTERNAL_SECRET' }, { status: 500 });
    }
    try {
      await callBackground(target.fn, { runId, reset }, { siteUrl, secret });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      log('admin.run.failed', { step, runId, function: target.fn, message });
      return Response.json({ error: `déclenchement impossible : ${message}` }, { status: 502 });
    }
    log('admin.run', { step, runId, reset, function: target.fn });
    return Response.json({ accepted: true, step, runId, reset, function: target.fn }, { status: 202 });
  };
}
