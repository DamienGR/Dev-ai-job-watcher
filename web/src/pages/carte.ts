import type * as Leaflet from 'leaflet';
import { cssVar, groupColor, sequentialRamp } from '../colors';
import { periodOf } from '../lib/filters';
import { fmtDecimal, fmtInt, fmtPct, MIN_N, shareOf } from '../lib/format';
import { chartMonths, lastRunId, regionTotals, type GeoPointRow, type GeoRegionRow, type RegionTotals } from '../lib/indicators';
import { lastWeeks, weekLongLabel } from '../lib/periods';
import { rowsOf } from '../lib/table';
import type { Table } from '../lib/types';
import type { Page, PageContext } from '../page';
import { append, card, dataTable, h, masked, swatch, valueOr } from '../ui';
import { groupLabel, roleLabel, segmented } from './common';

type Measure = 'volume' | 'densite' | 'ia';

const MEASURES: [Measure, string][] = [
  ['volume', 'Volume'],
  ['densite', 'Densité'],
  ['ia', 'Part IA'],
];

/** Valeur d'une région pour la mesure choisie ; `null` = masquée (moins de 5 offres du périmètre). */
function measureOf(totals: RegionTotals | undefined, measure: Measure): number | null {
  if (!totals) return measure === 'volume' ? 0 : null;
  if (measure === 'volume') return totals.nCore;
  if (totals.nCore < MIN_N) return null;
  return measure === 'densite' ? totals.density : shareOf(totals.nAi, totals.nCore);
}

const formatMeasure = (measure: Measure) => (measure === 'volume' ? fmtInt : measure === 'densite' ? fmtDecimal : fmtPct);

/** Seuils de la rampe : quantiles des valeurs non masquées. */
export function breaks(values: number[], steps: number): number[] {
  const sorted = values.filter((v) => Number.isFinite(v)).sort((a, b) => a - b);
  if (!sorted.length) return [];
  return Array.from({ length: steps - 1 }, (_, i) => sorted[Math.floor(((i + 1) * sorted.length) / steps)] ?? sorted[sorted.length - 1]!);
}

/** Leaflet et markercluster, chargés à la demande (la carte n'alourdit pas les autres pages). */
async function loadLeaflet(): Promise<typeof Leaflet> {
  const L = (await import('leaflet')).default;
  (globalThis as { L?: typeof Leaflet }).L = L;
  await import('leaflet.markercluster');
  await Promise.all([import('leaflet/dist/leaflet.css'), import('leaflet.markercluster/dist/MarkerCluster.css')]);
  return L;
}

async function drawMap(ctx: PageContext, container: HTMLElement, data: { totals: Map<string, RegionTotals>; points: GeoPointRow[]; measure: Measure; showPoints: boolean }) {
  const { meta } = ctx;
  const [L, geojson] = await Promise.all([
    loadLeaflet(),
    fetch('/geo/regions-metropole.geojson').then((r) => r.json() as Promise<GeoJSON.FeatureCollection>),
  ]);
  if (!container.isConnected) return;
  const map = L.map(container, { scrollWheelZoom: false, zoomSnap: 0.25 });
  ctx.onDispose(() => map.remove());
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 12,
    attribution: '&copy; contributeurs <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> · contours IGN Admin Express',
  }).addTo(map);

  const ramp = sequentialRamp();
  const values = [...data.totals.entries()]
    .filter(([code]) => !meta.labels.regions.find((r) => r.code === code)?.drom)
    .map(([, t]) => measureOf(t, data.measure))
    .filter((v): v is number => v !== null);
  const thresholds = breaks(values, ramp.length);
  const colorOf = (value: number | null) => (value === null ? cssVar('--masked-fill') : ramp[thresholds.filter((t) => value >= t).length]!);
  const format = formatMeasure(data.measure);

  const layer = L.geoJSON(geojson, {
    style: (feature) => {
      const value = measureOf(data.totals.get(String(feature?.properties?.code)), data.measure);
      return { color: cssVar('--surface-1'), weight: 1.5, fillColor: colorOf(value), fillOpacity: 0.6 };
    },
    onEachFeature: (feature, featureLayer) => {
      const code = String(feature.properties?.code);
      const totals = data.totals.get(code);
      const value = measureOf(totals, data.measure);
      const tooltip = document.createElement('div');
      append(tooltip, [
        h('strong', null, String(feature.properties?.nom ?? code)),
        h('br'),
        `${MEASURES.find(([m]) => m === data.measure)![1]} : ${value === null ? 'n < 5' : format(value)}`,
        h('br'),
        `n = ${fmtInt(totals?.nCore ?? 0)} offres du périmètre`,
      ]);
      featureLayer.bindTooltip(tooltip, { sticky: true });
    },
  }).addTo(map);
  map.fitBounds(layer.getBounds(), { padding: [8, 8] });

  if (data.showPoints && data.points.length) {
    const cluster = L.markerClusterGroup({
      showCoverageOnHover: false,
      maxClusterRadius: 40,
      iconCreateFunction: (group) => {
        const markers = group.getAllChildMarkers();
        const byGroup = new Map<string, number>();
        let total = 0;
        for (const marker of markers) {
          const { group: g, n } = (marker.options as { meta?: { group: string; n: number } }).meta ?? { group: '', n: 1 };
          byGroup.set(g, (byGroup.get(g) ?? 0) + n);
          total += n;
        }
        const main = [...byGroup].sort((a, b) => b[1] - a[1])[0]?.[0] ?? '';
        const size = Math.round(28 + Math.min(20, Math.sqrt(total) * 2));
        const icon = document.createElement('span');
        icon.className = 'cluster';
        icon.style.background = groupColor(meta, main);
        icon.style.width = icon.style.height = `${size}px`;
        icon.textContent = fmtInt(total);
        return L.divIcon({ html: icon, className: 'cluster-icon', iconSize: [size, size] });
      },
    });
    for (const p of data.points) {
      const dot = document.createElement('span');
      dot.className = 'dot';
      dot.style.background = groupColor(meta, p.group);
      const marker = L.marker([p.lat, p.lng], {
        icon: L.divIcon({ html: dot, className: 'dot-icon', iconSize: [12, 12] }),
        keyboard: false,
        meta: { group: p.group, n: p.n },
      } as Leaflet.MarkerOptions);
      const popup = document.createElement('div');
      append(popup, [h('strong', null, roleLabel(meta, p.role)), h('br'), groupLabel(meta, p.group), h('br'), `${fmtInt(p.n)} offre(s), ${weekLongLabel(p.week)}`]);
      marker.bindPopup(popup);
      cluster.addLayer(marker);
    }
    map.addLayer(cluster);
  }
}

export const cartePage: Page = {
  id: 'carte',
  title: 'Carte',
  params: ['mesure', 'semaines', 'points'],
  async render(ctx) {
    const { meta, filters, scope, params } = ctx;
    const [regionsTable, pointsTable] = await Promise.all([ctx.load<Table>('geo-regions.json'), ctx.load<Table>('geo-points.json')]);
    const regionRows = rowsOf<GeoRegionRow>(regionsTable);
    const measure: Measure = params.get('mesure') === 'densite' ? 'densite' : params.get('mesure') === 'ia' ? 'ia' : 'volume';
    const pointWeeks = params.get('semaines') === '4' ? 4 : 12;
    const showPoints = params.get('points') !== '0';

    const months = filters.period === '12m' ? null : chartMonths(meta, filters, regionRows.map((r) => r.month));
    const totals = regionTotals(regionRows, months, meta);
    const weeks = new Set(lastWeeks(lastRunId(meta), pointWeeks));
    const points = rowsOf<GeoPointRow>(pointsTable).filter((p) => weeks.has(p.week) && scope.roleOk(p.role));
    const pointCount = points.reduce((a, p) => a + p.n, 0);

    const mapBox = h('div', { class: 'map', role: 'region', 'aria-label': 'Carte des offres par région' });
    const format = formatMeasure(measure);
    const ramp = sequentialRamp();
    const metroValues = [...totals.entries()]
      .filter(([code]) => !meta.labels.regions.find((r) => r.code === code)?.drom)
      .map(([, t]) => measureOf(t, measure))
      .filter((v): v is number => v !== null);
    const thresholds = breaks(metroValues, ramp.length);

    const regionList = meta.labels.regions.map((r) => ({ ...r, totals: totals.get(r.code) }));
    append(ctx.root, [
      card(
        'Offres par région',
        h(
          'div',
          { class: 'controls' },
          segmented(ctx, 'mesure', 'Mesure des régions', MEASURES, measure),
          segmented(ctx, 'semaines', 'Période des points', [['12', '12 semaines'], ['4', '4 semaines']], String(pointWeeks)),
          h(
            'label',
            { class: 'inline-check' },
            h('input', { type: 'checkbox', checked: showPoints, onchange: (e: Event) => ctx.setParam('points', (e.target as HTMLInputElement).checked ? null : '0') }),
            ' Points des offres',
          ),
        ),
        h(
          'p',
          { class: 'note' },
          `Régions : ${periodOf(filters).label.toLowerCase()}, offres des groupes g1 à g8 ; densité pour 100 000 actifs (INSEE ${meta.population.millesime}). `,
          `Points : ${fmtInt(pointCount)} offres géolocalisées des ${pointWeeks} dernières semaines, colorées par groupe (coordonnées arrondies à 0,01°).`,
        ),
        filters.groups.length || filters.roles.length || filters.source !== '*' || filters.contract !== '*'
          ? h('p', { class: 'note' }, 'Les régions ne se filtrent ni par groupe, rôle, source ou contrat ; les points suivent les groupes et rôles choisis.')
          : null,
        mapBox,
        h(
          'div',
          { class: 'map-legend' },
          h('span', { class: 'legend-title' }, MEASURES.find(([m]) => m === measure)![1]),
          ramp.map((color, i) =>
            h('span', { class: 'legend-step' }, swatch(color), i === 0 ? `< ${format(thresholds[0] ?? 0)}` : `≥ ${format(thresholds[i - 1] ?? 0)}`),
          ),
          measure !== 'volume' ? h('span', { class: 'legend-step' }, swatch(cssVar('--masked-fill')), 'n < 5') : null,
        ),
        h(
          'div',
          { class: 'map-legend' },
          h('span', { class: 'legend-title' }, 'Points'),
          scope.groups.map((g) => h('span', { class: 'legend-step' }, swatch(groupColor(meta, g)), groupLabel(meta, g))),
        ),
      ),
      card(
        'Tableau des régions',
        h('p', { class: 'note' }, 'Les cinq régions d’outre-mer figurent ici ; la carte montre la métropole.'),
        dataTable(
          [
            { label: 'Région', render: (r: (typeof regionList)[number]) => [r.label, r.drom ? h('span', { class: 'cell-n' }, ' DROM') : null] },
            { label: 'Offres (g1 à g8)', numeric: true, render: (r: (typeof regionList)[number]) => fmtInt(r.totals?.nCore ?? 0) },
            { label: 'Toutes offres', numeric: true, render: (r: (typeof regionList)[number]) => fmtInt(r.totals?.n ?? 0) },
            {
              label: 'Densité',
              numeric: true,
              title: 'Offres du périmètre pour 100 000 actifs',
              render: (r: (typeof regionList)[number]) =>
                (r.totals?.nCore ?? 0) < MIN_N ? masked() : valueOr(r.totals?.density, fmtDecimal),
            },
            { label: 'Part IA', numeric: true, render: (r: (typeof regionList)[number]) => valueOr(measureOf(r.totals, 'ia'), fmtPct) },
          ],
          regionList,
        ),
      ),
    ]);
    requestAnimationFrame(() => {
      drawMap(ctx, mapBox, { totals, points, measure, showPoints }).catch((error: unknown) => {
        mapBox.replaceChildren(h('p', { class: 'empty' }, `Carte indisponible : ${error instanceof Error ? error.message : String(error)}`));
      });
    });
  },
};
