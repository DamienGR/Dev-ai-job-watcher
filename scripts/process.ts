// Traitement d'un run en local (SPEC.md §6, §7), dans `.data/` au lieu de Netlify Blobs.
//
//   npm run process -- [--run-id 2026-W41] [--data-dir .data]
//
// La collecte du run doit être terminée (`npm run collect:ft`).
import { parseArgs } from 'node:util';
import { loadCompiledTaxonomy } from '../src/core/taxonomy';
import { jsonLogger, silentLogger } from '../src/pipeline/log';
import { processRun } from '../src/pipeline/process';
import { isRunId, runIdFor } from '../src/pipeline/runId';
import { fileStores } from '../src/storage/filesystem';

const { values } = parseArgs({
  options: {
    'run-id': { type: 'string' },
    'data-dir': { type: 'string', default: '.data' },
    quiet: { type: 'boolean', default: false },
  },
});

const runId = values['run-id'] ?? runIdFor();
if (!isRunId(runId)) throw new Error(`runId invalide : ${runId} (attendu : AAAA-Wss)`);

const record = await processRun(runId, {
  stores: fileStores(values['data-dir']),
  log: values.quiet ? silentLogger : jsonLogger,
  taxonomy: await loadCompiledTaxonomy(),
});

console.log(JSON.stringify(record, null, 2));
process.exitCode = record.status === 'complete' ? 0 : 1;
