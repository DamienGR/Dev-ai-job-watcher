/** Horloge injectable, pour tester les délais sans attendre. */
export interface Clock {
  now(): number;
  sleep(ms: number): Promise<void>;
}

export const systemClock: Clock = {
  now: () => Date.now(),
  sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
};

export class HttpError extends Error {
  override name = 'HttpError';

  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

/** Espace le départ des requêtes pour ne jamais dépasser `perSecond` appels par seconde. */
export class RateLimiter {
  private nextSlot = 0;
  private readonly intervalMs: number;

  constructor(
    perSecond: number,
    private readonly clock: Clock = systemClock,
  ) {
    this.intervalMs = 1000 / perSecond;
  }

  async acquire(): Promise<void> {
    const now = this.clock.now();
    const slot = Math.max(now, this.nextSlot);
    this.nextSlot = slot + this.intervalMs;
    if (slot > now) await this.clock.sleep(slot - now);
  }
}

/** Délais entre essais (SPEC.md §12) : 1, 2, 4, 8 puis 16 s, soit 5 nouvelles tentatives. */
export const RETRY_DELAYS_MS = [1000, 2000, 4000, 8000, 16000] as const;
const MAX_RETRY_AFTER_MS = 60_000;

export function isRetryableStatus(status: number): boolean {
  return status === 429 || status >= 500;
}

/** Délai demandé par `Retry-After` (secondes ou date HTTP), plafonné à 60 s. */
export function retryAfterMs(header: string | null, now: number): number | null {
  if (!header) return null;
  const seconds = Number(header);
  const ms = Number.isFinite(seconds) ? seconds * 1000 : Date.parse(header) - now;
  return Number.isNaN(ms) ? null : Math.min(Math.max(0, ms), MAX_RETRY_AFTER_MS);
}

export interface RetryOptions {
  clock?: Clock;
  delaysMs?: readonly number[];
  onRetry?: (info: { attempt: number; delayMs: number; reason: string }) => void;
}

/**
 * Exécute `request` et le rejoue sur 429, 5xx ou erreur réseau (SPEC.md §12). Renvoie la
 * dernière réponse, éventuellement en erreur ; relance l'erreur réseau si elle persiste.
 */
export async function withRetry(
  request: () => Promise<Response>,
  { clock = systemClock, delaysMs = RETRY_DELAYS_MS, onRetry }: RetryOptions = {},
): Promise<Response> {
  for (let attempt = 0; ; attempt++) {
    let reason: string;
    let requested: number | null = null;
    try {
      const response = await request();
      if (!isRetryableStatus(response.status) || attempt >= delaysMs.length) return response;
      reason = `HTTP ${response.status}`;
      requested = retryAfterMs(response.headers.get('retry-after'), clock.now());
      await response.body?.cancel();
    } catch (error) {
      if (attempt >= delaysMs.length) throw error;
      reason = error instanceof Error ? error.message : String(error);
    }
    const delayMs = Math.max(delaysMs[attempt] ?? 0, requested ?? 0);
    onRetry?.({ attempt: attempt + 1, delayMs, reason });
    await clock.sleep(delayMs);
  }
}
