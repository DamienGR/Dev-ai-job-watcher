import { describe, expect, it } from 'vitest';
import type { CompiledTaxonomy } from '../../src/core/taxonomy';
import type { Alert } from '../../src/pipeline/alert';
import { silentLogger } from '../../src/pipeline/log';
import { TAXONOMY_VERSION_KEY, type ReclassifyReport } from '../../src/pipeline/process';
import { applyTaxonomyUpdate, updateCode, type CommandResult } from '../../src/pipeline/update';
import { memoryStores } from '../../src/storage/memory';
import { setJson } from '../../src/storage/store';

// Job `update` du VPS (SPEC.md §3.3, §9.3, D67).

/** Dépôt simulé : réponses par commande, journal des commandes lancées. */
function fakeRepo(answers: Record<string, Partial<CommandResult>>) {
  const calls: string[] = [];
  const run = (command: string, args: string[]): CommandResult => {
    const line = [command, ...args].join(' ');
    calls.push(line);
    const answer = answers[line] ?? {};
    return { status: answer.status ?? 0, stdout: answer.stdout ?? '', stderr: answer.stderr ?? '' };
  };
  return { run, calls };
}

function alerts() {
  const sent: Alert[] = [];
  return { sent, alert: async (a: Alert) => (sent.push(a), true) };
}

const HEAD = { 'git rev-parse --abbrev-ref HEAD': { stdout: 'main\n' }, 'git rev-parse HEAD': { stdout: 'aaaaaaa1\n' } };

describe('mise à jour du code du VPS', () => {
  it('ne fait rien quand main est à jour', async () => {
    const { run, calls } = fakeRepo({ ...HEAD, 'git rev-parse FETCH_HEAD': { stdout: 'aaaaaaa1\n' } });
    const { sent, alert } = alerts();
    expect(await updateCode({ run, log: silentLogger, alert })).toEqual({ from: 'aaaaaaa1', to: 'aaaaaaa1', changed: [], npmCi: false });
    expect(calls).toEqual([
      'git rev-parse --abbrev-ref HEAD',
      'git status --porcelain --untracked-files=no',
      'git fetch --quiet origin main',
      'git rev-parse HEAD',
      'git rev-parse FETCH_HEAD',
    ]);
    expect(sent).toEqual([]);
  });

  it('avance main, lance npm ci si le verrou des dépendances change et signale les unités systemd', async () => {
    const { run, calls } = fakeRepo({
      ...HEAD,
      'git rev-parse FETCH_HEAD': { stdout: 'bbbbbbb2\n' },
      'git diff --name-only HEAD FETCH_HEAD': { stdout: 'package-lock.json\ntaxonomy.yaml\ndeploy/vps/systemd/veille-update.timer\n' },
    });
    const { sent, alert } = alerts();
    const report = await updateCode({ run, log: silentLogger, alert });
    expect(report).toEqual({
      from: 'aaaaaaa1',
      to: 'bbbbbbb2',
      changed: ['package-lock.json', 'taxonomy.yaml', 'deploy/vps/systemd/veille-update.timer'],
      npmCi: true,
    });
    expect(calls.slice(5)).toEqual([
      'git merge-base --is-ancestor HEAD FETCH_HEAD',
      'git diff --name-only HEAD FETCH_HEAD',
      'git merge --ff-only --quiet FETCH_HEAD',
      'npm ci --no-audit --no-fund --loglevel=error',
    ]);
    expect(sent.map((a) => a.kind)).toEqual(['update-units']);
    expect(sent[0]!.message).toContain('systemctl --user daemon-reload');
  });

  it('sans changement de dépendances, pas de npm ci', async () => {
    const { run, calls } = fakeRepo({
      ...HEAD,
      'git rev-parse FETCH_HEAD': { stdout: 'bbbbbbb2\n' },
      'git diff --name-only HEAD FETCH_HEAD': { stdout: 'taxonomy.yaml\n' },
    });
    expect((await updateCode({ run, log: silentLogger, alert: alerts().alert })).npmCi).toBe(false);
    expect(calls.some((c) => c.startsWith('npm'))).toBe(false);
  });

  it('refuse une branche divergente, une autre branche ou des fichiers modifiés, avec une alerte', async () => {
    const cases: [Record<string, Partial<CommandResult>>, RegExp][] = [
      [{ ...HEAD, 'git rev-parse FETCH_HEAD': { stdout: 'bbbbbbb2' }, 'git merge-base --is-ancestor HEAD FETCH_HEAD': { status: 1 } }, /a divergé/],
      [{ 'git rev-parse --abbrev-ref HEAD': { stdout: 'essai' } }, /branche essai/],
      [{ ...HEAD, 'git status --porcelain --untracked-files=no': { stdout: ' M taxonomy.yaml' } }, /fichiers modifiés/],
      [{ ...HEAD, 'git fetch --quiet origin main': { status: 128, stderr: 'fatal: Could not read from remote repository.' } }, /code 128\nfatal/],
    ];
    for (const [answers, error] of cases) {
      const { run, calls } = fakeRepo(answers);
      const { sent, alert } = alerts();
      await expect(updateCode({ run, log: silentLogger, alert })).rejects.toThrow(error);
      expect(calls).not.toContain('git merge --ff-only --quiet FETCH_HEAD');
      expect(sent).toHaveLength(1);
      expect(sent[0]).toMatchObject({ kind: 'update-error', title: 'Mise à jour du code du VPS en échec' });
      expect(sent[0]!.message).toMatch(error);
    }
  });
});

describe('application de la taxonomie après mise à jour', () => {
  const taxonomy = { version: 4 } as CompiledTaxonomy;
  const report: ReclassifyReport = {
    from: 3,
    to: 4,
    runs: ['2026-W41', '2026-W42'],
    effect: { run: '2026-W42', before: { classified: 1700, retained: 3000 }, after: { classified: 1850, retained: 3010 } },
    durationMs: 61_000,
  };
  const deps = async (version: number | null, overrides: { reclassify?: () => Promise<ReclassifyReport> } = {}) => {
    const stores = memoryStores();
    if (version !== null) await setJson(stores.state, TAXONOMY_VERSION_KEY, { version, history: [] });
    const { sent, alert } = alerts();
    const pushes: number[] = [];
    return {
      sent,
      pushes,
      deps: {
        stores,
        log: silentLogger,
        alert,
        taxonomy,
        reclassify: overrides.reclassify ?? (async () => report),
        push: async () => (pushes.push(1), { files: [], durationMs: 0 }),
      },
    };
  };

  it('ne reclasse pas sans données ni quand les données sont à jour', async () => {
    for (const [version, status] of [[null, 'no-data'], [4, 'up-to-date']] as const) {
      const { deps: d, sent, pushes } = await deps(version);
      expect(await applyTaxonomyUpdate(d)).toEqual({ status, version: 4 });
      expect([sent, pushes]).toEqual([[], []]);
    }
  });

  it('reclasse, envoie, puis prévient avec l’effet sur le dernier run', async () => {
    const { deps: d, sent, pushes } = await deps(3);
    expect(await applyTaxonomyUpdate(d)).toMatchObject({ status: 'reclassified', version: 4, report });
    expect(pushes).toHaveLength(1);
    expect(sent).toEqual([
      {
        kind: 'reclassified',
        title: 'Taxonomie v4 appliquée',
        message: '2 runs reclassés (v3 → v4) en 61 s, agrégats envoyés.\nDernier run 2026-W42 : 56,7 % des offres classées avant, 61,5 % après.',
        priority: 3,
      },
    ]);
  });

  it('alerte si le reclassement échoue, sans rien envoyer', async () => {
    const { deps: d, sent, pushes } = await deps(3, {
      reclassify: async () => {
        throw new Error('raw illisible');
      },
    });
    await expect(applyTaxonomyUpdate(d)).rejects.toThrow('raw illisible');
    expect(pushes).toEqual([]);
    expect(sent).toMatchObject([{ kind: 'reclassify-error', title: 'Reclassement v3 → v4 en échec' }]);
    expect(sent[0]!.message).toContain('veille-job update --apply');
  });
});
