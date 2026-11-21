import { DEFAULT_FILTERS, scopeOf } from './filters';
import { isPartialWeek, referenceWeek, scopedNewOffers, totalOver, type NewOfferRow } from './indicators';
import type { Meta } from './types';

// Visuel animé de l'en-tête de l'accueil (`site/flow.ts`, D70) : les offres de la semaine de
// référence passent la taxonomie et se rangent en trois barres (développement, data, IA).
// Chiffres, géométrie et trajectoires sans DOM, pour être testés.

export type FlowCategoryId = 'dev' | 'data' | 'ia';

export interface FlowCategory {
  id: FlowCategoryId;
  label: string;
  n: number;
}

export interface WeekFlow {
  week: string;
  partial: boolean;
  /** Toutes les nouvelles offres collectées de la semaine, périmètre élargi et non classées comprises. */
  collected: number;
  /** Offres des groupes g1 à g8 : le chiffre « Nouvelles offres » de l'accueil. */
  retained: number;
  /** Développement (groupe dev), IA (groupes IA, numérateur de la « Part IA »), data (le reste du périmètre). */
  categories: FlowCategory[];
}

/** Chiffres du visuel, tirés des mêmes lignes et des mêmes filtres par défaut que les chiffres de tête. */
export function weekFlow(meta: Meta, rows: readonly NewOfferRow[]): WeekFlow {
  const week = referenceWeek(meta);
  const inWeek = rows.filter((r) => r.week === week);
  const core = scopeOf(meta, DEFAULT_FILTERS);
  const wide = scopeOf(meta, { ...DEFAULT_FILTERS, wide: true });
  const ai = new Set(meta.aiGroups);
  const counts: Record<FlowCategoryId, number> = { dev: 0, data: 0, ia: 0 };
  for (const row of scopedNewOffers(inWeek, core)) {
    const group = core.groupOf.get(row.role) ?? '';
    counts[group === meta.devGroup ? 'dev' : ai.has(group) ? 'ia' : 'data'] += row.n;
  }
  return {
    week,
    partial: isPartialWeek(meta, week),
    collected: totalOver(scopedNewOffers(inWeek, wide), [week]),
    retained: counts.dev + counts.data + counts.ia,
    categories: [
      { id: 'dev', label: 'Développement', n: counts.dev },
      { id: 'data', label: 'Data', n: counts.data },
      { id: 'ia', label: 'IA', n: counts.ia },
    ],
  };
}

/** Point du plan, en pixels CSS. */
export type Point = [number, number];

/** Courbe de Bézier cubique : départ, deux points de contrôle, arrivée. */
export type Curve = [Point, Point, Point, Point];

/** Géométrie du visuel en pixels CSS, recalculée à chaque changement de taille. */
export interface FlowLayout {
  width: number;
  height: number;
  /** Couloirs d'arrivée des offres, de la gauche jusqu'à l'entrée du filtre, et leur longueur. */
  lanes: Curve[];
  laneLengths: number[];
  /** Filtre (la taxonomie) : bord gauche, largeur, extension verticale. */
  gateX: number;
  gateWidth: number;
  gateTop: number;
  gateBottom: number;
  /** Branches de sortie du filtre, une par barre, jusqu'au début de la barre, et leur longueur. */
  branches: Curve[];
  branchLengths: number[];
  /** Début des barres, longueur maximale, épaisseur, centre vertical de chaque barre. */
  barX: number;
  barMax: number;
  barHeight: number;
  rows: number[];
  /** Vitesse des points, en pixels par seconde. */
  speed: number;
}

/** Nombre de couloirs d'arrivée. */
export const LANES = 7;
/** Place réservée à droite des barres pour leur valeur. */
const VALUE_SPACE = 40;
/** Hauteur réservée en haut aux deux libellés de comptage. */
const HEADER = 30;

function sCurve(from: Point, to: Point, bend = 0.5): Curve {
  const dx = (to[0] - from[0]) * bend;
  return [from, [from[0] + dx, from[1]], [to[0] - dx, to[1]], to];
}

export function flowLayout(width: number, height: number, count: number): FlowLayout {
  const compact = width < 440;
  const top = HEADER + 12;
  const bottom = height - 26;
  const middle = (top + bottom) / 2;
  const gateWidth = compact ? 8 : 10;
  const gateX = Math.round(width * (compact ? 0.4 : 0.41));
  const barX = Math.round(width * (compact ? 0.58 : 0.59));
  const spacing = Math.min(compact ? 46 : 58, (bottom - top) / Math.max(1, count));
  const rows = Array.from({ length: count }, (_, i) => middle + (i - (count - 1) / 2) * spacing + 6);
  // Le filtre est plus court que la bande d'arrivée : les couloirs convergent vers lui.
  const gateHalf = Math.max(spacing * 0.75 * Math.max(1, count - 1) / 2 + 10, (bottom - top) * 0.3);
  const squeeze = (y: number) => middle + (y - middle) * ((gateHalf - 8) / ((bottom - top) / 2));
  const lanes = Array.from({ length: LANES }, (_, i): Curve => {
    const y = top + (i / (LANES - 1)) * (bottom - top);
    return sCurve([0, y], [gateX, squeeze(y)], 0.6);
  });
  const exit = gateX + gateWidth;
  const branches = rows.map((y): Curve => sCurve([exit, squeeze(y)], [barX, y], 0.55));
  return {
    width,
    height,
    lanes,
    laneLengths: lanes.map((c) => curveLength(c)),
    gateX,
    gateWidth,
    gateTop: middle - gateHalf,
    gateBottom: middle + gateHalf,
    branches,
    branchLengths: branches.map((c) => curveLength(c)),
    barX,
    barMax: Math.max(20, width - barX - VALUE_SPACE),
    barHeight: compact ? 10 : 12,
    rows,
    speed: compact ? 56 : 68,
  };
}

/** Point d'une courbe de Bézier au paramètre `t` (0 à 1). */
export function pointOn([a, b, c, d]: Curve, t: number): Point {
  const u = 1 - t;
  const at = (i: 0 | 1) => u * u * u * a[i] + 3 * u * u * t * b[i] + 3 * u * t * t * c[i] + t * t * t * d[i];
  return [at(0), at(1)];
}

/** Attribut `d` d'un chemin SVG pour une courbe. */
export function curvePath([a, b, c, d]: Curve): string {
  const p = ([x, y]: Point) => `${x.toFixed(1)} ${y.toFixed(1)}`;
  return `M${p(a)}C${p(b)} ${p(c)} ${p(d)}`;
}

/** Longueur approchée d'une courbe (corde polygonale). */
export function curveLength(curve: Curve, steps = 16): number {
  let length = 0;
  let previous = curve[0];
  for (let i = 1; i <= steps; i++) {
    const point = pointOn(curve, i / steps);
    length += Math.hypot(point[0] - previous[0], point[1] - previous[1]);
    previous = point;
  }
  return length;
}

/** Longueur d'une barre : proportionnelle à la plus grande, jamais nulle pour rester visible. */
export function barLength(n: number, max: number, layout: FlowLayout): number {
  return max > 0 ? Math.max(layout.barHeight, (n / max) * layout.barMax) : layout.barHeight;
}

/** Générateur pseudo-aléatoire reproductible (mulberry32), pour les tests et l'image fixe. */
export function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
}

/** Une offre en transit : catégorie tirée selon les vrais effectifs, `null` hors périmètre. */
export interface Particle {
  /** Instant de départ, en secondes. */
  born: number;
  /** Couloir d'arrivée. */
  lane: number;
  /** Indice de la barre visée, ou `null` : l'offre ne passe pas le filtre. */
  category: number | null;
  /** Facteur de vitesse propre (0,85 à 1,15), pour un flux moins mécanique. */
  pace: number;
}

export function spawnParticle(born: number, flow: WeekFlow, random: () => number): Particle {
  let pick = random() * Math.max(1, flow.collected);
  let category: number | null = null;
  for (const [i, c] of flow.categories.entries()) {
    if (pick < c.n) {
      category = i;
      break;
    }
    pick -= c.n;
  }
  return { born, lane: Math.floor(random() * LANES), category, pace: 0.85 + random() * 0.3 };
}

/** État d'un point à l'instant `t` : position, rayon, opacité, couleur gagnée au filtre. */
export interface ParticleState {
  x: number;
  y: number;
  r: number;
  opacity: number;
  /** Le point est sorti du filtre : il prend la couleur de sa barre. */
  sorted: boolean;
  /** Le point a fini sa course et peut être retiré. */
  done: boolean;
}

export const DOT_RADIUS = 3;
/** Durée de l'absorption d'un point par sa barre (s). */
const MERGE = 0.3;

const smooth = (t: number) => t * t * (3 - 2 * t);

/**
 * Position d'une offre : son couloir jusqu'au filtre, la traversée du filtre (cachée par
 * lui : l'offre y change de hauteur, ou disparaît si elle est hors périmètre), puis la branche
 * de sa famille jusqu'à la barre, où elle se fond.
 */
export function particleState(p: Particle, t: number, layout: FlowLayout): ParticleState {
  const speed = layout.speed * p.pace;
  const age = Math.max(0, t - p.born);
  const lane = layout.lanes[p.lane]!;
  const inTime = layout.laneLengths[p.lane]! / speed;
  if (age < inTime) {
    const [x, y] = pointOn(lane, age / inTime);
    return { x, y, r: DOT_RADIUS, opacity: Math.min(1, (age / inTime) * 8), sorted: false, done: false };
  }

  const gateTime = (layout.gateWidth * 1.6) / speed;
  const branch = p.category === null ? null : layout.branches[p.category];
  let after = age - inTime;
  if (after < gateTime || !branch) {
    const k = Math.min(1, after / gateTime);
    const from = lane[3];
    const toY = branch ? branch[0][1] : from[1];
    // L'offre prend sa couleur à mi-chemin, encore cachée par le filtre ; une offre écartée
    // s'éteint avant d'atteindre l'autre bord.
    return {
      x: from[0] + layout.gateWidth * k,
      y: from[1] + (toY - from[1]) * smooth(k),
      r: DOT_RADIUS,
      opacity: branch ? 1 : Math.max(0, 1 - 2 * k),
      sorted: branch !== null && k >= 0.5,
      done: !branch && k >= 1,
    };
  }
  after -= gateTime;

  const outTime = layout.branchLengths[p.category!]! / speed;
  if (after < outTime) {
    const [x, y] = pointOn(branch, after / outTime);
    return { x, y, r: DOT_RADIUS, opacity: 1, sorted: true, done: false };
  }
  const k = Math.min(1, (after - outTime) / MERGE);
  return { x: layout.barX + 6 * k, y: branch[3][1], r: DOT_RADIUS * (1 - 0.6 * k), opacity: 1 - k, sorted: true, done: k >= 1 };
}
