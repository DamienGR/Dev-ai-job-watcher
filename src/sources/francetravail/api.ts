import { HttpError, RateLimiter, systemClock, withRetry, type Clock } from '../http';

// API France Travail « Offres d'emploi v2 » (SPEC.md §4.1).
export const FT_TOKEN_URL =
  'https://entreprise.francetravail.fr/connexion/oauth2/access_token?realm=%2Fpartenaire';
export const FT_SEARCH_URL = 'https://api.francetravail.io/partenaire/offresdemploi/v2/offres/search';
export const FT_SCOPE = 'api_offresdemploiv2 o2dsoffre';
/** Résultats maximum par page (paramètre `range`). */
export const FT_PAGE_SIZE = 150;
/** 10 appels/s autorisés, bridés à 8 (SPEC.md §4.1). */
export const FT_CALLS_PER_SECOND = 8;

/** Offre telle que renvoyée par l'API (champs à confirmer au lot 1, SPEC.md §4.1). */
export type FtOffer = Record<string, unknown>;

export interface FtPage {
  /** Total d'offres de la requête (en-tête `Content-Range`), 0 si HTTP 204. */
  total: number;
  offers: FtOffer[];
}

export interface FtApi {
  readonly stats: { calls: number; retries: number };
  /** Vérifie l'accès (jeton) avant la collecte, pour échouer tôt si les identifiants sont refusés. */
  preflight(): Promise<void>;
  /** Une page de résultats ; `range` : indices du premier et du dernier résultat, inclus. */
  search(params: Record<string, string>, range: readonly [number, number]): Promise<FtPage>;
}

/** `offres 0-149/2345` → { start: 0, end: 149, total: 2345 }. */
export function parseContentRange(header: string | null): { start: number; end: number; total: number } | null {
  const match = header?.match(/(\d+)\s*-\s*(\d+)\s*\/\s*(\d+)/);
  if (!match) return null;
  return { start: Number(match[1]), end: Number(match[2]), total: Number(match[3]) };
}

export interface LiveFtApiOptions {
  clientId: string;
  clientSecret: string;
  fetch?: typeof fetch;
  clock?: Clock;
  callsPerSecond?: number;
  retryDelaysMs?: readonly number[];
}

/** Client de l'API réelle : jeton OAuth en cache, débit bridé, retry (SPEC.md §4.1, §12). */
export class LiveFtApi implements FtApi {
  readonly stats = { calls: 0, retries: 0 };
  private token: { value: string; expiresAt: number } | null = null;
  private pendingToken: Promise<string> | null = null;
  private readonly fetchImpl: typeof fetch;
  private readonly clock: Clock;
  private readonly limiter: RateLimiter;

  constructor(private readonly options: LiveFtApiOptions) {
    this.fetchImpl = options.fetch ?? fetch;
    this.clock = options.clock ?? systemClock;
    this.limiter = new RateLimiter(options.callsPerSecond ?? FT_CALLS_PER_SECOND, this.clock);
  }

  async preflight(): Promise<void> {
    await this.getToken();
  }

  async search(params: Record<string, string>, [first, last]: readonly [number, number]): Promise<FtPage> {
    const url = new URL(FT_SEARCH_URL);
    for (const [name, value] of Object.entries(params)) url.searchParams.set(name, value);
    url.searchParams.set('range', `${first}-${last}`);

    let response = await this.get(url);
    if (response.status === 401) {
      await response.body?.cancel();
      this.token = null;
      response = await this.get(url);
    }

    if (response.status === 204) return { total: 0, offers: [] };
    if (response.status === 200 || response.status === 206) {
      const body = (await response.json()) as { resultats?: FtOffer[] };
      const offers = body.resultats ?? [];
      const total = parseContentRange(response.headers.get('content-range'))?.total ?? first + offers.length;
      return { total, offers };
    }
    const detail = (await response.text().catch(() => '')).slice(0, 300);
    throw new HttpError(`recherche France Travail : HTTP ${response.status} ${detail}`.trim(), response.status);
  }

  private async get(url: URL): Promise<Response> {
    const token = await this.getToken();
    return withRetry(
      async () => {
        await this.limiter.acquire();
        this.stats.calls += 1;
        return this.fetchImpl(url, { headers: { authorization: `Bearer ${token}`, accept: 'application/json' } });
      },
      { clock: this.clock, delaysMs: this.options.retryDelaysMs, onRetry: () => (this.stats.retries += 1) },
    );
  }

  private getToken(): Promise<string> {
    if (this.token && this.clock.now() < this.token.expiresAt) return Promise.resolve(this.token.value);
    this.pendingToken ??= this.requestToken().finally(() => (this.pendingToken = null));
    return this.pendingToken;
  }

  private async requestToken(): Promise<string> {
    const response = await withRetry(
      () =>
        this.fetchImpl(FT_TOKEN_URL, {
          method: 'POST',
          headers: { 'content-type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            grant_type: 'client_credentials',
            client_id: this.options.clientId,
            client_secret: this.options.clientSecret,
            scope: FT_SCOPE,
          }),
        }),
      { clock: this.clock, delaysMs: this.options.retryDelaysMs, onRetry: () => (this.stats.retries += 1) },
    );
    // Le corps n'est pas repris dans l'erreur : il pourrait contenir des éléments d'identification.
    if (!response.ok) throw new HttpError(`jeton France Travail refusé : HTTP ${response.status}`, response.status);
    const body = (await response.json()) as { access_token?: string; expires_in?: number };
    if (!body.access_token) throw new Error('jeton France Travail absent de la réponse');
    // Marge d'une minute avant l'expiration annoncée.
    const ttlMs = Math.max((body.expires_in ?? 1500) - 60, 30) * 1000;
    this.token = { value: body.access_token, expiresAt: this.clock.now() + ttlMs };
    return body.access_token;
  }
}
