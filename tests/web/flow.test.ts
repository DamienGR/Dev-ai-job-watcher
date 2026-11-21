import { describe, expect, it } from 'vitest';
import { DEFAULT_FILTERS, scopeOf } from '../../web/src/lib/filters';
import {
  barLength,
  DOT_RADIUS,
  flowLayout,
  LANES,
  particleState,
  pointOn,
  seededRandom,
  spawnParticle,
  weekFlow,
  type Particle,
} from '../../web/src/lib/flow';
import { headline } from '../../web/src/lib/headline';
import type { NewOfferRow } from '../../web/src/lib/indicators';
import { lastWeeks } from '../../web/src/lib/periods';
import { makeMeta } from './helpers';

// Visuel animé de l'accueil (D70) : mêmes chiffres que les chiffres de tête, géométrie et
// trajectoires des points.

const meta = makeMeta({ backfillBefore: '2026-W30', firstRun: '2026-W30' });

function offers(week: string, role: string, n: number, extra: Partial<NewOfferRow> = {}): NewOfferRow {
  return { week, role, region: '11', source: 'francetravail', contract: 'cdi', aiAny: false, n, ...extra };
}

const rows: NewOfferRow[] = [
  ...lastWeeks('2026-W40', 3).flatMap((w) => [offers(w, 'dev_backend', 10), offers(w, 'ai_engineer', 3)]),
  offers('2026-W40', 'dev_frontend', 2, { region: '53', contract: 'cdd' }),
  offers('2026-W40', 'data_engineer', 4),
  offers('2026-W40', 'agentic_engineer', 5, { region: null }),
  offers('2026-W40', 'support_it', 50),
  offers('2026-W40', 'non_classe', 20),
];

describe('chiffres du visuel', () => {
  const flow = weekFlow(meta, rows);

  it('porte sur la semaine de référence des chiffres de tête', () => {
    expect(flow.week).toBe('2026-W40');
    expect(flow.partial).toBe(false);
  });

  it('range les offres en développement, data et IA', () => {
    expect(flow.categories.map((c) => [c.id, c.n])).toEqual([
      ['dev', 12],
      ['data', 4],
      ['ia', 8],
    ]);
    expect(flow.retained).toBe(24);
  });

  it('compte toutes les offres collectées, périmètre élargi et non classées comprises', () => {
    expect(flow.collected).toBe(24 + 50 + 20);
  });

  it('retombe sur « Nouvelles offres » et le numérateur de la « Part IA »', () => {
    const head = headline(meta, rows, scopeOf(meta, DEFAULT_FILTERS), []);
    expect(flow.retained).toBe(head.week.n);
    expect(flow.categories.find((c) => c.id === 'ia')!.n).toBe(head.ai.part);
    expect(flow.retained).toBe(head.ai.total);
  });

  it('signale une semaine partielle', () => {
    expect(weekFlow(makeMeta({ backfillBefore: '2026-W30', partialWeeks: ['2026-W40'] }), rows).partial).toBe(true);
  });
});

describe('géométrie', () => {
  for (const [width, height] of [
    [520, 300],
    [358, 240],
  ] as const) {
    const layout = flowLayout(width, height, 3);

    it(`tient dans ${width} × ${height}`, () => {
      expect(layout.lanes).toHaveLength(LANES);
      expect(layout.barX + layout.barMax).toBeLessThan(width);
      for (const y of layout.rows) {
        expect(y - layout.barHeight).toBeGreaterThan(0);
        expect(y + layout.barHeight).toBeLessThan(height);
      }
      expect(layout.gateTop).toBeGreaterThan(0);
      expect(layout.gateBottom).toBeLessThan(height);
    });

    it(`relie couloirs, filtre et barres (${width} px)`, () => {
      for (const lane of layout.lanes) {
        expect(lane[0][0]).toBe(0);
        expect(lane[3][0]).toBe(layout.gateX);
        expect(lane[3][1]).toBeGreaterThan(layout.gateTop);
        expect(lane[3][1]).toBeLessThan(layout.gateBottom);
      }
      layout.branches.forEach((branch, i) => {
        expect(branch[0][0]).toBe(layout.gateX + layout.gateWidth);
        expect(branch[0][1]).toBeGreaterThan(layout.gateTop);
        expect(branch[0][1]).toBeLessThan(layout.gateBottom);
        expect(pointOn(branch, 1)).toEqual([layout.barX, layout.rows[i]]);
      });
    });
  }

  it('dessine les barres à l’échelle de la plus grande, jamais vides', () => {
    const layout = flowLayout(520, 300, 3);
    expect(barLength(93, 93, layout)).toBe(layout.barMax);
    expect(barLength(46.5, 93, layout)).toBeCloseTo(layout.barMax / 2);
    expect(barLength(0, 93, layout)).toBe(layout.barHeight);
    expect(barLength(0, 0, layout)).toBe(layout.barHeight);
  });
});

describe('trajectoires', () => {
  const layout = flowLayout(520, 300, 3);
  const flow = weekFlow(meta, rows);
  /** Positions d'une offre toutes les 50 ms jusqu'à la fin de sa course. */
  function course(particle: Particle) {
    const states = [];
    for (let t = 0; t < 30; t += 0.05) {
      const state = particleState(particle, t, layout);
      states.push(state);
      if (state.done) break;
    }
    return states;
  }

  it('tire les familles selon les vrais effectifs', () => {
    const random = seededRandom(1);
    const counts = new Map<number | null, number>();
    const draws = 50_000;
    for (let i = 0; i < draws; i++) {
      const { category } = spawnParticle(0, flow, random);
      counts.set(category, (counts.get(category) ?? 0) + 1);
    }
    flow.categories.forEach((c, i) => expect((counts.get(i) ?? 0) / draws).toBeCloseTo(c.n / flow.collected, 2));
    expect((counts.get(null) ?? 0) / draws).toBeCloseTo((flow.collected - flow.retained) / flow.collected, 2);
  });

  it('mène une offre retenue de la gauche au début de sa barre, où elle se fond', () => {
    const states = course({ born: 0, lane: 0, category: 2, pace: 1 });
    expect(states[0]!.x).toBeLessThanOrEqual(0);
    expect(states.at(-1)!.done).toBe(true);
    const arrival = states.find((s) => s.x >= layout.barX)!;
    expect(arrival.y).toBeCloseTo(layout.rows[2]!, 0);
    expect(arrival.sorted).toBe(true);
    // Grise avant le filtre, colorée après.
    expect(states.filter((s) => s.x < layout.gateX).every((s) => !s.sorted)).toBe(true);
    expect(states.filter((s) => s.x > layout.gateX + layout.gateWidth).every((s) => s.sorted)).toBe(true);
    for (const s of states) {
      expect(s.opacity).toBeGreaterThanOrEqual(0);
      expect(s.opacity).toBeLessThanOrEqual(1);
      expect(s.r).toBeLessThanOrEqual(DOT_RADIUS);
    }
  });

  it('éteint une offre hors périmètre dans le filtre', () => {
    const states = course({ born: 0, lane: LANES - 1, category: null, pace: 1 });
    expect(states.at(-1)!.done).toBe(true);
    expect(states.every((s) => !s.sorted)).toBe(true);
    expect(states.every((s) => s.x <= layout.gateX + layout.gateWidth)).toBe(true);
    expect(states.filter((s) => s.x > layout.gateX + layout.gateWidth / 2).every((s) => s.opacity === 0)).toBe(true);
  });

  it('reste immobile avant son départ', () => {
    const particle = { born: 5, lane: 3, category: 0, pace: 1 };
    expect(particleState(particle, 0, layout)).toEqual(particleState(particle, 5, layout));
  });
});
