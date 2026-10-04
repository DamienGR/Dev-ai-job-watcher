import { gunzipSync } from 'node:zlib';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import dataFunction, { config as dataConfig } from '../netlify/functions/api-data.mts';
import ingestFunction, { config as ingestConfig } from '../netlify/functions/api-ingest.mts';
import { createDataHandler } from '../src/functions/data';
import { createIngestHandler } from '../src/functions/ingest';
import { isAggregateFile, MAX_AGGREGATE_BYTES, pushOrder } from '../src/pipeline/aggregateFiles';
import { silentLogger } from '../src/pipeline/log';
import { pushAggregates } from '../src/pipeline/push';
import type { Clock } from '../src/sources/http';
import { MemoryStore } from '../src/storage/memory';

const SITE = 'https://veille.example.netlify.app';
const clock: Clock = { now: () => 0, sleep: async () => {} };
const bytes = (value: unknown) => Buffer.from(JSON.stringify(value), 'utf8');

beforeEach(() => vi.stubEnv('INGEST_SECRET', 'secret-envoi'));
afterEach(() => vi.unstubAllEnvs());

describe('fichiers d’agrégats (SPEC.md §3.4)', () => {
  it('accepte les fichiers du §3.4 et la revue mensuelle, rien d’autre', () => {
    for (const name of ['meta.json', 'timeseries.json', 'adzuna-stats.json', 'review/2026-10.json']) {
      expect(isAggregateFile(name)).toBe(true);
    }
    for (const name of ['', 'raw.json', '../meta.json', 'review/2026-13.json', 'review/2026-10.json/x', 'META.json']) {
      expect(isAggregateFile(name)).toBe(false);
    }
  });

  it('envoie meta.json en dernier', () => {
    expect(pushOrder(['meta.json', 'titles.json', 'review/2026-10.json', 'conditions.json'])).toEqual([
      'conditions.json', 'review/2026-10.json', 'titles.json', 'meta.json',
    ]);
  });
});

function ingestRequest(name: string, body: string | Uint8Array | null, token: string | null = 'secret-envoi', method = 'PUT') {
  return new Request(`${SITE}/api/ingest/${name}`, {
    method,
    headers: token ? { authorization: `Bearer ${token}` } : {},
    body,
  });
}

describe('api-ingest : PUT /api/ingest/:name (SPEC.md §3.3)', () => {
  it('est routée sur /api/ingest/* en PUT', () => {
    expect(ingestConfig).toEqual({ path: '/api/ingest/*', method: 'PUT' });
    expect(typeof ingestFunction).toBe('function');
  });

  it('refuse une requête sans le bon secret, ou sans secret configuré', async () => {
    const store = new MemoryStore();
    const handler = createIngestHandler({ store: () => store, log: silentLogger });
    expect((await handler(ingestRequest('meta.json', '{}', null))).status).toBe(401);
    expect((await handler(ingestRequest('meta.json', '{}', 'faux'))).status).toBe(401);
    vi.stubEnv('INGEST_SECRET', '');
    expect((await handler(ingestRequest('meta.json', '{}', ''))).status).toBe(401);
    expect(store.data.size).toBe(0);
  });

  it('valide la méthode, le nom, la taille et le JSON', async () => {
    const store = new MemoryStore();
    const handler = createIngestHandler({ store: () => store, log: silentLogger });
    expect((await handler(ingestRequest('meta.json', null, 'secret-envoi', 'POST'))).status).toBe(405);
    expect((await handler(ingestRequest('offers.json', '{}'))).status).toBe(404);
    expect((await handler(ingestRequest('..%2Fstate%2Fx.json', '{}'))).status).toBe(404);
    expect((await handler(ingestRequest('meta.json', 'pas du json'))).status).toBe(400);
    expect((await handler(ingestRequest('meta.json', '42'))).status).toBe(400);
    const big = new Uint8Array(MAX_AGGREGATE_BYTES + 1).fill(0x20);
    expect((await handler(ingestRequest('salaries.json', big))).status).toBe(413);
    expect(store.data.size).toBe(0);
  });

  it('écrit le fichier tel quel dans le store aggregates', async () => {
    const store = new MemoryStore();
    const handler = createIngestHandler({ store: () => store, log: silentLogger });
    const response = await handler(ingestRequest('review/2026-10.json', '{"month":"2026-10"}'));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ stored: 'review/2026-10.json', bytes: 19 });
    expect(Buffer.from(store.data.get('review/2026-10.json')!).toString()).toBe('{"month":"2026-10"}');
  });
});

describe('api-data : GET /api/data/:name (SPEC.md §3.3)', () => {
  const store = new MemoryStore();
  beforeEach(async () => {
    await store.set('meta.json', bytes({ generatedAt: '2026-10-05T07:01:00.000Z' }));
    await store.set('timeseries.json', bytes({ newOffers: { columns: ['week', 'n'], rows: [['2026-W40', 3]] } }));
  });
  const handler = createDataHandler({ store: () => store });
  const get = (name: string, headers: Record<string, string> = {}, method = 'GET') =>
    handler(new Request(`${SITE}/api/data/${name}`, { method, headers }));

  it('est routée sur /api/data/* en lecture', () => {
    expect(dataConfig).toEqual({ path: '/api/data/*', method: 'GET' });
    expect(typeof dataFunction).toBe('function');
  });

  it('sert un fichier compressé si le client accepte gzip', async () => {
    const response = await get('timeseries.json?v=2026-10-05', { 'accept-encoding': 'gzip, br' });
    expect(response.status).toBe(200);
    expect(response.headers.get('content-encoding')).toBe('gzip');
    expect(response.headers.get('cache-control')).toBe('public, max-age=3600');
    expect(response.headers.get('vary')).toBe('Accept-Encoding');
    const body = JSON.parse(gunzipSync(Buffer.from(await response.arrayBuffer())).toString());
    expect(body.newOffers.rows).toEqual([['2026-W40', 3]]);
  });

  it('sert meta.json sans cache, en clair si le client ne compresse pas', async () => {
    const response = await get('meta.json');
    expect(response.headers.get('content-encoding')).toBeNull();
    expect(response.headers.get('cache-control')).toBe('no-cache');
    expect(await response.json()).toEqual({ generatedAt: '2026-10-05T07:01:00.000Z' });
  });

  it('répond 404 pour un fichier inconnu ou pas encore envoyé, 405 en écriture', async () => {
    expect((await get('state.json')).status).toBe(404);
    expect((await get('salaries.json')).status).toBe(404);
    expect((await get('meta.json', {}, 'DELETE')).status).toBe(405);
  });
});

describe('push : envoi des agrégats (SPEC.md §3.3)', () => {
  async function filledStore() {
    const store = new MemoryStore();
    await store.set('meta.json', bytes({ generatedAt: 'x' }));
    await store.set('salaries.json', bytes({ salaries: {} }));
    await store.set('timeseries.json', bytes({ newOffers: {} }));
    await store.set('notes.txt', bytes('ignoré'));
    return store;
  }

  it('envoie chaque fichier avec le secret, meta.json en dernier, et ignore le reste', async () => {
    const calls: { url: string; init: RequestInit }[] = [];
    const fetchImpl = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      calls.push({ url: String(url), init: init! });
      return Response.json({ stored: true });
    }) as unknown as typeof fetch;
    const report = await pushAggregates({
      store: await filledStore(), siteUrl: `${SITE}/`, secret: 'secret-envoi', log: silentLogger, fetch: fetchImpl, clock,
    });
    expect(calls.map((c) => c.url)).toEqual([
      `${SITE}/api/ingest/salaries.json`, `${SITE}/api/ingest/timeseries.json`, `${SITE}/api/ingest/meta.json`,
    ]);
    expect(calls.every((c) => c.init.method === 'PUT' && (c.init.headers as Record<string, string>).authorization === 'Bearer secret-envoi')).toBe(true);
    expect(report.files.map((f) => f.name)).toEqual(['salaries.json', 'timeseries.json', 'meta.json']);
  });

  it('relance sur 5xx puis s’arrête avant meta.json sur un refus', async () => {
    const statuses = [503, 200, 401];
    const sent: string[] = [];
    const fetchImpl = (async (url: string | URL | Request) => {
      sent.push(String(url).split('/').pop()!);
      return new Response('{}', { status: statuses.shift() ?? 200 });
    }) as typeof fetch;
    await expect(
      pushAggregates({ store: await filledStore(), siteUrl: SITE, secret: 's', log: silentLogger, fetch: fetchImpl, clock }),
    ).rejects.toThrow('envoi de timeseries.json refusé : HTTP 401');
    expect(sent).toEqual(['salaries.json', 'salaries.json', 'timeseries.json']);
  });

  it('refuse un store sans meta.json ou un fichier de plus de 4 Mo', async () => {
    const fetchImpl = vi.fn() as unknown as typeof fetch;
    const empty = new MemoryStore();
    await expect(pushAggregates({ store: empty, siteUrl: SITE, secret: 's', log: silentLogger, fetch: fetchImpl, clock })).rejects.toThrow(
      'aucun meta.json',
    );
    const store = await filledStore();
    await store.set('geo-points.json', new Uint8Array(MAX_AGGREGATE_BYTES + 1));
    await expect(pushAggregates({ store, siteUrl: SITE, secret: 's', log: silentLogger, fetch: fetchImpl, clock })).rejects.toThrow(
      'geo-points.json dépasse',
    );
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
