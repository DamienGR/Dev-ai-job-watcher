import { describe, expect, it } from 'vitest';
import { FT_SCOPE, FT_SEARCH_URL, FT_TOKEN_URL, LiveFtApi, parseContentRange } from '../../src/sources/francetravail/api';
import { HttpError } from '../../src/sources/http';
import { fakeClock } from '../helpers';

type Handler = (url: string, init: RequestInit) => Response;

/** `fetch` simulé : jeton OAuth, puis réponses de recherche successives. */
function fakeFetch(searchResponses: (() => Response)[], tokenTtl = 1499) {
  const requests: { url: string; init: RequestInit }[] = [];
  let tokens = 0;
  const handler: Handler = (url) => {
    if (url.startsWith(FT_TOKEN_URL)) {
      tokens += 1;
      return Response.json({ access_token: `jeton-${tokens}`, expires_in: tokenTtl, token_type: 'Bearer' });
    }
    const next = searchResponses.shift();
    if (!next) throw new Error('requête inattendue');
    return next();
  };
  const fetchImpl = (async (input: string | URL | Request, init: RequestInit = {}) => {
    const url = String(input);
    requests.push({ url, init });
    return handler(url, init);
  }) as typeof fetch;
  return { fetchImpl, requests, tokenCount: () => tokens };
}

const page = (ids: string[], range = '0-149/2', status = 206) =>
  new Response(JSON.stringify({ resultats: ids.map((id) => ({ id })) }), {
    status,
    headers: { 'content-range': `offres ${range}` },
  });

function api(fetchImpl: typeof fetch, clock = fakeClock(1_000_000)) {
  return { clock, ft: new LiveFtApi({ clientId: 'id', clientSecret: 'secret', fetch: fetchImpl, clock }) };
}

describe('client France Travail (SPEC.md §4.1)', () => {
  it('lit le total dans Content-Range', () => {
    expect(parseContentRange('offres 0-149/2345')).toEqual({ start: 0, end: 149, total: 2345 });
    expect(parseContentRange(null)).toBeNull();
  });

  it('obtient un jeton client_credentials et le réutilise', async () => {
    const { fetchImpl, requests, tokenCount } = fakeFetch([() => page(['1', '2']), () => page(['3'])]);
    const { ft } = api(fetchImpl);

    expect(await ft.search({ codeROME: 'M1805', departement: '31' }, [0, 149])).toEqual({
      total: 2,
      offers: [{ id: '1' }, { id: '2' }],
    });
    await ft.search({ codeROME: 'M1805' }, [0, 149]);

    expect(tokenCount()).toBe(1);
    const tokenBody = new URLSearchParams(String(requests[0]!.init.body));
    expect(Object.fromEntries(tokenBody)).toEqual({
      grant_type: 'client_credentials',
      client_id: 'id',
      client_secret: 'secret',
      scope: FT_SCOPE,
    });
    const search = new URL(requests[1]!.url);
    expect(search.origin + search.pathname).toBe(FT_SEARCH_URL);
    expect(Object.fromEntries(search.searchParams)).toEqual({ codeROME: 'M1805', departement: '31', range: '0-149' });
    expect(new Headers(requests[1]!.init.headers).get('authorization')).toBe('Bearer jeton-1');
  });

  it("renouvelle le jeton à l'expiration et après un 401", async () => {
    const { fetchImpl, tokenCount } = fakeFetch(
      [() => page(['1']), () => page(['2']), () => new Response(null, { status: 401 }), () => page(['3'])],
      120,
    );
    const { ft, clock } = api(fetchImpl);

    await ft.search({}, [0, 149]);
    clock.time += 61_000; // jeton de 120 s, renouvelé une minute avant l'expiration
    await ft.search({}, [0, 149]);
    expect(tokenCount()).toBe(2);
    await ft.search({}, [0, 149]);
    expect(tokenCount()).toBe(3);
  });

  it("partage la demande de jeton entre requêtes simultanées", async () => {
    const { fetchImpl, tokenCount } = fakeFetch([() => page(['1']), () => page(['2'])]);
    const { ft } = api(fetchImpl);
    await Promise.all([ft.search({}, [0, 149]), ft.search({}, [0, 149])]);
    expect(tokenCount()).toBe(1);
  });

  it('traduit 204 en résultat vide et lève une HttpError sur 400, sans nouvel essai', async () => {
    const { fetchImpl, requests } = fakeFetch([
      () => new Response(null, { status: 204 }),
      () => new Response('{"message":"range invalide"}', { status: 400 }),
    ]);
    const { ft } = api(fetchImpl);

    expect(await ft.search({}, [0, 149])).toEqual({ total: 0, offers: [] });
    const error = await ft.search({}, [3000, 3149]).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(HttpError);
    expect((error as HttpError).status).toBe(400);
    expect((error as HttpError).message).toContain('range invalide');
    expect(requests.filter((r) => !r.url.startsWith(FT_TOKEN_URL))).toHaveLength(2);
  });

  it('rejoue les 429 et 5xx avec backoff et respecte Retry-After', async () => {
    const { fetchImpl } = fakeFetch([
      () => new Response(null, { status: 503 }),
      () => new Response(null, { status: 429, headers: { 'retry-after': '5' } }),
      () => page(['1']),
    ]);
    const { ft, clock } = api(fetchImpl);

    expect((await ft.search({}, [0, 149])).offers).toEqual([{ id: '1' }]);
    expect(ft.stats).toEqual({ calls: 3, retries: 2 });
    expect(clock.sleeps.filter((ms) => ms >= 1000)).toEqual([1000, 5000]);
  });

  it('bride le débit à 8 appels par seconde', async () => {
    const { fetchImpl } = fakeFetch(Array.from({ length: 9 }, (_, i) => () => page([String(i)])));
    const { ft, clock } = api(fetchImpl);
    const start = clock.time;
    for (let i = 0; i < 9; i++) await ft.search({}, [0, 149]);
    expect(clock.time - start).toBe(1000);
  });

  it('ne reprend pas le corps de la réponse dans l’erreur de jeton', async () => {
    const fetchImpl = (async () => new Response('client_id=id invalide', { status: 401 })) as typeof fetch;
    const { ft } = api(fetchImpl);
    await expect(ft.preflight()).rejects.toThrow('jeton France Travail refusé : HTTP 401');
    await expect(ft.preflight()).rejects.not.toThrow('client_id');
  });
});
