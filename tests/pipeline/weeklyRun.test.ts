import { describe, expect, it, vi } from 'vitest';
import type { Alert } from '../../src/pipeline/alert';
import { silentLogger } from '../../src/pipeline/log';
import type { ProcessRecord } from '../../src/pipeline/processRecord';
import { loadWeeklyState, runWeekly, WEEKLY_COLLECT_BUDGET_MS, type WeeklyRunDeps } from '../../src/pipeline/weeklyRun';
import type { CollectReport } from '../../src/sources/source';
import { memoryStores } from '../../src/storage/memory';
import { fakeClock } from '../helpers';

const RUN = '2026-W42';

function report(status: CollectReport['status'], offersWritten = 120, failed = 0): CollectReport {
  return {
    source: 'francetravail',
    runId: RUN,
    status,
    invocations: 1,
    partitions: { total: 10, pending: status === 'running' ? 2 : 0, done: 10 - failed, split: 0, failed },
    offersWritten,
    offersByPass: { A: offersWritten },
    truncatedPartitions: 0,
    apiCalls: 30,
    retries: 0,
    durationMs: 1000,
    errors: failed ? [{ partition: 'b-kllm', message: 'HTTP 500' }] : [],
  };
}

/** Dépendances factices : chaque étape réussit, sauf remplacement. */
function setup(overrides: Partial<WeeklyRunDeps> = {}) {
  const alerts: Alert[] = [];
  const deps = {
    stores: memoryStores(),
    log: silentLogger,
    clock: fakeClock(Date.parse('2026-10-12T05:00:00Z')),
    alert: vi.fn(async (alert: Alert) => {
      alerts.push(alert);
      return true;
    }),
    collectFt: vi.fn(async () => report('complete')),
    process: vi.fn(async () => ({ status: 'complete' }) as ProcessRecord),
    push: vi.fn(async () => ({ files: [], durationMs: 0 })),
    ...overrides,
  } satisfies WeeklyRunDeps;
  return { deps, alerts };
}

describe('weekly-run (SPEC.md §3.3, §10, §12)', () => {
  it('enchaîne collecte, traitement et envoi, puis ne refait rien', async () => {
    const { deps, alerts } = setup();
    const state = await runWeekly(RUN, deps);
    expect(state).toMatchObject({ status: 'complete', attempts: 1, collectStatus: 'complete', lastError: null });
    expect(state.steps).toEqual({ 'collect-ft': 'done', process: 'done', push: 'done' });
    expect(deps.collectFt).toHaveBeenCalledWith(RUN, { deadline: Date.parse('2026-10-12T05:00:00Z') + WEEKLY_COLLECT_BUDGET_MS });
    expect(deps.process).toHaveBeenCalledWith(RUN);

    const again = await runWeekly(RUN, deps);
    expect(again.attempts).toBe(1);
    expect(deps.collectFt).toHaveBeenCalledTimes(1);
    expect(deps.push).toHaveBeenCalledTimes(1);
    expect(alerts).toEqual([]);
  });

  it('attend la relance suivante quand la collecte est incomplète, puis traite et alerte à la 3e', async () => {
    const { deps, alerts } = setup({ collectFt: vi.fn(async () => report('incomplete', 100, 1)) });
    const first = await runWeekly(RUN, deps);
    expect(first).toMatchObject({ status: 'running', attempts: 1 });
    expect(first.steps['collect-ft']).toBe('pending');
    expect(deps.process).not.toHaveBeenCalled();
    await runWeekly(RUN, deps);
    expect(alerts).toEqual([]);

    const third = await runWeekly(RUN, deps);
    expect(third).toMatchObject({ status: 'complete', attempts: 3, collectStatus: 'incomplete' });
    expect(deps.process).toHaveBeenCalledTimes(1);
    expect(alerts.map((a) => a.kind)).toEqual(['collect-incomplete']);
    expect(alerts[0]!.message).toContain('b-kllm : HTTP 500');
    expect(third.history.map((h) => h.outcome)).toEqual([
      'pause : collecte incomplete (1 partitions à reprendre)',
      'pause : collecte incomplete (1 partitions à reprendre)',
      'complete',
    ]);
  });

  it('n’envoie rien et alerte quand la collecte se termine sans aucune offre', async () => {
    const { deps, alerts } = setup({ collectFt: vi.fn(async () => report('complete', 0)) });
    const state = await runWeekly(RUN, deps);
    expect(state).toMatchObject({ status: 'running', lastError: 'collecte France Travail terminée sans aucune offre' });
    expect(deps.process).not.toHaveBeenCalled();
    expect(alerts.map((a) => [a.kind, a.priority])).toEqual([['zero-offers', 5]]);

    await runWeekly(RUN, deps);
    const last = await runWeekly(RUN, deps);
    expect(last.status).toBe('failed');
    // Une alerte de chaque type par run ; la 3e tentative signale l'échec final.
    expect(alerts.map((a) => a.kind)).toEqual(['zero-offers', 'run-failed']);
  });

  it('alerte dès la première erreur du traitement, une seule fois', async () => {
    const { deps, alerts } = setup({ process: vi.fn(async () => Promise.reject(new Error('index illisible'))) });
    await runWeekly(RUN, deps);
    await runWeekly(RUN, deps);
    const last = await runWeekly(RUN, deps);
    expect(last).toMatchObject({ status: 'failed', attempts: 3, lastError: 'index illisible' });
    expect(last.steps).toEqual({ 'collect-ft': 'done', process: 'pending', push: 'pending' });
    expect(deps.collectFt).toHaveBeenCalledTimes(1);
    expect(alerts.map((a) => a.kind)).toEqual(['process-error', 'run-failed']);
  });

  it('reprend à l’envoi après une panne du site, sans refaire collecte ni traitement', async () => {
    const push = vi.fn().mockRejectedValueOnce(new Error('envoi de meta.json refusé : HTTP 502')).mockResolvedValue({ files: [], durationMs: 0 });
    const { deps, alerts } = setup({ push });
    expect((await runWeekly(RUN, deps)).status).toBe('running');
    const second = await runWeekly(RUN, deps);
    expect(second.status).toBe('complete');
    expect(deps.collectFt).toHaveBeenCalledTimes(1);
    expect(deps.process).toHaveBeenCalledTimes(1);
    expect(push).toHaveBeenCalledTimes(2);
    expect(alerts).toEqual([]);
  });

  it('alerte après 3 échecs de collecte, puis ignore les lancements sans --force', async () => {
    const collectFt = vi.fn(async (): Promise<CollectReport> => Promise.reject(new Error('OAuth : HTTP 401')));
    const { deps, alerts } = setup({ collectFt });
    for (let i = 0; i < 4; i++) await runWeekly(RUN, deps);
    expect(collectFt).toHaveBeenCalledTimes(3);
    const state = await loadWeeklyState(deps.stores, RUN);
    expect(state).toMatchObject({ status: 'failed', attempts: 3, lastError: 'OAuth : HTTP 401' });
    expect(alerts).toHaveLength(1);
    expect(alerts[0]).toMatchObject({ kind: 'run-failed', title: 'Run 2026-W42 en échec après 3 tentatives' });
    expect(alerts[0]!.message).toContain('admin weekly-run --run-id 2026-W42 --force');

    collectFt.mockResolvedValue(report('complete'));
    const forced = await runWeekly(RUN, { ...deps, force: true });
    expect(forced).toMatchObject({ status: 'complete', attempts: 1 });
  });

  it('ne traite pas une collecte interrompue avant la fin, même à la dernière tentative', async () => {
    const { deps, alerts } = setup({ collectFt: vi.fn(async () => report('running')) });
    for (let i = 0; i < 3; i++) await runWeekly(RUN, deps);
    expect(deps.process).not.toHaveBeenCalled();
    expect(alerts.map((a) => a.kind)).toEqual(['collect-incomplete']);
    expect((await loadWeeklyState(deps.stores, RUN))?.status).toBe('failed');
  });

  it('retente une alerte non délivrée au lancement suivant', async () => {
    const alert = vi.fn().mockResolvedValueOnce(false).mockResolvedValue(true);
    const { deps } = setup({ alert, process: vi.fn(async () => Promise.reject(new Error('panne'))) });
    await runWeekly(RUN, deps);
    const second = await runWeekly(RUN, deps);
    expect(alert).toHaveBeenCalledTimes(2);
    expect(second.alerts).toEqual(['process-error']);
  });
});
