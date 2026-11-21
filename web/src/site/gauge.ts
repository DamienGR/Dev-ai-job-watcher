import { fmtPct, MASKED } from '../lib/format';
import { svg } from '../ui';

// Piste 2 de l'en-tête de l'accueil, « le baromètre vivant » (variante de comparaison, D70,
// `?visuel=jauge` sur l'aperçu de la PR) : un cadran qui se remplit jusqu'à la part IA de la
// semaine de référence, puis la courbe de cette part depuis le premier run, qui se dessine.
// SVG à l'échelle du pixel, animations CSS seulement ; image finale si le lecteur réduit les
// animations.

export interface GaugeData {
  /** Part IA de la semaine de référence, ou `null` sous 5 offres. */
  share: number | null;
  weekNumber: number;
  /** Part IA de chaque semaine depuis le premier run (`null` : masquée). */
  series: (number | null)[];
  /** Libellés de la première et de la dernière semaine de la courbe. */
  firstLabel: string;
  lastLabel: string;
}

type Point = [number, number];

export function startGauge(figure: HTMLElement, data: GaugeData): void {
  const plot = svg('svg', { class: 'gauge-plot', 'aria-hidden': 'true', focusable: 'false' });
  figure.prepend(plot);
  let drawn = false;
  new ResizeObserver(([entry]) => {
    const width = Math.round(entry?.contentRect.width ?? 0);
    const height = Math.round(entry?.contentRect.height ?? 0);
    if (width < 1 || height < 1) return;
    // Le cadran ne se remplit qu'au premier affichage, pas à chaque changement de taille.
    if (drawn) figure.classList.add('gauge-settled');
    drawn = true;
    plot.setAttribute('viewBox', `0 0 ${width} ${height}`);
    plot.replaceChildren(...drawGauge(width, height, data));
  }).observe(plot);
  figure.classList.add('gauge-ready');
}

function text(x: number, y: number, className: string, content: string, anchor = 'middle'): SVGTextElement {
  const element = svg('text', { x, y, class: className, 'text-anchor': anchor });
  element.textContent = content;
  return element;
}

/** Taille de police en pixels, suivant le rayon du cadran. */
function sized(element: SVGTextElement, size: number): SVGTextElement {
  element.style.fontSize = `${size}px`;
  return element;
}

function drawGauge(width: number, height: number, data: GaugeData): SVGElement[] {
  const compact = width < 440;
  const stroke = compact ? 9 : 11;
  const r = Math.round(compact ? Math.min(width * 0.32, height * 0.45) : Math.min(width * 0.25, height * 0.4, 124));
  const cx = width / 2;
  const cy = stroke + r + 2;
  const at = (fraction: number, radius = r): Point => {
    const angle = Math.PI * (1 - fraction);
    return [cx + radius * Math.cos(angle), cy - radius * Math.sin(angle)];
  };
  const arc = `M${cx - r} ${cy}A${r} ${r} 0 0 1 ${cx + r} ${cy}`;
  const value = data.share ?? 0;

  const gradient = svg('linearGradient', { id: 'gauge-fill', gradientUnits: 'userSpaceOnUse', x1: cx - r, y1: 0, x2: cx + r, y2: 0 });
  gradient.append(svg('stop', { offset: 0, class: 'gauge-stop-start' }), svg('stop', { offset: 1, class: 'gauge-stop-end' }));
  const defs = svg('defs');
  defs.append(gradient);

  // Graduations tous les 5 %, plus marquées tous les 25 % ; les extrémités ont leur libellé.
  const ticks = Array.from({ length: 19 }, (_, k) => {
    const i = k + 1;
    const major = i % 5 === 0;
    const [x1, y1] = at(i / 20, r - stroke / 2 - 6);
    const [x2, y2] = at(i / 20, r - stroke / 2 - (major ? 14 : 10));
    return svg('line', { class: major ? 'gauge-tick gauge-tick-major' : 'gauge-tick', x1, y1, x2, y2 });
  });

  const fill = svg('path', { class: 'gauge-fill', d: arc, pathLength: 100, 'stroke-width': stroke });
  fill.style.strokeDashoffset = String(100 - value * 100);
  // Le curseur part de la gauche et tourne autour du centre du cadran, avec le remplissage.
  const knob = svg('g', { class: 'gauge-knob' });
  knob.style.transformOrigin = `${cx}px ${cy}px`;
  knob.style.transform = `rotate(${(value * 180).toFixed(2)}deg)`;
  knob.append(
    svg('circle', { class: 'gauge-pulse', cx: cx - r, cy, r: stroke / 2 + 2 }),
    svg('circle', { class: 'gauge-knob-ring', cx: cx - r, cy, r: stroke / 2 + 3 }),
    svg('circle', { class: 'gauge-knob-dot', cx: cx - r, cy, r: stroke / 2 - 1.5 }),
  );

  const elements: SVGElement[] = [
    defs,
    svg('path', { class: 'gauge-track', d: arc, 'stroke-width': stroke }),
    ...ticks,
    fill,
    knob,
    sized(text(cx, cy - Math.round(r * 0.15), 'gauge-value', data.share === null ? MASKED : fmtPct(data.share)), Math.round(Math.min(34, Math.max(22, r * 0.28)))),
    sized(text(cx, cy + 2, 'gauge-sub', `part IA, semaine ${data.weekNumber}`), r < 100 ? 11 : 12.5),
    text(cx - r, cy + 20, 'gauge-scale', '0 %'),
    text(cx + r, cy + 20, 'gauge-scale', '100 %'),
  ];

  // Courbe de la part IA depuis le premier run, sous le cadran, à la même largeur.
  const points = data.series.map((v, i): [number, number | null] => [i, v]);
  const known = points.filter((p): p is [number, number] => p[1] !== null);
  const top = cy + 34;
  const bottom = Math.min(height - 22, top + (compact ? 52 : 70));
  if (known.length >= 2 && bottom - top > 24) {
    const values = known.map((p) => p[1]);
    const low = Math.min(...values) - 0.02;
    const high = Math.max(...values) + 0.02;
    const x = (i: number) => cx - r + (i / Math.max(1, data.series.length - 1)) * 2 * r;
    const y = (v: number) => bottom - ((v - low) / (high - low || 1)) * (bottom - top);
    const line = known.map(([i, v]) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
    const [firstI, firstV] = known[0]!;
    const [lastI, lastV] = known[known.length - 1]!;
    elements.push(
      svg('line', { class: 'gauge-baseline', x1: cx - r, y1: bottom + 0.5, x2: cx + r, y2: bottom + 0.5 }),
      svg('polygon', { class: 'gauge-area', points: `${x(known[0]![0]).toFixed(1)},${bottom} ${line} ${x(lastI).toFixed(1)},${bottom}` }),
      svg('polyline', { class: 'gauge-line', points: line, pathLength: 1 }),
      ...known.map(([i, v]) => svg('circle', { class: 'gauge-point', cx: x(i).toFixed(1), cy: y(v).toFixed(1), r: 2.5 })),
      svg('circle', { class: 'gauge-point gauge-point-last', cx: x(lastI).toFixed(1), cy: y(lastV).toFixed(1), r: 4 }),
      text(x(firstI) - 9, y(firstV) + 4, 'gauge-point-label', fmtPct(firstV), 'end'),
      text(x(lastI) + 9, y(lastV) + 4, 'gauge-point-label', fmtPct(lastV), 'start'),
      text(cx - r, bottom + 16, 'gauge-scale', data.firstLabel, 'start'),
      text(cx + r, bottom + 16, 'gauge-scale', data.lastLabel, 'end'),
    );
  }
  return elements;
}
