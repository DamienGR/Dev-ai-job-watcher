import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import adminFunction, { config as adminConfig } from '../netlify/functions/api-admin.mts';
import collectFunction from '../netlify/functions/collect-francetravail-background.mts';
import { createAdminRunHandler } from '../src/functions/adminRun';
import { createCollectFranceTravailHandler } from '../src/functions/collectFranceTravail';
import { callBackgroundFunction, INTERNAL_SECRET_HEADER, safeEqual } from '../src/pipeline/internal';
import { silentLogger } from '../src/pipeline/log';
import { createFtApi } from '../src/sources/francetravail';
import type { CollectReport } from '../src/sources/source';
import { memoryStores } from '../src/storage/memory';

beforeEach(() => {
  vi.stubEnv('ADMIN_TOKEN', 'jeton-admin');
  vi.stubEnv('INTERNAL_SECRET', 'secret-interne');
  vi.stubEnv('URL', 'https://veille.example.netlify.app');
});
afterEach(() => vi.unstubAllEnvs());

const site = { site: { url: 'https://veille.example.netlify.app' } };

function adminRequest(body: unknown, token: string | null = 'jeton-admin', method = 'POST') {
  return new Request('https://veille.example.netlify.app/api/admin/run', {
    method,
    headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: method === 'POST' ? JSON.stringify(body) : undefined,
  });
}

describe('api-admin : POST /api/admin/run (SPEC.md §3.3)', () => {
  it('est routée sur /api/admin/run en POST', () => {
    expect(adminConfig).toEqual({ path: '/api/admin/run', method: 'POST' });
    expect(typeof adminFunction).toBe('function');
    expect(typeof collectFunction).toBe('function');
  });

  it('refuse une requête sans le bon jeton', async () => {
    const callBackground = vi.fn();
    const handler = createAdminRunHandler({ callBackground, log: silentLogger });
    expect((await handler(adminRequest({ step: 'collect-ft', runId: '2026-W41' }, null), site)).status).toBe(401);
    expect((await handler(adminRequest({ step: 'collect-ft', runId: '2026-W41' }, 'faux'), site)).status).toBe(401);
    expect(callBackground).not.toHaveBeenCalled();
  });

  it('valide la méthode, l’étape et le runId', async () => {
    const handler = createAdminRunHandler({ callBackground: vi.fn(), log: silentLogger });
    expect((await handler(adminRequest(null, 'jeton-admin', 'GET'), site)).status).toBe(405);
    expect((await handler(adminRequest({ step: 'collect-ft', runId: '2026-41' }), site)).status).toBe(400);
    expect((await handler(adminRequest({ step: 'inconnue', runId: '2026-W41' }), site)).status).toBe(400);
    const later = await handler(adminRequest({ step: 'process', runId: '2026-W41' }), site);
    expect(later.status).toBe(501);
    expect(await later.json()).toEqual({ error: "l'étape « process » arrive au lot 2" });
  });

  it('déclenche la fonction background avec le secret interne', async () => {
    const callBackground = vi.fn(async () => {});
    const handler = createAdminRunHandler({ callBackground, log: silentLogger });
    const response = await handler(adminRequest({ step: 'collect-ft', runId: '2026-W41', reset: true }), site);

    expect(response.status).toBe(202);
    expect(callBackground).toHaveBeenCalledWith(
      'collect-francetravail-background',
      { runId: '2026-W41', reset: true },
      { siteUrl: 'https://veille.example.netlify.app', secret: 'secret-interne' },
    );
  });

  it('signale un déclenchement refusé par la fonction background', async () => {
    const callBackground = vi.fn(async () => {
      throw new Error('appel de collect-francetravail-background refusé : HTTP 404');
    });
    const handler = createAdminRunHandler({ callBackground, log: silentLogger });
    const response = await handler(adminRequest({ step: 'collect-ft', runId: '2026-W41' }), site);
    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({
      error: 'déclenchement impossible : appel de collect-francetravail-background refusé : HTTP 404',
    });
  });

  it('signale une configuration incomplète', async () => {
    vi.stubEnv('INTERNAL_SECRET', '');
    const handler = createAdminRunHandler({ callBackground: vi.fn(), log: silentLogger });
    expect((await handler(adminRequest({ step: 'collect-ft', runId: '2026-W41' }), site)).status).toBe(500);
  });
});

describe('collect-francetravail-background', () => {
  const backgroundRequest = (body: unknown, secret: string | null = 'secret-interne') =>
    new Request('https://veille.example.netlify.app/.netlify/functions/collect-francetravail-background', {
      method: 'POST',
      headers: secret ? { [INTERNAL_SECRET_HEADER]: secret } : {},
      body: JSON.stringify(body),
    });

  it('refuse un appel sans le secret interne ou mal formé', async () => {
    const handler = createCollectFranceTravailHandler({ stores: memoryStores, log: silentLogger });
    expect((await handler(backgroundRequest({ runId: '2026-W41' }, null))).status).toBe(401);
    expect((await handler(backgroundRequest({ runId: '2026-W41' }, 'autre'))).status).toBe(401);
    expect((await handler(backgroundRequest({ runId: 'demain' }))).status).toBe(400);
  });

  it('collecte le run en mode fixtures', async () => {
    const stores = memoryStores();
    const handler = createCollectFranceTravailHandler({
      stores: () => stores,
      createApi: () => createFtApi('fixtures'),
      log: silentLogger,
    });
    const response = await handler(backgroundRequest({ runId: '2026-W41' }));
    const report = (await response.json()) as CollectReport;

    expect(response.status).toBe(200);
    expect(report).toMatchObject({ status: 'complete', offersByPass: { A: 6, B: 3 } });
    expect(await stores.raw.list('ft/2026-W41/a-d31')).toEqual(['ft/2026-W41/a-d31.json.gz']);
  });

  it('relance l’erreur pour que Netlify retente l’exécution', async () => {
    const handler = createCollectFranceTravailHandler({
      stores: memoryStores,
      createApi: async () => {
        throw new Error('variable d’environnement manquante : FT_CLIENT_ID');
      },
      log: silentLogger,
    });
    await expect(handler(backgroundRequest({ runId: '2026-W41' }))).rejects.toThrow('FT_CLIENT_ID');
  });
});

describe('appels internes', () => {
  it('compare les secrets à temps constant, quelle que soit leur longueur', () => {
    expect(safeEqual('secret-interne', 'secret-interne')).toBe(true);
    expect(safeEqual('secret', 'secret-interne')).toBe(false);
    expect(safeEqual('', '')).toBe(false);
    expect(safeEqual(null, 'secret-interne')).toBe(false);
    expect(safeEqual('secret-interne', undefined)).toBe(false);
  });

  it('appelle la fonction background avec le secret et attend un 202', async () => {
    const fetchImpl = vi.fn(async () => new Response(null, { status: 202 }));
    await callBackgroundFunction('collect-francetravail-background', { runId: '2026-W41' }, {
      siteUrl: 'https://veille.example.netlify.app/',
      secret: 'secret-interne',
      fetch: fetchImpl as unknown as typeof fetch,
    });
    expect(fetchImpl).toHaveBeenCalledWith(
      'https://veille.example.netlify.app/.netlify/functions/collect-francetravail-background',
      expect.objectContaining({
        method: 'POST',
        headers: { 'content-type': 'application/json', [INTERNAL_SECRET_HEADER]: 'secret-interne' },
        body: '{"runId":"2026-W41"}',
      }),
    );

    const refused = vi.fn(async () => new Response(null, { status: 404 })) as unknown as typeof fetch;
    await expect(
      callBackgroundFunction('inconnue', {}, { siteUrl: 'https://x.netlify.app', secret: 's', fetch: refused }),
    ).rejects.toThrow('HTTP 404');
  });
});
