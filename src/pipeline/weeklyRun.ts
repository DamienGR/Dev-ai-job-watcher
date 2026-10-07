import { systemClock, type Clock } from '../sources/http';
import type { CollectReport } from '../sources/source';
import { getJson, setJson, type Stores } from '../storage/store';
import type { Alert, Alerter } from './alert';
import type { Logger } from './log';
import type { ProcessRecord } from './processRecord';
import type { PushReport } from './push';

// Job `weekly-run` du VPS (SPEC.md §3.3, D40) : collecte France Travail, traitement, envoi des
// agrégats. Lancé le lundi à 05:00, 06:00 et 07:00 UTC ; chaque lancement reprend à la première
// étape incomplète et ne fait rien si le run est complet. La collecte Adzuna arrive au lot 3.

/** Lancements d'un run par les timers ; au-delà, seul `admin weekly-run --force` relance. */
export const WEEKLY_MAX_ATTEMPTS = 3;
/** Les jobs s'arrêtent à 60 min (SPEC.md §12) : la collecte rend la main à 50 min. */
export const WEEKLY_COLLECT_BUDGET_MS = 50 * 60_000;

export const WEEKLY_STEPS = ['collect-ft', 'process', 'push'] as const;
export type WeeklyStep = (typeof WEEKLY_STEPS)[number];

export interface WeeklyRunState {
  runId: string;
  /** `failed` : tentatives épuisées sans run complet (alerte envoyée). */
  status: 'running' | 'complete' | 'failed';
  attempts: number;
  steps: Record<WeeklyStep, 'pending' | 'done'>;
  /** Statut de la collecte au moment où elle a été acceptée (`incomplete` à la dernière tentative). */
  collectStatus: CollectReport['status'] | null;
  createdAt: string;
  updatedAt: string;
  finishedAt: string | null;
  lastError: string | null;
  /** Types d'alertes délivrées pour ce run (une alerte de chaque type au plus). */
  alerts: string[];
  history: { at: string; attempt: number; outcome: string }[];
}

export function weeklyStateKey(runId: string): string {
  return `runs/${runId}/weekly-run.json`;
}

export async function loadWeeklyState(stores: Stores, runId: string): Promise<WeeklyRunState | null> {
  return getJson<WeeklyRunState>(stores.state, weeklyStateKey(runId));
}

export interface WeeklyRunDeps {
  stores: Stores;
  log: Logger;
  alert: Alerter;
  collectFt: (runId: string, options: { deadline: number }) => Promise<CollectReport>;
  process: (runId: string) => Promise<ProcessRecord>;
  push: () => Promise<PushReport>;
  clock?: Clock;
  maxAttempts?: number;
  /** Relance manuelle : remet le compteur de tentatives à zéro, garde les étapes faites. */
  force?: boolean;
}

/** Arrêt prévu de la tentative (pas une panne) : la relance suivante reprendra. */
class Pause extends Error {}

const message = (error: unknown) => (error instanceof Error ? error.message : String(error));

export async function runWeekly(runId: string, deps: WeeklyRunDeps): Promise<WeeklyRunState> {
  const { stores, log, clock = systemClock, maxAttempts = WEEKLY_MAX_ATTEMPTS, force = false } = deps;
  const nowIso = () => new Date(clock.now()).toISOString();

  const existing = await loadWeeklyState(stores, runId);
  if (existing?.status === 'complete' && !force) {
    log('weekly.already-complete', { runId });
    return existing;
  }
  if (existing && existing.attempts >= maxAttempts && !force) {
    log('weekly.attempts-exhausted', { runId, attempts: existing.attempts });
    return existing;
  }

  const at = nowIso();
  const state: WeeklyRunState = existing ?? {
    runId,
    status: 'running',
    attempts: 0,
    steps: { 'collect-ft': 'pending', process: 'pending', push: 'pending' },
    collectStatus: null,
    createdAt: at,
    updatedAt: at,
    finishedAt: null,
    lastError: null,
    alerts: [],
    history: [],
  };
  if (force) state.attempts = 0;
  state.attempts += 1;
  state.status = 'running';
  state.finishedAt = null;
  const attempt = state.attempts;
  const final = attempt >= maxAttempts;
  const save = async () => {
    state.updatedAt = nowIso();
    await setJson(stores.state, weeklyStateKey(runId), state);
  };
  await save();
  log('weekly.start', { runId, attempt, maxAttempts, steps: state.steps });

  let alertedThisAttempt = false;
  // Une alerte non délivrée (canal en panne ou absent) sera retentée au lancement suivant.
  const alertOnce = async (alert: Alert) => {
    if (state.alerts.includes(alert.kind)) return;
    alertedThisAttempt = true;
    if (await deps.alert(alert)) {
      state.alerts.push(alert.kind);
      await save();
    }
  };
  const relaunch = `Relance : deploy/vps/veille-job admin weekly-run --run-id ${runId} --force`;

  let outcome: string;
  try {
    if (state.steps['collect-ft'] !== 'done') {
      const report = await deps.collectFt(runId, { deadline: clock.now() + WEEKLY_COLLECT_BUDGET_MS });
      if (report.status === 'complete' && report.offersWritten === 0) {
        await alertOnce({
          kind: 'zero-offers',
          title: `Run ${runId} : zéro offre France Travail`,
          message: `La collecte s'est terminée sans aucune offre (${report.apiCalls} appels). Traitement bloqué pour ne pas clore toutes les offres.\nRelance après vérification : deploy/vps/veille-job admin collect-ft --run-id ${runId} --reset`,
          priority: 5,
        });
        throw new Error('collecte France Travail terminée sans aucune offre');
      }
      if (report.status !== 'complete') {
        const failed = report.partitions.failed + report.partitions.pending;
        if (!final) throw new Pause(`collecte ${report.status} (${failed} partitions à reprendre)`);
        await alertOnce({
          kind: 'collect-incomplete',
          title: `Run ${runId} : collecte France Travail incomplète`,
          message: `Après ${attempt} tentatives, ${failed} partitions sur ${report.partitions.total} restent en échec ou en attente.\n${report.errors.slice(-3).map((e) => `- ${e.partition ?? 'run'} : ${e.message}`).join('\n')}\n${relaunch}`,
        });
        // Partitions en attente (délai dépassé) : le traitement refuserait une collecte en cours.
        if (report.status === 'running') throw new Error('collecte interrompue avant la fin de toutes les partitions');
      }
      state.collectStatus = report.status;
      state.steps['collect-ft'] = 'done';
      await save();
    }

    if (state.steps.process !== 'done') {
      try {
        await deps.process(runId);
      } catch (error) {
        await alertOnce({
          kind: 'process-error',
          title: `Run ${runId} : erreur du traitement`,
          message: `${message(error)}\nRelance : deploy/vps/veille-job admin process --run-id ${runId}`,
        });
        throw error;
      }
      state.steps.process = 'done';
      await save();
    }

    if (state.steps.push !== 'done') {
      await deps.push();
      state.steps.push = 'done';
    }

    state.status = 'complete';
    state.finishedAt = nowIso();
    state.lastError = null;
    outcome = 'complete';
  } catch (error) {
    state.lastError = message(error);
    outcome = error instanceof Pause ? `pause : ${state.lastError}` : `erreur : ${state.lastError}`;
    if (final) {
      state.status = 'failed';
      state.finishedAt = nowIso();
      if (!alertedThisAttempt) {
        await alertOnce({
          kind: 'run-failed',
          title: `Run ${runId} en échec après ${attempt} tentative${attempt > 1 ? 's' : ''}`,
          message: `Dernière erreur : ${state.lastError}\nÉtapes : ${WEEKLY_STEPS.map((s) => `${s} ${state.steps[s] === 'done' ? 'faite' : 'à faire'}`).join(', ')}\n${relaunch}`,
        });
      }
    }
  }

  state.history.push({ at: nowIso(), attempt, outcome });
  await save();
  log('weekly.end', { runId, attempt, status: state.status, outcome });
  return state;
}
