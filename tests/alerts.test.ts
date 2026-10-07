import { afterEach, describe, expect, it, vi } from 'vitest';
import watchdogFunction, { config as watchdogConfig } from '../netlify/functions/watchdog.mts';
import { checkFreshness, createWatchdogHandler } from '../src/functions/watchdog';
import { alerterFromEnv, ntfyAlerter, parseNtfyUrl, type Alert } from '../src/pipeline/alert';
import { BACKUP_STATE_KEY, runBackup, type BackupState, type ResticRunner } from '../src/pipeline/backup';
import type { Logger } from '../src/pipeline/log';
import { silentLogger } from '../src/pipeline/log';
import { MemoryStore } from '../src/storage/memory';
import { getJson, setJson } from '../src/storage/store';
import { fakeClock } from './helpers';

afterEach(() => vi.unstubAllEnvs());

const sample: Alert = { kind: 'run-failed', title: 'Run 2026-W42 en échec', message: 'Dernière erreur : HTTP 401' };

describe('alertes ntfy (SPEC.md §10, D38)', () => {
  it('découpe l’adresse du sujet en serveur et sujet', () => {
    expect(parseNtfyUrl('https://ntfy.sh/veille-3f9a1c')).toEqual({ server: 'https://ntfy.sh/', topic: 'veille-3f9a1c' });
    expect(parseNtfyUrl('https://ntfy.example.fr/base/veille')).toEqual({ server: 'https://ntfy.example.fr/base/', topic: 'veille' });
    expect(() => parseNtfyUrl('https://ntfy.sh/')).toThrow('ALERT_NTFY_URL');
    expect(() => parseNtfyUrl('http://ntfy.sh/veille')).toThrow('ALERT_NTFY_URL');
  });

  it('publie en JSON à la racine du serveur, avec le jeton s’il existe', async () => {
    const fetchImpl = vi.fn(async () => new Response('{}', { status: 200 }));
    const send = ntfyAlerter({ url: 'https://ntfy.sh/veille-3f9a1c', token: 'tk_abc', origin: 'VPS', log: silentLogger, fetch: fetchImpl as unknown as typeof fetch });
    expect(await send(sample)).toBe(true);
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://ntfy.sh/');
    expect(init.headers).toEqual({ 'content-type': 'application/json', authorization: 'Bearer tk_abc' });
    expect(JSON.parse(init.body as string)).toEqual({
      topic: 'veille-3f9a1c',
      title: '[VPS] Run 2026-W42 en échec',
      message: 'Dernière erreur : HTTP 401',
      priority: 4,
      tags: ['warning'],
    });
  });

  it('ne lève jamais : un refus du serveur renvoie false, après les relances', async () => {
    const events: string[] = [];
    const log: Logger = (event) => events.push(event);
    const fetchImpl = vi.fn(async () => new Response('', { status: 503 }));
    const send = ntfyAlerter({ url: 'https://ntfy.sh/t', log, fetch: fetchImpl as unknown as typeof fetch, clock: fakeClock(), delaysMs: [1, 1] });
    expect(await send(sample)).toBe(false);
    expect(fetchImpl).toHaveBeenCalledTimes(3);
    expect(events).toEqual(['alert.retry', 'alert.retry', 'alert.failed']);
  });

  it('sans ALERT_NTFY_URL, écrit l’alerte au journal sans appel réseau', async () => {
    vi.stubEnv('ALERT_NTFY_URL', '');
    const events: string[] = [];
    const fetchImpl = vi.fn();
    const send = alerterFromEnv((event) => events.push(event), { fetch: fetchImpl as unknown as typeof fetch });
    expect(await send(sample)).toBe(false);
    expect(events).toEqual(['alert.unconfigured']);
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

describe('watchdog (SPEC.md §3.3, §10)', () => {
  const meta = (runId: string) => ({ generatedAt: '2026-10-12T05:10:00Z', lastRun: { runId, status: 'complete' } });

  it('compte l’âge du dernier run depuis son lundi 05:00 UTC, seuil 8 jours', () => {
    // Run 2026-W42 : lundi 12 octobre 2026, 05:00 UTC.
    expect(checkFreshness(meta('2026-W42'), Date.parse('2026-10-20T05:00:00Z'))).toEqual({ ok: true, lastRun: '2026-W42', ageDays: 8, reason: null });
    expect(checkFreshness(meta('2026-W42'), Date.parse('2026-10-20T09:00:00Z'))).toMatchObject({ ok: false, ageDays: 8.2 });
    expect(checkFreshness(null, 0)).toMatchObject({ ok: false, lastRun: null });
    expect(checkFreshness({ lastRun: null }, 0).reason).toContain('aucun run publié');
  });

  it('alerte quand le dernier run publié est trop ancien, pas sinon', async () => {
    const store = new MemoryStore();
    await setJson(store, 'meta.json', meta('2026-W42'));
    const alert = vi.fn(async () => true);
    const handler = (now: string) => createWatchdogHandler({ store: () => store, alert, log: silentLogger, now: () => Date.parse(now) });

    expect(await (await handler('2026-10-13T09:00:00Z')()).json()).toMatchObject({ ok: true, lastRun: '2026-W42' });
    expect(alert).not.toHaveBeenCalled();

    // Le run du lundi 19 a échoué : alerte le mardi 20 à 09:00.
    expect(await (await handler('2026-10-20T09:00:00Z')()).json()).toMatchObject({ ok: false });
    expect(alert).toHaveBeenCalledWith(expect.objectContaining({ kind: 'no-recent-run', priority: 5 }));
  });

  it('est planifiée chaque jour à 09:00 UTC', () => {
    expect(watchdogConfig).toEqual({ schedule: '0 9 * * *' });
    expect(typeof watchdogFunction).toBe('function');
  });
});

describe('sauvegarde restic (SPEC.md §3.4, D39)', () => {
  function setup(results: Record<string, number>, configured = true) {
    const calls: string[][] = [];
    const restic: ResticRunner = async (args) => {
      calls.push([...args]);
      return { code: results[args[0]!] ?? 0, output: `sortie de ${args[0]}` };
    };
    const alerts: Alert[] = [];
    const state = new MemoryStore();
    const run = () =>
      runBackup({
        dataDir: '/home/veille/data',
        state,
        log: silentLogger,
        alert: async (a) => {
          alerts.push(a);
          return true;
        },
        restic,
        configured,
        clock: fakeClock(Date.parse('2026-10-12T09:00:00Z')),
      });
    return { calls, alerts, state, run };
  }

  it('sauvegarde DATA_DIR sans le verrou, puis applique la rétention', async () => {
    const { calls, alerts, state, run } = setup({});
    expect(await run()).toMatchObject({ status: 'complete', lastSuccessAt: '2026-10-12T09:00:00.000Z', error: null });
    expect(calls).toEqual([
      ['backup', '/home/veille/data', '--tag', 'veille', '--exclude', '/home/veille/data/.lock'],
      ['forget', '--tag', 'veille', '--keep-weekly', '12', '--keep-monthly', '24', '--prune'],
    ]);
    expect(alerts).toEqual([]);
    expect(await getJson<BackupState>(state, BACKUP_STATE_KEY)).toMatchObject({ status: 'complete' });
  });

  it('alerte et garde la dernière réussite quand restic échoue', async () => {
    const ok = setup({});
    await ok.run();
    const failing = setup({ backup: 1 });
    await setJson(failing.state, BACKUP_STATE_KEY, await getJson(ok.state, BACKUP_STATE_KEY));
    const result = await failing.run();
    expect(result).toMatchObject({ status: 'failed', lastSuccessAt: '2026-10-12T09:00:00.000Z' });
    expect(failing.calls).toHaveLength(1);
    expect(failing.alerts.map((a) => a.kind)).toEqual(['backup-failed']);
    expect(failing.alerts[0]!.message).toContain('sortie de backup');
  });

  it('alerte chaque semaine tant que la sauvegarde n’est pas configurée', async () => {
    const { calls, alerts, run } = setup({}, false);
    expect((await run()).status).toBe('unconfigured');
    expect(calls).toEqual([]);
    expect(alerts.map((a) => a.kind)).toEqual(['backup-unconfigured']);
  });

  it('signale un nettoyage en échec sans perdre l’instantané', async () => {
    const { alerts, run } = setup({ forget: 1 });
    expect((await run()).status).toBe('failed');
    expect(alerts.map((a) => [a.kind, a.priority])).toEqual([['backup-prune-failed', 3]]);
  });
});
