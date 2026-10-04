import { LineChart } from 'echarts/charts';
import { AriaComponent, GridComponent, MarkAreaComponent, MarkLineComponent, TooltipComponent } from 'echarts/components';
import * as echarts from 'echarts/core';
import { CanvasRenderer } from 'echarts/renderers';
import { cssVar } from './colors';
import { fmtInt } from './lib/format';
import { partialRanges } from './lib/periods';

echarts.use([LineChart, GridComponent, TooltipComponent, MarkAreaComponent, MarkLineComponent, AriaComponent, CanvasRenderer]);

export interface LineSeries {
  name: string;
  color: string;
  values: (number | null)[];
  /** Effectifs par période, affichés dans l'infobulle quand la valeur est dérivée (part, indice, médiane). */
  counts?: number[];
}

export interface LineSpec {
  /** Libellés courts de l'axe. */
  labels: string[];
  /** Libellés longs, en tête d'infobulle. */
  titles: string[];
  series: LineSeries[];
  /** Périodes partielles, hachurées (SPEC.md §8.3). */
  partial: boolean[];
  /** Changements de version de taxonomie : index de période et libellé. */
  markers: { index: number; label: string }[];
  format: (value: number) => string;
  /** Libellé de l'effectif dans l'infobulle (« offres », « salaires »…). */
  countLabel?: string;
  ariaLabel: string;
}

const escapeHtml = (text: string) =>
  text.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

/** Motif hachuré à 45° des périodes partielles. */
function hatchPattern(color: string): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 8;
  const context = canvas.getContext('2d')!;
  context.strokeStyle = color;
  context.lineWidth = 1;
  context.beginPath();
  context.moveTo(0, 8);
  context.lineTo(8, 0);
  context.moveTo(-2, 2);
  context.lineTo(2, -2);
  context.moveTo(6, 10);
  context.lineTo(10, 6);
  context.stroke();
  return canvas;
}

/**
 * Courbes sur un axe de périodes, avec infobulle sur toute la verticale, hachures des
 * périodes partielles et marqueurs de version de taxonomie. Renvoie la fonction de nettoyage.
 */
export function lineChart(container: HTMLElement, spec: LineSpec): () => void {
  container.classList.add('chart');
  container.setAttribute('role', 'img');
  container.setAttribute('aria-label', spec.ariaLabel);
  const chart = echarts.init(container, null, { renderer: 'canvas' });
  const text = cssVar('--text-secondary');
  const grid = cssVar('--grid');
  const surface = cssVar('--surface-1');
  const ranges = partialRanges(spec.partial);
  const pattern = hatchPattern(cssVar('--hatch'));
  const labels = spec.labels.map((_, i) => String(i));

  chart.setOption({
    aria: { enabled: true, label: { description: spec.ariaLabel } },
    animation: false,
    textStyle: { fontFamily: getComputedStyle(document.body).fontFamily },
    // La légende est en HTML au-dessus du graphique (voir chartBox).
    grid: { left: 8, right: 16, top: 20, bottom: 8, containLabel: true },
    tooltip: {
      trigger: 'axis',
      confine: true,
      backgroundColor: surface,
      borderColor: grid,
      textStyle: { color: cssVar('--text-primary') },
      axisPointer: { type: 'line', lineStyle: { color: text, width: 1 } },
      formatter: (params: unknown) => {
        const items = (Array.isArray(params) ? params : [params]) as { dataIndex: number; seriesIndex: number }[];
        const index = items[0]?.dataIndex ?? 0;
        const rows = items
          .map(({ seriesIndex }) => ({ s: spec.series[seriesIndex]!, v: spec.series[seriesIndex]!.values[index] ?? null }))
          .sort((a, b) => (b.v ?? -Infinity) - (a.v ?? -Infinity))
          .map(({ s, v }) => {
            const count = s.counts ? ` <span class="tt-n">n = ${fmtInt(s.counts[index] ?? 0)}</span>` : '';
            const value = v === null ? '<span class="tt-masked">n &lt; 5</span>' : `<strong>${escapeHtml(spec.format(v))}</strong>`;
            return `<div class="tt-row"><span class="tt-key" style="background:${s.color}"></span>${value} <span class="tt-name">${escapeHtml(s.name)}</span>${count}</div>`;
          })
          .join('');
        const partial = spec.partial[index] ? ' <span class="tt-partial">partielle</span>' : '';
        return `<div class="tt"><div class="tt-title">${escapeHtml(spec.titles[index] ?? '')}${partial}</div>${rows}</div>`;
      },
    },
    xAxis: {
      type: 'category',
      data: labels,
      boundaryGap: true,
      axisLabel: { color: text, formatter: (value: string) => spec.labels[Number(value)] ?? '', hideOverlap: true },
      axisLine: { lineStyle: { color: grid } },
      axisTick: { show: false },
    },
    yAxis: {
      type: 'value',
      axisLabel: { color: text, formatter: (value: number) => spec.format(value) },
      splitLine: { lineStyle: { color: grid } },
    },
    series: spec.series.map((s, i) => ({
      type: 'line',
      name: s.name,
      data: s.values,
      color: s.color,
      showSymbol: s.values.filter((v) => v !== null).length < 3,
      symbolSize: 8,
      lineStyle: { width: 2 },
      connectNulls: false,
      emphasis: { focus: 'series' },
      markArea:
        i === 0 && ranges.length
          ? {
              silent: true,
              itemStyle: { color: { image: pattern, repeat: 'repeat' } },
              data: ranges.map(([from, to]) => [{ xAxis: String(from) }, { xAxis: String(to) }]),
            }
          : undefined,
      markLine:
        i === 0 && spec.markers.length
          ? {
              silent: true,
              symbol: 'none',
              lineStyle: { color: text, type: 'dashed', width: 1 },
              label: { color: text, formatter: (p: { name?: string }) => p.name ?? '', position: 'insideEndTop' },
              data: spec.markers.map((m) => ({ xAxis: String(m.index), name: m.label })),
            }
          : undefined,
    })),
  });

  const observer = new ResizeObserver(() => chart.resize());
  observer.observe(container);
  return () => {
    observer.disconnect();
    chart.dispose();
  };
}
