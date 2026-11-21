import { loadFile, loadMeta, NoDataError } from './data';
import { weekAxis } from './lib/axis';
import { DEFAULT_FILTERS, scopeOf, type Scope } from './lib/filters';
import { weekFlow, type WeekFlow } from './lib/flow';
import { fmtInt, fmtPct, MASKED, orMasked } from './lib/format';
import { fmtRoleMove, fmtTechMove, headline, headlineFigures, type Figure } from './lib/headline';
import {
  aiShare,
  isPartialMonth,
  referenceMonth,
  referenceWeek,
  roleMovers,
  scopedNewOffers,
  sumSeries,
  techMovers,
  type Mover,
  type Movers,
  type NewOfferRow,
  type ShareValue,
  type PremiumRow,
  type TechRow,
  type TechTotalRow,
} from './lib/indicators';
import { monthLabel, weekLabel, weekLongLabel, weekRange } from './lib/periods';
import { rowsOf } from './lib/table';
import type { Meta, SalariesFile, TechsFile, TimeseriesFile } from './lib/types';
import { startCloud, type CloudTech } from './site/cloud';
import { startFlow } from './site/flow';
import { startGauge } from './site/gauge';
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

// --- Comparaison temporaire des pistes du visuel (aperçu de la PR, D70) -------------------
// `?visuel=jauge` (piste 2) et `?visuel=competences` (piste 3) ; sans paramètre, la piste 1.
// La piste écartée est retirée avant la fusion.

/** Familles de technologies propres à l'IA, sur fond teinté dans le nuage. */
const AI_FAMILIES = new Set(['llm_agents', 'model_providers', 'vector_search', 'ml', 'ai_dev_tools']);
const CLOUD_SIZE = 15;

function renderGauge(meta: Meta, rows: readonly NewOfferRow[], scope: Scope, ai: ShareValue): void {
  const figure = slot('flow');
  const caption = slot('flow-caption');
  if (!figure || !caption) return;
  const anyGroup = rows.filter((r) => scope.rowOk(r));
  const week = referenceWeek(meta);
  const weeks = weekRange(meta.firstRun, week);
  const series = weeks.map((w) => aiShare(anyGroup, meta, scope.groupOf, [w]).share);
  append(caption, [
    `Part IA des offres dev, data et IA, ${weekLongLabel(week)} (n = ${fmtInt(ai.total)}) et chaque semaine depuis le premier run`,
    h('span', { class: 'visually-hidden' }, ` : ${weeks.map((w, i) => `${weekLabel(w)}, ${orMasked(series[i], fmtPct)}`).join(' ; ')}.`),
  ]);
  startGauge(figure, { share: ai.share, weekNumber: Number(week.slice(-2)), series, firstLabel: weekLabel(weeks[0]!), lastLabel: weekLabel(week) });
}

function renderCloud(meta: Meta, techs: TechsFile, scope: Scope): void {
  const figure = slot('flow');
  const caption = slot('flow-caption');
  if (!figure || !caption) return;
  const month = referenceMonth(meta);
  const total = rowsOf<TechTotalRow>(techs.totals)
    .filter((t) => t.month === month && scope.groupOk(t.group))
    .reduce((a, t) => a + t.n, 0);
  const counts = new Map<string, number>();
  for (const t of rowsOf<TechRow>(techs.techs)) {
    if (t.month === month && scope.groupOk(t.group)) counts.set(t.tech, (counts.get(t.tech) ?? 0) + t.n);
  }
  if (total < 5 || !counts.size) {
    figure.hidden = true;
    return;
  }
  const rising = new Set(techMovers(rowsOf<TechRow>(techs.techs), rowsOf<TechTotalRow>(techs.totals), meta, scope).up.map((m) => m.id));
  const list: CloudTech[] = [...counts]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, CLOUD_SIZE)
    .map(([id, n]) => {
      const tech = meta.labels.technologies.find((t) => t.id === id);
      return { id, label: tech?.label ?? id, share: n / total, ai: AI_FAMILIES.has(tech?.family ?? ''), rising: rising.has(id) };
    });
  append(caption, [
    `Technologies les plus citées dans les offres dev, data et IA, ${monthLabel(month)} (n = ${fmtInt(total)}) ; taille selon leur part, ↑ en hausse sur 3 mois`,
    isPartialMonth(meta, month) ? [' ', partialBadge()] : null,
  ]);
  startCloud(figure, list);
}

function render(meta: Meta, timeseries: TimeseriesFile, salaries: SalariesFile, techs: TechsFile): void {
  const scope = scopeOf(meta, DEFAULT_FILTERS);
  const rows = rowsOf<NewOfferRow>(timeseries.newOffers);
  const scoped = scopedNewOffers(rows, scope);
  const head = headline(meta, rows, scope, rowsOf<PremiumRow>(salaries.aiPremium));

  slot('figures')?.replaceChildren(...headlineFigures(head).map(figureCard));
  const variant = new URLSearchParams(location.search).get('visuel');
  if (variant === 'jauge') renderGauge(meta, rows, scope, head.ai);
  else if (variant === 'competences') renderCloud(meta, techs, scope);
  else renderFlow(weekFlow(meta, rows), meta.taxonomy.version);

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
