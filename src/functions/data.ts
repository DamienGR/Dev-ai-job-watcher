import { gzipSync } from 'node:zlib';
import { isAggregateFile, META_FILE } from '../pipeline/aggregateFiles';
import { NetlifyBlobStore } from '../storage/netlify';
import type { BlobStore } from '../storage/store';
import { fileNameAfter } from './http';

export const DATA_PREFIX = '/api/data/';

/**
 * Cache des réponses (D33). `meta.json` n'est jamais mis en cache : c'est lui qui annonce un
 * nouveau run. Le dashboard demande les autres fichiers avec `?v=<meta.generatedAt>`, une
 * adresse propre à chaque envoi, d'où un cache d'une heure sans risque de mélanger deux runs.
 */
const CACHE_META = 'no-cache';
const CACHE_FILE = 'public, max-age=3600';

export interface DataDeps {
  /** Store `aggregates` ; Netlify Blobs par défaut, ouvert à la requête. */
  store?: () => BlobStore;
}

/** `GET /api/data/:name` (SPEC.md §3.3) : sert un fichier d'agrégats depuis Blobs, compressé. */
export function createDataHandler(deps: DataDeps = {}) {
  const openStore = deps.store ?? (() => new NetlifyBlobStore('aggregates'));
  return async (req: Request): Promise<Response> => {
    if (req.method !== 'GET') return Response.json({ error: 'méthode non autorisée' }, { status: 405 });
    const name = fileNameAfter(req, DATA_PREFIX);
    if (!name || !isAggregateFile(name)) return Response.json({ error: 'fichier inconnu' }, { status: 404 });

    const data = await openStore().get(name);
    if (data === null) {
      return Response.json({ error: `${name} n'a pas encore été envoyé` }, { status: 404, headers: { 'cache-control': 'no-cache' } });
    }

    const headers = new Headers({
      'content-type': 'application/json; charset=utf-8',
      'cache-control': name === META_FILE ? CACHE_META : CACHE_FILE,
      vary: 'Accept-Encoding',
    });
    const gzip = /\bgzip\b/.test(req.headers.get('accept-encoding') ?? '');
    const body = gzip ? gzipSync(data) : data;
    if (gzip) headers.set('content-encoding', 'gzip');
    headers.set('content-length', String(body.byteLength));
    return new Response(body, { status: 200, headers });
  };
}
