import { spawn } from 'node:child_process';
import { join } from 'node:path';
import { systemClock, type Clock } from '../sources/http';
import { getJson, setJson, type BlobStore } from '../storage/store';
import type { Alerter } from './alert';
import type { Logger } from './log';

// Sauvegarde hebdomadaire de `DATA_DIR` hors du VPS (SPEC.md §3.4, exigée ; D39) : restic vers
// un bucket compatible S3 (Cloudflare R2). restic lit son dépôt et ses identifiants dans
// l'environnement : `RESTIC_REPOSITORY`, `RESTIC_PASSWORD`, `AWS_ACCESS_KEY_ID`,
// `AWS_SECRET_ACCESS_KEY`. Lancée le lundi après `weekly-run`, sous le même verrou.

export const BACKUP_TAG = 'veille';
/** Rétention : 12 instantanés hebdomadaires et 24 mensuels ; `raw` n'étant jamais effacé, le dernier contient tout. */
export const BACKUP_KEEP = ['--keep-weekly', '12', '--keep-monthly', '24'] as const;
export const BACKUP_STATE_KEY = 'backup.json';

export interface ResticResult {
  code: number;
  /** Fin de la sortie (stdout et stderr), pour le journal et l'alerte. */
  output: string;
}

export type ResticRunner = (args: readonly string[]) => Promise<ResticResult>;

export interface BackupState {
  status: 'complete' | 'failed' | 'unconfigured';
  at: string;
  lastSuccessAt: string | null;
  durationMs: number;
  error: string | null;
}

export interface BackupDeps {
  dataDir: string;
  /** Store `state` (dernier résultat, `backup.json`). */
  state: BlobStore;
  log: Logger;
  alert: Alerter;
  restic: ResticRunner;
  /** `RESTIC_REPOSITORY` et `RESTIC_PASSWORD` présents. */
  configured: boolean;
  clock?: Clock;
}

const tail = (text: string, lines = 15) => text.trim().split('\n').slice(-lines).join('\n');

/** Lance `restic` avec l'environnement du job ; renvoie le code de sortie et la fin de la sortie. */
export const spawnRestic: ResticRunner = (args) =>
  new Promise((resolve) => {
    const child = spawn('restic', args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let output = '';
    const keep = (chunk: Buffer) => {
      output = (output + chunk.toString('utf8')).slice(-20_000);
    };
    child.stdout.on('data', keep);
    child.stderr.on('data', keep);
    child.on('error', (error) => resolve({ code: 127, output: `restic introuvable ou non exécutable : ${error.message}` }));
    child.on('close', (code) => resolve({ code: code ?? 1, output: tail(output) }));
  });

export async function runBackup(deps: BackupDeps): Promise<BackupState> {
  const { dataDir, log, clock = systemClock } = deps;
  const started = clock.now();
  const previous = await getJson<BackupState>(deps.state, BACKUP_STATE_KEY);
  const finish = async (status: BackupState['status'], error: string | null): Promise<BackupState> => {
    const at = new Date(clock.now()).toISOString();
    const state: BackupState = {
      status,
      at,
      lastSuccessAt: status === 'complete' ? at : (previous?.lastSuccessAt ?? null),
      durationMs: clock.now() - started,
      error,
    };
    await setJson(deps.state, BACKUP_STATE_KEY, state);
    log('backup.end', { ...state });
    return state;
  };

  if (!deps.configured) {
    await deps.alert({
      kind: 'backup-unconfigured',
      title: 'Sauvegarde non configurée',
      message: `RESTIC_REPOSITORY ou RESTIC_PASSWORD manque dans le fichier d'environnement : ${dataDir} n'est copié nulle part (voir deploy/vps/README.md).`,
    });
    return finish('unconfigured', 'RESTIC_REPOSITORY ou RESTIC_PASSWORD manquant');
  }

  log('backup.start', { dataDir });
  const backup = await deps.restic(['backup', dataDir, '--tag', BACKUP_TAG, '--exclude', join(dataDir, '.lock')]);
  if (backup.code !== 0) {
    // Code 3 : instantané créé, mais des fichiers n'ont pas pu être lus.
    const error = `restic backup : code ${backup.code}`;
    await deps.alert({ kind: 'backup-failed', title: 'Sauvegarde en échec', message: `${error}\n${backup.output}` });
    return finish('failed', `${error}\n${backup.output}`);
  }
  log('backup.snapshot', { output: tail(backup.output, 5) });

  const forget = await deps.restic(['forget', '--tag', BACKUP_TAG, ...BACKUP_KEEP, '--prune']);
  if (forget.code !== 0) {
    const error = `restic forget : code ${forget.code} (instantané du jour bien créé)`;
    await deps.alert({ kind: 'backup-prune-failed', title: 'Sauvegarde : nettoyage en échec', message: `${error}\n${forget.output}`, priority: 3 });
    return finish('failed', `${error}\n${forget.output}`);
  }
  return finish('complete', null);
}
