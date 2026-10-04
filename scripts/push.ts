// Envoi des agrégats au site Netlify (SPEC.md §3.3, étape `push`).
//
//   npm run push -- [--data-dir .data] [--site-url https://…]
//
// Variables : SITE_URL (ou --site-url) et INGEST_SECRET (environnement ou fichier .env).
// Aucun déploiement n'est déclenché : les fichiers vont dans Netlify Blobs (SPEC.md §3.2).
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { env, requireEnv } from '../src/pipeline/env';
import { jsonLogger, silentLogger } from '../src/pipeline/log';
import { pushAggregates } from '../src/pipeline/push';
import { FileStore } from '../src/storage/filesystem';

try {
  process.loadEnvFile('.env');
} catch {
  // Pas de fichier .env : on s'en tient à l'environnement.
}

const { values } = parseArgs({
  options: {
    'data-dir': { type: 'string', default: env('DATA_DIR') ?? '.data' },
    'site-url': { type: 'string' },
    quiet: { type: 'boolean', default: false },
  },
});

const report = await pushAggregates({
  store: new FileStore(join(values['data-dir'], 'aggregates')),
  siteUrl: values['site-url'] ?? requireEnv('SITE_URL'),
  secret: requireEnv('INGEST_SECRET'),
  log: values.quiet ? silentLogger : jsonLogger,
});

console.log(JSON.stringify(report, null, 2));
