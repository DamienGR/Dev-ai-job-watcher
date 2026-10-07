// Sauvegarde de `DATA_DIR` hors du VPS par restic (SPEC.md §3.4, D39).
//
//   npm run backup -- [--data-dir …]
//
// Sur le VPS, lancé par le timer `veille-backup` via `deploy/vps/veille-job backup`.
import { resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { alerterFromEnv } from '../src/pipeline/alert';
import { runBackup, spawnRestic } from '../src/pipeline/backup';
import { env } from '../src/pipeline/env';
import { jsonLogger } from '../src/pipeline/log';
import { fileStores } from '../src/storage/filesystem';
import { dataDirOf, loadDotEnv } from './jobs';

loadDotEnv();

const { values } = parseArgs({ options: { 'data-dir': { type: 'string' } } });
const dataDir = resolve(dataDirOf(values['data-dir']));

const state = await runBackup({
  dataDir,
  state: fileStores(dataDir).state,
  log: jsonLogger,
  alert: alerterFromEnv(jsonLogger, { origin: 'VPS' }),
  restic: spawnRestic,
  configured: Boolean(env('RESTIC_REPOSITORY') && env('RESTIC_PASSWORD')),
});
console.log(JSON.stringify(state, null, 2));
process.exitCode = state.status === 'complete' ? 0 : 1;
