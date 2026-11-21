import { loadFile, loadMeta, NoDataError } from './data';
import { weekAxis } from './lib/axis';
import { DEFAULT_FILTERS, scopeOf } from './lib/filters';
import { weekFlow, type WeekFlow } from './lib/flow';
import { fmtInt, MASKED } from './lib/format';
import { fmtRoleMove, fmtTechMove, headline, headlineFigures, type Figure } from './lib/headline';
import {
  referenceMonth,
  referenceWeek,
  roleMovers,
  scopedNewOffers,
  sumSeries,
  techMovers,
  type Mover,
  type Movers,
  type NewOfferRow,
  type PremiumRow,
  type TechRow,
  type TechTotalRow,
} from './lib/indicators';
import { monthLabel, weekLongLabel, weekRange } from './lib/periods';
import { rowsOf } from './lib/table';
import type { Meta, SalariesFile, TechsFile, TimeseriesFile } from './lib/types';
import { startFlow } from './site/flow';
import { legacyDashboardUrl } from './site/legacy';
import './site/site';
import { trendChart } from './site/trend';
import { append, h, partialBadge } from './ui';

// Accueil (SPEC.md §17.2) : flux du pipeline dans l'en-tête (D70), quatre chiffres de la
// semaine de référence, mini-courbe depuis le premier run, « ce qui bouge ». Mêmes fichiers et mêmes calculs que la vue d'ensemble du
// tableau de bord, avec ses filtres par défaut (§17.4).

/** Un ancien lien du tableau de bord part vers sa nouvelle adresse, sans entrée dans l'historique. */
function redirectLegacyLink(): boolean {
  const target = legacyDashboardUrl(location.hash);
  if (target) location.replace(target);
  return target !== null;
}

const MOVERS_SHOWN = 3;

function slot(name: string): HTMLElement | null {
  return document.querySelector<HTMLElement>(`[data-home-${name}]`);
}

function figureCard(figure: Figure): HTMLElement {
  return h(
    'div',
    { class: 'figure', 'data-figure': figure.id },
    h('p', { class: 'figure-label' }, figure.label, figure.partial ? [' ', partialBadge()] : null),
    h('p', { class: figure.value === MASKED ? 'figure-value masked' : 'figure-value' }, figure.value),
    h('p', { class: 'figure-detail' }, figure.detail),
  );
}

function moversCard(title: string, note: string, movers: Movers, label: (id: string) => string, format: (m: Mover) => string): HTMLElement {
  const list = (heading: string, items: Mover[]) =>
    h(
      'div',
      { class: 'movers-list' },
      h('h4', null, heading),
      items.length
        ? h('ol', null, items.slice(0, MOVERS_SHOWN).map((m) => h('li', null, h('span', null, label(m.id)), h('span', { class: 'mover-value' }, format(m)))))
        : h('p', { class: 'note' }, 'Rien de notable avec l’historique disponible.'),
    );
  return h(
    'div',
    { class: 'movers-card' },
    h('h3', null, title, movers.partial ? [' ', partialBadge()] : null),
    h('p', { class: 'note' }, note),
    list('En hausse', movers.up),
    list('En baisse', movers.down),
  );
}

/**
 * Visuel de l'en-tête (D70). La légende visible date la semaine ; sa partie masquée donne aux
 * lecteurs d'écran les chiffres que le dessin montre.
 */
function renderFlow(flow: WeekFlow, taxonomyVersion: number): void {
  const figure = slot('flow');
  const caption = slot('flow-caption');
  if (!figure || !caption) return;
  if (flow.collected === 0) {
    figure.hidden = true;
    return;
  }
  const [dev, data, ia] = flow.categories.map((c) => fmtInt(c.n));
  append(caption, [
    `Nouvelles offres de la ${weekLongLabel(flow.week)}`,
    flow.partial ? [' ', partialBadge()] : null,
    h(
      'span',
      { class: 'visually-hidden' },
      ` : ${fmtInt(flow.retained)} offres dev, data et IA sur ${fmtInt(flow.collected)} collectées, dont ${dev} en développement, ${data} en data et ${ia} en IA.`,
    ),
  ]);
  startFlow(figure, flow, taxonomyVersion);
}

function render(meta: Meta, timeseries: TimeseriesFile, salaries: SalariesFile, techs: TechsFile): void {
  const scope = scopeOf(meta, DEFAULT_FILTERS);
  const rows = rowsOf<NewOfferRow>(timeseries.newOffers);
  const scoped = scopedNewOffers(rows, scope);

  slot('figures')?.replaceChildren(...headlineFigures(headline(meta, rows, scope, rowsOf<PremiumRow>(salaries.aiPremium))).map(figureCard));
  renderFlow(weekFlow(meta, rows), meta.taxonomy.version);

  const weeks = weekRange(meta.firstRun, referenceWeek(meta));
  const values = sumSeries(scoped, weeks, (r) => r.week, () => 'n').get('n') ?? weeks.map(() => 0);
  slot('trend')?.replaceChildren(trendChart(values, weekAxis(meta, weeks), 'Nouvelles offres dev, data et IA par semaine'));

  const roleLabel = (id: string) => meta.labels.roles.find((r) => r.id === id)?.label ?? id;
  const techLabel = (id: string) => meta.labels.technologies.find((t) => t.id === id)?.label ?? id;
  slot('movers')?.replaceChildren(
    moversCard(
      'Métiers',
      'Nouvelles offres des 4 dernières semaines complètes contre les 4 précédentes, métiers d’au moins 10 offres sur les 8 semaines.',
      roleMovers(scoped, meta),
      roleLabel,
      fmtRoleMove,
    ),
    moversCard(
      'Technologies',
      `Part des offres qui citent la technologie, en ${monthLabel(referenceMonth(meta))} contre la moyenne des 3 mois précédents.`,
      techMovers(rowsOf<TechRow>(techs.techs), rowsOf<TechTotalRow>(techs.totals), meta, scope),
      techLabel,
      fmtTechMove,
    ),
  );
}

function showError(error: unknown): void {
  const text =
    error instanceof NoDataError
      ? 'Les chiffres apparaîtront après le premier run hebdomadaire.'
      : 'Les chiffres sont momentanément indisponibles. Rechargez la page dans quelques instants.';
  slot('figures')?.replaceChildren(h('p', { class: 'note' }, text));
  const flow = slot('flow');
  if (flow) flow.hidden = true;
  slot('trend')?.replaceChildren();
  slot('movers')?.replaceChildren();
}

async function start(): Promise<void> {
  if (redirectLegacyLink()) return;
  window.addEventListener('hashchange', redirectLegacyLink);
  try {
    const meta = await loadMeta();
    const [timeseries, salaries, techs] = await Promise.all([
      loadFile<TimeseriesFile>('timeseries.json', meta),
      loadFile<SalariesFile>('salaries.json', meta),
      loadFile<TechsFile>('techs.json', meta),
    ]);
    render(meta, timeseries, salaries, techs);
  } catch (error) {
    showError(error);
  }
}

void start();
