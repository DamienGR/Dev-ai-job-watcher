// Dépendances communes des jobs du VPS (`weekly-run`, `admin`, `backup`) : environnement,
// stores sur disque, collecte, traitement et envoi branchés sur les vrais modules.
import { loadCompiledTaxonomy, type CompiledTaxonomy } from '../src/core/taxonomy';
import { alerterFromEnv, type Alerter } from '../src/pipeline/alert';
import { env, requireEnv } from '../src/pipeline/env';
import { jsonLogger, type Logger } from '../src/pipeline/log';
import { processRun } from '../src/pipeline/process';
import { pushAggregates } from '../src/pipeline/push';
import { createFtApi, FranceTravailSource } from '../src/sources/francetravail';
import { sourceMode } from '../src/sources/mode';
import { fileStores } from '../src/storage/filesystem';
import type { Stores } from '../src/storage/store';

/** Charge `.env` s'il existe (poste local) ; sur le VPS, `veille-job` fournit l'environnement. */
export function loadDotEnv(): void {
  try {
    process.loadEnvFile('.env');
  } catch {
    // Pas de fichier .env : on s'en tient à l'environnement.
  }
}

/** Répertoire des stores : `--data-dir`, sinon `DATA_DIR`, sinon `.data` (poste local). */
export function dataDirOf(value: string | undefined): string {
  return value ?? env('DATA_DIR') ?? '.data';
}

export interface JobContext {
  dataDir: string;
  stores: Stores;
  log: Logger;
  alert: Alerter;
  taxonomy: CompiledTaxonomy;
  collectFt: (runId: string, options?: { deadline?: number; reset?: boolean }) => ReturnType<FranceTravailSource['collect']>;
  process: (runId: string) => ReturnType<typeof processRun>;
  push: () => ReturnType<typeof pushAggregates>;
}

export async function jobContext(dataDir: string, log: Logger = jsonLogger): Promise<JobContext> {
  const stores = fileStores(dataDir);
  const taxonomy = await loadCompiledTaxonomy();
  return {
    dataDir,
    stores,
    log,
    alert: alerterFromEnv(log, { origin: 'VPS' }),
    taxonomy,
    collectFt: async (runId, { deadline, reset } = {}) => {
      const source = new FranceTravailSource({ api: await createFtApi(sourceMode()), taxonomy: taxonomy.source });
      return source.collect(runId, { stores, log, deadline, reset });
    },
    process: (runId) => processRun(runId, { stores, log, taxonomy }),
    push: () =>
      pushAggregates({ store: stores.aggregates, siteUrl: requireEnv('SITE_URL'), secret: requireEnv('INGEST_SECRET'), log }),
  };
}
