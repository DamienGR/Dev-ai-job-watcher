import { isAggregateFile, MAX_AGGREGATE_BYTES } from '../pipeline/aggregateFiles';
import { env } from '../pipeline/env';
import { jsonLogger, type Logger } from '../pipeline/log';
import { NetlifyBlobStore } from '../storage/netlify';
import type { BlobStore } from '../storage/store';
import { fileNameAfter, hasBearer } from './http';

export const INGEST_PREFIX = '/api/ingest/';

export interface IngestDeps {
  /** Store `aggregates` ; Netlify Blobs par défaut, ouvert à la requête. */
  store?: () => BlobStore;
  log?: Logger;
}

/**
 * `PUT /api/ingest/:name` (SPEC.md §3.3) : reçoit un fichier d'agrégats du VPS et l'écrit tel
 * quel dans le store Blobs `aggregates`. En-tête `Authorization: Bearer <INGEST_SECRET>` ;
 * `name` limité aux fichiers du §3.4 ; corps JSON de moins de 4 Mo.
 */
export function createIngestHandler(deps: IngestDeps = {}) {
  const log = deps.log ?? jsonLogger;
  const openStore = deps.store ?? (() => new NetlifyBlobStore('aggregates'));
  return async (req: Request): Promise<Response> => {
    if (req.method !== 'PUT') return Response.json({ error: 'méthode non autorisée' }, { status: 405 });
    if (!hasBearer(req, env('INGEST_SECRET'))) {
      log('ingest.unauthorized', {});
      return Response.json({ error: 'non autorisé' }, { status: 401 });
    }

    const name = fileNameAfter(req, INGEST_PREFIX);
    if (!name || !isAggregateFile(name)) {
      return Response.json({ error: `fichier d'agrégats inconnu : ${name ?? ''}` }, { status: 404 });
    }
    const declared = Number(req.headers.get('content-length') ?? 0);
    if (declared > MAX_AGGREGATE_BYTES) return tooLarge(name, declared);

    const body = new Uint8Array(await req.arrayBuffer());
    if (body.byteLength > MAX_AGGREGATE_BYTES) return tooLarge(name, body.byteLength);
    try {
      const parsed: unknown = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(body));
      if (parsed === null || typeof parsed !== 'object') throw new Error('objet JSON attendu');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return Response.json({ error: `JSON invalide : ${message}` }, { status: 400 });
    }

    await openStore().set(name, body);
    log('ingest.stored', { name, bytes: body.byteLength });
    return Response.json({ stored: name, bytes: body.byteLength });
  };
}

function tooLarge(name: string, bytes: number): Response {
  return Response.json(
    { error: `${name} dépasse ${MAX_AGGREGATE_BYTES} octets (${bytes})` },
    { status: 413 },
  );
}
