import { describe, expect, it } from 'vitest';
import { getGzipJson, setGzipJson } from '../../src/storage/store';
import { MemoryStore } from '../../src/storage/memory';
import { applyRun, emptySeenIndex, loadSeenIndexFor, SEEN_KEY, seenSnapshotKey, type SeenIndex } from '../../src/pipeline/seenIndex';
import { makeOffer } from '../helpers';

const options = { closeMissing: true, closeSource: 'francetravail' as const };

describe('index seen : nouveauté, disparition, premier run (SPEC.md §6.9)', () => {
  it('premier run : tout est nouveau, rattrapage pour les offres créées avant', () => {
    const offers = [
      makeOffer({ sourceId: 'A', createdAt: '2026-09-30T08:00:00.000Z' }), // semaine du run
      makeOffer({ sourceId: 'B', createdAt: '2026-09-10T08:00:00.000Z' }), // semaine antérieure
    ];
    const { index, newOffers, closed } = applyRun(emptySeenIndex(), '2026-W40', offers, options);
    expect([newOffers, closed]).toEqual([2, 0]);
    expect(index).toMatchObject({ firstRun: '2026-W40', lastRun: '2026-W40' });
    expect(index.entries['francetravail:B']).toEqual({
      source: 'francetravail',
      firstSeenRun: '2026-W40',
      lastSeenRun: '2026-W40',
      createdAt: '2026-09-10T08:00:00.000Z',
      closedRun: null,
    });
    expect(offers.map((o) => o.isBackfill)).toEqual([false, true]);
  });

  it('runs suivants : garde la première semaine vue, ferme les absentes, rouvre les revues', () => {
    const first = applyRun(emptySeenIndex(), '2026-W40', [makeOffer({ sourceId: 'A' }), makeOffer({ sourceId: 'B' })], options);
    const secondOffers = [makeOffer({ sourceId: 'A' }), makeOffer({ sourceId: 'C', createdAt: '2026-10-01T08:00:00.000Z' })];
    const second = applyRun(first.index, '2026-W41', secondOffers, options);
    expect([second.newOffers, second.closed, second.reopened]).toEqual([1, 1, 0]);
    expect(second.index.entries['francetravail:A']).toMatchObject({ firstSeenRun: '2026-W40', lastSeenRun: '2026-W41' });
    expect(second.index.entries['francetravail:B']).toMatchObject({ lastSeenRun: '2026-W40', closedRun: '2026-W41' });
    // C, créée avant le run W41 mais découverte après le premier run : pas de rattrapage.
    expect(secondOffers.map((o) => [o.firstSeenRun, o.isBackfill])).toEqual([
      ['2026-W40', false],
      ['2026-W41', false],
    ]);

    const third = applyRun(second.index, '2026-W42', [makeOffer({ sourceId: 'B' })], options);
    expect([third.newOffers, third.closed, third.reopened]).toEqual([0, 2, 1]);
    expect(third.index.entries['francetravail:B']).toMatchObject({ firstSeenRun: '2026-W40', closedRun: null });
    // Une offre déjà fermée ne l'est pas une seconde fois.
    expect(applyRun(third.index, '2026-W43', [makeOffer({ sourceId: 'B' })], options).closed).toBe(0);
  });

  it('ne ferme rien quand la collecte est incomplète', () => {
    const first = applyRun(emptySeenIndex(), '2026-W40', [makeOffer({ sourceId: 'A' })], options);
    const second = applyRun(first.index, '2026-W41', [], { ...options, closeMissing: false });
    expect(second.closed).toBe(0);
    expect(second.index.entries['francetravail:A']?.closedRun).toBeNull();
  });

  it('repart de la copie prise avant le premier traitement d’un run, refuse un run plus ancien', async () => {
    const store = new MemoryStore();
    const before = await loadSeenIndexFor(store, '2026-W40');
    expect(before).toEqual(emptySeenIndex());

    const after = applyRun(before, '2026-W40', [makeOffer({ sourceId: 'A' })], options).index;
    await setGzipJson(store, SEEN_KEY, after);
    // Relance du même run : l'index de départ est la copie, pas l'index déjà mis à jour.
    expect(await loadSeenIndexFor(store, '2026-W40')).toEqual(emptySeenIndex());
    // Run suivant : part de l'index courant et le copie.
    expect(await loadSeenIndexFor(store, '2026-W41')).toEqual(after);
    expect(await getGzipJson<SeenIndex>(store, seenSnapshotKey('2026-W41'))).toEqual(after);

    await setGzipJson(store, SEEN_KEY, { ...after, lastRun: '2026-W41' });
    await expect(loadSeenIndexFor(store, '2026-W40')).rejects.toThrow(/plus ancien/);
  });
});
