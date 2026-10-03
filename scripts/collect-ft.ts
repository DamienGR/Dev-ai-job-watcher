// Collecte France Travail en local (SPEC.md §4.1), dans `.data/` au lieu de Netlify Blobs.
//
//   npm run collect:ft -- [--run-id 2026-W41] [--mode live|fixtures] [--reset] [--concurrency 4]
//
// Mode `live` : identifiants FT_CLIENT_ID / FT_CLIENT_SECRET (environnement ou fichier .env).
import { parseArgs } from 'node:util';
import { loadTaxonomy } from '../src/core/taxonomy';
import { env } from '../src/pipeline/env';
import { jsonLogger, silentLogger } from '../src/pipeline/log';
import { isRunId, runIdFor } from '../src/pipeline/runId';
import { createFtApi, FranceTravailSource } from '../src/sources/francetravail';
import { sourceMode } from '../src/sources/mode';
import { fileStores } from '../src/storage/filesystem';

try {
  process.loadEnvFile('.env');
} catch {
  // Pas de fichier .env : on s'en tient à l'environnement.
}

const { values } = parseArgs({
  options: {
    'run-id': { type: 'string' },
    mode: { type: 'string' },
    'data-dir': { type: 'string', default: '.data' },
    reset: { type: 'boolean', default: false },
    concurrency: { type: 'string', default: '4' },
    quiet: { type: 'boolean', default: false },
  },
});

const runId = values['run-id'] ?? runIdFor();
if (!isRunId(runId)) throw new Error(`runId invalide : ${runId} (attendu : AAAA-Wss)`);
const mode = sourceMode(values.mode ?? env('SOURCE_MODE'));

const source = new FranceTravailSource({
  api: await createFtApi(mode),
  taxonomy: await loadTaxonomy(),
  concurrency: Number(values.concurrency),
});
const report = await source.collect(runId, {
  stores: fileStores(values['data-dir']),
  log: values.quiet ? silentLogger : jsonLogger,
  reset: values.reset,
});

console.log(JSON.stringify({ mode, ...report }, null, 2));
process.exitCode = report.status === 'complete' ? 0 : 1;
