import { alerterFromEnv, type Alerter } from '../pipeline/alert';
import { META_FILE } from '../pipeline/aggregateFiles';
import { jsonLogger, type Logger } from '../pipeline/log';
import { isRunId, weekStart } from '../pipeline/runId';
import { NetlifyBlobStore } from '../storage/netlify';
import { getJson, type BlobStore } from '../storage/store';

// `watchdog` (SPEC.md §3.3, §10) : fonction planifiée quotidienne sur Netlify. Elle alerte si
// aucun run n'a réussi depuis 8 jours, ce qui couvre un VPS arrêté (D42). Un run réussi est un
// run dont le VPS a envoyé les agrégats : son `meta.json` est dans Blobs.

export const WATCHDOG_MAX_AGE_MS = 8 * 86_400_000;
/** Heure de lancement de `weekly-run` le lundi (UTC), point de départ de l'âge d'un run. */
const RUN_HOUR_UTC = 5;

interface MetaLike {
  generatedAt?: string;
  lastRun?: { runId?: string; status?: string } | null;
}

export interface WatchdogResult {
  ok: boolean;
  lastRun: string | null;
  ageDays: number | null;
  reason: string | null;
}

/** Âge du dernier run publié, compté depuis son lundi 05:00 UTC. */
export function checkFreshness(meta: MetaLike | null, now: number): WatchdogResult {
  const runId = meta?.lastRun?.runId;
  if (!runId || !isRunId(runId)) {
    return { ok: false, lastRun: null, ageDays: null, reason: 'aucun run publié sur le site (meta.json absent ou sans dernier run)' };
  }
  const age = now - (weekStart(runId).getTime() + RUN_HOUR_UTC * 3_600_000);
  const ageDays = Math.round((age / 86_400_000) * 10) / 10;
  if (age > WATCHDOG_MAX_AGE_MS) {
    return { ok: false, lastRun: runId, ageDays, reason: `dernier run publié : ${runId}, il y a ${ageDays} jours` };
  }
  return { ok: true, lastRun: runId, ageDays, reason: null };
}

export interface WatchdogDeps {
  store?: () => BlobStore;
  alert?: Alerter;
  log?: Logger;
  now?: () => number;
}

export function createWatchdogHandler(deps: WatchdogDeps = {}) {
  const log = deps.log ?? jsonLogger;
  return async (): Promise<Response> => {
    const store = (deps.store ?? (() => new NetlifyBlobStore('aggregates')))();
    const meta = await getJson<MetaLike>(store, META_FILE);
    const result = checkFreshness(meta, (deps.now ?? Date.now)());
    log('watchdog', { ...result });
    if (!result.ok) {
      const alert = deps.alert ?? alerterFromEnv(log, { origin: 'Netlify' });
      await alert({
        kind: 'no-recent-run',
        title: 'Aucun run réussi depuis 8 jours',
        message: `${result.reason}.\nVérifier le VPS : systemctl --user list-timers, journalctl --user -u veille-weekly-run.`,
        priority: 5,
      });
    }
    return Response.json(result);
  };
}
