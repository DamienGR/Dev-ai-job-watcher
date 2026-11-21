import type { Axis } from '../lib/axis';
import { fmtInt } from '../lib/format';
import { HEIGHT, trendPoints, WIDTH, xPercent } from '../lib/trend';
import { h, svg } from '../ui';

// Mini-courbe de l'accueil (SPEC.md §17.2), sans ECharts pour garder la page légère : une
// ligne en SVG, les semaines partielles hachurées et les changements de taxonomie marqués en
// HTML par-dessus (§8.3), un tableau des valeurs pour les lecteurs d'écran.

export function trendChart(values: readonly number[], axis: Axis, label: string): HTMLElement {
  const count = values.length;
  const points = trendPoints(values).map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`);
  const plot = svg('svg', { viewBox: `0 0 ${WIDTH} ${HEIGHT}`, preserveAspectRatio: 'none', 'aria-hidden': 'true', focusable: 'false' });
  plot.append(
    svg('polygon', { class: 'trend-area', points: `0,${HEIGHT} ${points.join(' ')} ${WIDTH},${HEIGHT}` }),
    svg('polyline', { class: 'trend-line', points: points.join(' '), 'vector-effect': 'non-scaling-stroke' }),
  );

  const overlays: HTMLElement[] = [];
  const half = count > 1 ? 50 / (count - 1) : 50;
  axis.partial.forEach((partial, i) => {
    if (!partial) return;
    const band = h('span', { class: 'trend-partial', title: 'Semaine partielle' });
    band.style.left = `${Math.max(0, xPercent(i, count) - half)}%`;
    band.style.width = `${Math.min(100, xPercent(i, count) + half) - Math.max(0, xPercent(i, count) - half)}%`;
    overlays.push(band);
  });
  for (const marker of axis.markers) {
    const line = h('span', { class: 'trend-marker', title: marker.label });
    line.style.left = `${xPercent(marker.index, count)}%`;
    overlays.push(line);
  }

  const last = count - 1;
  const peak = values.indexOf(Math.max(...values));
  return h(
    'figure',
    { class: 'trend-figure' },
    h(
      'p',
      { class: 'trend-head' },
      h('span', { class: 'trend-value' }, fmtInt(values[last] ?? 0)),
      ` nouvelles offres la ${axis.titles[last]?.toLowerCase() ?? ''}`,
      count > 1 && peak !== last ? h('span', { class: 'trend-peak' }, ` · plus haut : ${fmtInt(values[peak]!)}, la ${axis.titles[peak]?.toLowerCase() ?? ''}`) : null,
    ),
    h('div', { class: 'trend-plot' }, plot, ...overlays),
    h('div', { class: 'trend-axis', 'aria-hidden': 'true' }, h('span', null, axis.labels[0]), count > 1 ? h('span', null, axis.labels[last]) : null),
    h(
      'div',
      { class: 'visually-hidden' },
      h(
        'table',
        null,
        h('caption', null, label),
        h('thead', null, h('tr', null, h('th', { scope: 'col' }, 'Semaine'), h('th', { scope: 'col' }, 'Nouvelles offres'))),
        h(
          'tbody',
          null,
          values.map((v, i) => h('tr', null, h('th', { scope: 'row' }, axis.titles[i] + (axis.partial[i] ? ' (partielle)' : '')), h('td', null, fmtInt(v)))),
        ),
      ),
    ),
  );
}
