import { systemClock, withRetry, type Clock } from '../sources/http';
import type { BlobStore } from '../storage/store';
import { isAggregateFile, MAX_AGGREGATE_BYTES, pushOrder } from './aggregateFiles';
import type { Logger } from './log';

export interface PushOptions {
  /** Store `aggregates` du VPS. */
  store: BlobStore;
  /** Adresse du site Netlify (`SITE_URL`). */
  siteUrl: string;
  /** `INGEST_SECRET`. */
  secret: string;
  log: Logger;
  fetch?: typeof fetch;
  clock?: Clock;
  delaysMs?: readonly number[];
}

export interface PushReport {
  files: { name: string; bytes: number }[];
  durationMs: number;
}

/**
 * Envoi des agrégats au site (SPEC.md §3.3, étape `push`) : chaque fichier du store
 * `aggregates` part vers `PUT /api/ingest/:name`, `meta.json` en dernier, avec les relances
 * du §12. Un fichier de plus de 4 Mo ou une réponse en erreur arrête l'envoi avant
 * `meta.json` : le dashboard reste alors sur le run précédent.
 */
export async function pushAggregates(options: PushOptions): Promise<PushReport> {
  const { store, secret, log, fetch: fetchImpl = fetch, clock = systemClock } = options;
  const started = clock.now();
  const base = options.siteUrl.replace(/\/+$/, '');
  const names = pushOrder((await store.list('')).filter(isAggregateFile));
  if (!names.includes('meta.json')) throw new Error('aucun meta.json dans le store aggregates : traitement à faire');

  const files: PushReport['files'] = [];
  for (const name of names) {
    const data = await store.get(name);
    if (data === null) throw new Error(`${name} a disparu du store pendant l'envoi`);
    if (data.byteLength > MAX_AGGREGATE_BYTES) {
      throw new Error(`${name} dépasse ${MAX_AGGREGATE_BYTES} octets (${data.byteLength}) : envoi arrêté`);
    }
    const response = await withRetry(
      () =>
        fetchImpl(`${base}/api/ingest/${name}`, {
          method: 'PUT',
          headers: { authorization: `Bearer ${secret}`, 'content-type': 'application/json' },
          body: data,
        }),
      {
        clock,
        delaysMs: options.delaysMs,
        onRetry: (info) => log('push.retry', { name, ...info }),
      },
    );
    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      throw new Error(`envoi de ${name} refusé : HTTP ${response.status} ${detail}`.trim());
    }
    await response.body?.cancel();
    files.push({ name, bytes: data.byteLength });
    log('push.sent', { name, bytes: data.byteLength });
  }
  return { files, durationMs: clock.now() - started };
}
