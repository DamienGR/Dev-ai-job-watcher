// Job `weekly-run` du VPS (SPEC.md §3.3) : collecte France Travail, traitement, envoi.
//
//   npm run weekly-run -- [--run-id 2026-W41] [--data-dir …] [--force]
//
// Sur le VPS, lancé par le timer `veille-weekly-run` via `deploy/vps/veille-job weekly-run`.
// Code de sortie 0 si le run est complet, 1 sinon (nouvelle tentative au lancement suivant).
import { parseArgs } from 'node:util';
import { isRunId, runIdFor } from '../src/pipeline/runId';
import { runWeekly } from '../src/pipeline/weeklyRun';
import { dataDirOf, jobContext, loadDotEnv } from './jobs';

loadDotEnv();

const { values } = parseArgs({
  options: {
    'run-id': { type: 'string' },
    'data-dir': { type: 'string' },
    force: { type: 'boolean', default: false },
  },
});

const runId = values['run-id'] ?? runIdFor();
if (!isRunId(runId)) throw new Error(`runId invalide : ${runId} (attendu : AAAA-Wss)`);

const ctx = await jobContext(dataDirOf(values['data-dir']));
const state = await runWeekly(runId, { ...ctx, force: values.force });
console.log(JSON.stringify(state, null, 2));
process.exitCode = state.status === 'complete' ? 0 : 1;
