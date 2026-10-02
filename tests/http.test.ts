import { describe, expect, it } from 'vitest';
import { RateLimiter, retryAfterMs, withRetry } from '../src/sources/http';
import { fakeClock } from './helpers';

describe('limiteur de débit', () => {
  it('ne démarre jamais plus de 8 appels dans la même seconde', async () => {
    const clock = fakeClock(0);
    const limiter = new RateLimiter(8, clock);
    const starts: number[] = [];
    for (let i = 0; i < 17; i++) {
      await limiter.acquire();
      starts.push(clock.now());
    }
    for (const start of starts) {
      expect(starts.filter((t) => t >= start && t < start + 1000).length).toBeLessThanOrEqual(8);
    }
    expect(starts.at(-1)).toBe(2000);
  });
});

describe('nouvelles tentatives (SPEC.md §12)', () => {
  const sequence = (...steps: (number | Error)[]) => {
    let calls = 0;
    const request = async () => {
      const step = steps[Math.min(calls++, steps.length - 1)]!;
      if (step instanceof Error) throw step;
      return new Response(null, { status: step });
    };
    return { request, calls: () => calls };
  };

  it('rejoue 429 et 5xx avec un backoff 1, 2, 4, 8, 16 s puis rend la dernière réponse', async () => {
    const clock = fakeClock();
    const { request, calls } = sequence(500);
    const response = await withRetry(request, { clock });
    expect(response.status).toBe(500);
    expect(calls()).toBe(6);
    expect(clock.sleeps).toEqual([1000, 2000, 4000, 8000, 16000]);
  });

  it('s’arrête au premier succès', async () => {
    const clock = fakeClock();
    const { request, calls } = sequence(503, 429, 200);
    expect((await withRetry(request, { clock })).status).toBe(200);
    expect(calls()).toBe(3);
    expect(clock.sleeps).toEqual([1000, 2000]);
  });

  it('ne rejoue pas une erreur client (400)', async () => {
    const { request, calls } = sequence(400);
    expect((await withRetry(request, { clock: fakeClock() })).status).toBe(400);
    expect(calls()).toBe(1);
  });

  it('rejoue les erreurs réseau puis relance la dernière', async () => {
    const clock = fakeClock();
    const flaky = sequence(new Error('ECONNRESET'), 200);
    expect((await withRetry(flaky.request, { clock })).status).toBe(200);

    const down = sequence(new Error('ECONNREFUSED'));
    await expect(withRetry(down.request, { clock: fakeClock() })).rejects.toThrow('ECONNREFUSED');
    expect(down.calls()).toBe(6);
  });

  it('respecte Retry-After, plafonné à 60 s', () => {
    expect(retryAfterMs('5', 0)).toBe(5000);
    expect(retryAfterMs('3600', 0)).toBe(60_000);
    expect(retryAfterMs(new Date(30_000).toUTCString(), 0)).toBe(30_000);
    expect(retryAfterMs('n’importe quoi', 0)).toBeNull();
    expect(retryAfterMs(null, 0)).toBeNull();
  });
});
