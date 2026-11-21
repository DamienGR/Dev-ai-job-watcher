import { barLength, curvePath, flowLayout, particleState, seededRandom, spawnParticle, type FlowLayout, type Particle, type WeekFlow } from '../lib/flow';
import { fmtInt } from '../lib/format';
import { svg } from '../ui';

// Visuel animé de l'en-tête de l'accueil (D70) : des points gris, les offres de la semaine,
// arrivent par des couloirs à gauche et passent le filtre de la taxonomie ; celles du
// périmètre en ressortent à la couleur de leur famille et rejoignent sa barre, les autres
// n'en ressortent pas. Proportions et longueurs des barres viennent des vrais chiffres de la
// semaine de référence.
// Un SVG à l'échelle du pixel (textes nets à toute largeur), une boucle `requestAnimationFrame`
// suspendue hors de l'écran, une image fixe si le lecteur réduit les animations.

/** Offres affichées par seconde. */
const RATE = 8;
/** Le flux démarre déjà installé, comme s'il tournait depuis quelques secondes. */
const WARM_UP = 6;
/** Pas maximal d'une image, pour qu'un onglet revenu au premier plan ne saute pas. */
const MAX_STEP = 0.1;

interface Dot {
  particle: Particle;
  element: SVGCircleElement;
  sorted: boolean;
}

export function startFlow(figure: HTMLElement, flow: WeekFlow, taxonomyVersion: number): void {
  const plot = svg('svg', { class: 'flow-plot', 'aria-hidden': 'true', focusable: 'false' });
  const back = svg('g');
  const dots = svg('g');
  const front = svg('g');
  const laneFade = svg('linearGradient', { id: 'flow-lane', gradientUnits: 'userSpaceOnUse', x1: 0, y1: 0, x2: 1, y2: 0 });
  laneFade.append(svg('stop', { offset: 0, class: 'flow-stop-lane', 'stop-opacity': 0 }), svg('stop', { offset: 0.45, class: 'flow-stop-lane' }));
  plot.append(gradients(laneFade), back, dots, front);
  figure.prepend(plot);

  const random = seededRandom(46);
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  const max = Math.max(...flow.categories.map((c) => c.n));
  let layout: FlowLayout | null = null;
  let clock = WARM_UP;
  let nextSpawn = 0;
  let live: Dot[] = [];
  let last: number | null = null;
  let visible = true;
  let frame = 0;

  const draw = (width: number, height: number) => {
    // Les barres ne poussent qu'au premier affichage, pas à chaque changement de taille.
    if (layout) figure.classList.add('flow-settled');
    layout = flowLayout(width, height, flow.categories.length);
    plot.setAttribute('viewBox', `0 0 ${width} ${height}`);
    laneFade.setAttribute('x2', String(layout.gateX));
    back.replaceChildren(
      ...layout.lanes.map((curve) => svg('path', { class: 'flow-lane', d: curvePath(curve) })),
      ...layout.branches.map((curve, i) => svg('path', { class: `flow-branch flow-${flow.categories[i]!.id}`, d: curvePath(curve) })),
    );
    front.replaceChildren(...foreground(layout, flow, max, taxonomyVersion));
  };

  const update = () => {
    if (!layout) return;
    while (nextSpawn <= clock) {
      const element = svg('circle', { class: 'flow-dot' });
      dots.append(element);
      live.push({ particle: spawnParticle(nextSpawn, flow, random), element, sorted: false });
      nextSpawn += (0.4 + random() * 1.2) / RATE;
    }
    const kept: Dot[] = [];
    for (const dot of live) {
      const state = particleState(dot.particle, clock, layout);
      if (state.done) {
        dot.element.remove();
        continue;
      }
      if (state.sorted !== dot.sorted) {
        dot.sorted = state.sorted;
        const id = dot.particle.category === null ? null : flow.categories[dot.particle.category]?.id;
        dot.element.setAttribute('class', id ? `flow-dot flow-${id}` : 'flow-dot');
      }
      dot.element.setAttribute('cx', state.x.toFixed(1));
      dot.element.setAttribute('cy', state.y.toFixed(1));
      dot.element.setAttribute('r', state.r.toFixed(2));
      dot.element.setAttribute('opacity', state.opacity.toFixed(2));
      kept.push(dot);
    }
    live = kept;
  };

  const tick = (now: number) => {
    frame = 0;
    clock += last === null ? 0 : Math.min(MAX_STEP, (now - last) / 1000);
    last = now;
    update();
    schedule();
  };

  const schedule = () => {
    if (frame || !visible || reduced.matches) return;
    frame = requestAnimationFrame(tick);
  };

  const pause = () => {
    if (frame) cancelAnimationFrame(frame);
    frame = 0;
    last = null;
  };

  new ResizeObserver(([entry]) => {
    const width = Math.round(entry?.contentRect.width ?? 0);
    const height = Math.round(entry?.contentRect.height ?? 0);
    if (width < 1 || height < 1) return;
    draw(width, height);
    update();
  }).observe(plot);

  new IntersectionObserver(([entry]) => {
    visible = entry?.isIntersecting ?? true;
    if (visible) schedule();
    else pause();
  }).observe(figure);

  // Mouvement réduit : l'image reste celle du flux après sa mise en route, sans boucle.
  reduced.addEventListener('change', () => (reduced.matches ? pause() : schedule()));

  figure.classList.add('flow-ready');
  schedule();
}

/**
 * Dégradés : couloirs qui apparaissent depuis le bord gauche, filtre aux couleurs des barres
 * de haut en bas.
 */
function gradients(laneFade: SVGLinearGradientElement): SVGDefsElement {
  const gradient = svg('linearGradient', { id: 'flow-gate', x1: 0, y1: 0, x2: 0, y2: 1 });
  for (const [offset, id] of [
    ['0.28', 'dev'],
    ['0.38', 'data'],
    ['0.62', 'data'],
    ['0.72', 'ia'],
  ] as const) {
    gradient.append(svg('stop', { offset, class: `flow-stop-${id}` }));
  }
  const defs = svg('defs');
  defs.append(laneFade, gradient);
  return defs;
}

function text(x: number, y: number, className: string, content: string, anchor = 'start'): SVGTextElement {
  const element = svg('text', { x, y, class: className, 'text-anchor': anchor });
  element.textContent = content;
  return element;
}

/** Libellé de comptage : le nombre en évidence, puis ce qu'il compte. */
function count(x: number, n: number, what: string): SVGTextElement {
  const element = text(x, 14, 'flow-label', ` ${what}`);
  const number = svg('tspan', { class: 'flow-label-n' });
  number.textContent = fmtInt(n);
  element.prepend(number);
  return element;
}

/** Premier plan : filtre (qui cache le tri), barres, libellés et valeurs. */
function foreground(layout: FlowLayout, flow: WeekFlow, max: number, taxonomyVersion: number): SVGElement[] {
  const gateHeight = layout.gateBottom - layout.gateTop;
  const gateCenter = layout.gateX + layout.gateWidth / 2;
  const elements: SVGElement[] = [
    count(0, flow.collected, 'offres collectées'),
    count(layout.barX, flow.retained, 'en dev, data et IA'),
    svg('rect', { class: 'flow-gate-halo', x: layout.gateX - 6, y: layout.gateTop - 6, width: layout.gateWidth + 12, height: gateHeight + 12, rx: layout.gateWidth / 2 + 6 }),
    svg('rect', { class: 'flow-gate', x: layout.gateX, y: layout.gateTop, width: layout.gateWidth, height: gateHeight, rx: layout.gateWidth / 2 }),
    text(gateCenter, layout.gateBottom + 22, 'flow-note', `taxonomie v${taxonomyVersion}`, 'middle'),
  ];
  flow.categories.forEach((category, i) => {
    const y = layout.rows[i]!;
    const top = y - layout.barHeight / 2;
    const length = barLength(category.n, max, layout);
    elements.push(
      text(layout.barX, top - 7, 'flow-bar-label', category.label),
      svg('rect', { class: 'flow-track', x: layout.barX, y: top, width: layout.barMax, height: layout.barHeight, rx: layout.barHeight / 2 }),
      svg('rect', { class: `flow-bar flow-${category.id}`, x: layout.barX, y: top, width: length, height: layout.barHeight, rx: layout.barHeight / 2 }),
      text(layout.width, y + 4.5, 'flow-value', fmtInt(category.n), 'end'),
    );
  });
  return elements;
}
