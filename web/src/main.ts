import './site/site';
import './styles.css';
import { loadFile, loadMeta, NoDataError } from './data';
import { DEFAULT_FILTERS, filtersToParams, NON_CLASSE, parseFilters, PERIODS, scopeOf, type Filters } from './lib/filters';
import type { Meta } from './lib/types';
import type { Page, PageContext } from './page';
import { cartePage } from './pages/carte';
import { groupLabel, regionLabel } from './pages/common';
import { metiersPage } from './pages/metiers';
import { overviewPage } from './pages/overview';
import { qualitePage } from './pages/qualite';
import { salairesPage } from './pages/salaires';
import { append, h } from './ui';

// Tableau de bord (SPEC.md §8), sous `/tableau-de-bord/` (§17.2) : pages en hash
// (`#/metiers?region=11`), filtres globaux dans l'URL. En-tête, thème et pied de page viennent
// du gabarit commun du site (`web/site/`, `site/site.ts`).

const PAGES: Page[] = [overviewPage, metiersPage, salairesPage, cartePage, qualitePage];

interface Route {
  page: Page;
  params: URLSearchParams;
}

function readRoute(): Route {
  const [path = '', query = ''] = location.hash.replace(/^#\/?/, '').split('?');
  return { page: PAGES.find((p) => p.id === path) ?? PAGES[0]!, params: new URLSearchParams(query) };
}

function hrefFor(page: Page, filters: Filters, pageParams?: URLSearchParams): string {
  const params = filtersToParams(filters);
  for (const [key, value] of pageParams ?? []) if (page.params?.includes(key)) params.set(key, value);
  const query = params.toString();
  return `#/${page.id}${query ? `?${query}` : ''}`;
}

const SITE_NAME = document.querySelector<HTMLMetaElement>('meta[property="og:site_name"]')?.content ?? '';

const shell = {
  nav: h('nav', { class: 'tabs', 'aria-label': 'Pages du tableau de bord' }),
  filters: h('div', { class: 'filters-slot' }),
  main: h('main', { id: 'contenu', tabindex: -1 }),
};

let disposers: (() => void)[] = [];
let renderToken = 0;

function multiSelect(label: string, options: { value: string; label: string; group?: string }[], selected: string[], onChange: (values: string[]) => void): HTMLElement {
  const current = new Set(selected);
  const summary = selected.length ? `${label} (${selected.length})` : `${label} : tous`;
  const groups = [...new Set(options.map((o) => o.group ?? ''))];
  return h(
    'details',
    { class: 'multi' },
    h('summary', null, summary),
    h(
      'div',
      { class: 'multi-panel' },
      groups.map((group) =>
        h(
          'fieldset',
          null,
          group ? h('legend', null, group) : null,
          options
            .filter((o) => (o.group ?? '') === group)
            .map((o) =>
              h(
                'label',
                null,
                h('input', {
                  type: 'checkbox',
                  value: o.value,
                  checked: current.has(o.value),
                  onchange: (event: Event) => {
                    const input = event.target as HTMLInputElement;
                    if (input.checked) current.add(o.value);
                    else current.delete(o.value);
                    onChange(options.map((x) => x.value).filter((v) => current.has(v)));
                  },
                }),
                ` ${o.label}`,
              ),
            ),
        ),
      ),
      selected.length ? h('button', { type: 'button', class: 'link', onclick: () => onChange([]) }, 'Tout désélectionner') : null,
    ),
  );
}

function filterBar(meta: Meta, filters: Filters, route: Route): HTMLElement {
  const go = (patch: Partial<Filters>) => {
    location.hash = hrefFor(route.page, { ...filters, ...patch }, route.params);
  };
  const select = (label: string, value: string, options: [string, string, boolean?][], onChange: (v: string) => void) =>
    h(
      'label',
      { class: 'field' },
      h('span', null, label),
      h(
        'select',
        { onchange: (e: Event) => onChange((e.target as HTMLSelectElement).value) },
        options.map(([v, text, disabled]) => h('option', { value: v, selected: v === value, disabled }, text)),
      ),
    );
  const visibleGroups = scopeOf(meta, { ...filters, groups: [], roles: [] }).groups;
  const roleGroups = filters.groups.length ? filters.groups : visibleGroups;
  const roles = meta.labels.roles
    .filter((r) => roleGroups.includes(r.group) && r.id !== NON_CLASSE)
    .map((r) => ({ value: r.id, label: r.label, group: groupLabel(meta, r.group) }));
  const metro = meta.labels.regions.filter((r) => !r.drom);
  const drom = meta.labels.regions.filter((r) => r.drom);
  const isDefault = filtersToParams(filters).toString() === '';

  const details = h(
    'details',
    { class: 'filters', open: matchMedia('(min-width: 900px)').matches },
    h('summary', null, 'Filtres', isDefault ? '' : ' (actifs)'),
    h(
      'div',
      { class: 'filters-row' },
      select('Période', filters.period, PERIODS.map((p) => [p.id, p.label]), (v) => go({ period: v as Filters['period'] })),
      select(
        'Région',
        filters.region,
        [['*', 'France entière'], ...metro.map((r): [string, string] => [r.code, r.label]), ...drom.map((r): [string, string] => [r.code, `${r.label} (DROM)`])],
        (v) => go({ region: v }),
      ),
      multiSelect('Groupes', visibleGroups.map((g) => ({ value: g, label: groupLabel(meta, g) })), filters.groups, (groups) =>
        go({ groups, roles: filters.roles.filter((r) => groups.length === 0 || groups.includes(meta.labels.roles.find((x) => x.id === r)?.group ?? '')) }),
      ),
      multiSelect('Rôles', roles, filters.roles, (selected) => go({ roles: selected })),
      select(
        'Source',
        filters.source,
        [['*', 'Toutes'], ...meta.sources.map((s): [string, string] => [s.id, s.label]), ...(meta.sources.some((s) => s.id === 'adzuna') ? [] : [['adzuna', 'Adzuna (à venir)', true] as [string, string, boolean]])],
        (v) => go({ source: v }),
      ),
      select('Contrat', filters.contract, [['*', 'Tous'], ...Object.entries(meta.labels.contracts)], (v) => go({ contract: v })),
      h(
        'label',
        { class: 'field field-check' },
        h('input', { type: 'checkbox', checked: filters.wide, onchange: (e: Event) => go({ wide: (e.target as HTMLInputElement).checked, groups: [], roles: [] }) }),
        h('span', null, 'Inclure le périmètre élargi et les non classés'),
      ),
      isDefault ? null : h('a', { class: 'reset', href: hrefFor(route.page, DEFAULT_FILTERS, route.params) }, 'Réinitialiser'),
    ),
  );
  return details;
}

async function render(meta: Meta): Promise<void> {
  const token = ++renderToken;
  const route = readRoute();
  const filters = parseFilters(route.params, meta);
  const scope = scopeOf(meta, filters);
  for (const dispose of disposers) dispose();
  disposers = [];

  shell.nav.replaceChildren(
    ...PAGES.map((p) => h('a', { href: hrefFor(p, filters), 'aria-current': p === route.page ? 'page' : null }, p.title)),
  );
  shell.filters.replaceChildren(route.page.id === 'qualite' ? '' : filterBar(meta, filters, route));
  document.title = `${route.page.title} · Tableau de bord · ${SITE_NAME}`;

  const root = h('div', { class: 'page' });
  const heading = h(
    'div',
    { class: 'page-head' },
    h('h1', null, route.page.title),
    route.page.id === 'qualite' ? null : h('p', { class: 'note' }, describe(meta, filters)),
  );
  shell.main.replaceChildren(heading, root);
  root.classList.add('loading');

  const ctx: PageContext = {
    meta,
    filters,
    scope,
    params: route.params,
    root,
    load: (name) => loadFile(name, meta),
    onDispose: (fn) => disposers.push(fn),
    setParam: (name, value) => {
      const params = new URLSearchParams(route.params);
      if (value === null) params.delete(name);
      else params.set(name, value);
      location.hash = hrefFor(route.page, filters, params);
    },
  };
  try {
    await route.page.render(ctx);
  } catch (error) {
    if (token !== renderToken) return;
    root.replaceChildren(h('p', { class: 'empty' }, `Impossible d’afficher la page : ${error instanceof Error ? error.message : String(error)}`));
  }
  if (token === renderToken) root.classList.remove('loading');
}

function describe(meta: Meta, filters: Filters): string {
  const parts = [PERIODS.find((p) => p.id === filters.period)!.label, regionLabel(meta, filters.region)];
  if (filters.groups.length) parts.push(filters.groups.map((g) => groupLabel(meta, g)).join(', '));
  if (filters.roles.length) parts.push(`${filters.roles.length} rôle(s)`);
  if (filters.contract !== '*') parts.push(meta.labels.contracts[filters.contract] ?? filters.contract);
  if (filters.wide) parts.push('périmètre élargi inclus');
  return parts.join(' · ');
}

async function start(): Promise<void> {
  const app = document.getElementById('app')!;
  app.replaceChildren();
  append(app, [shell.nav, shell.filters, shell.main]);

  let meta: Meta;
  try {
    meta = await loadMeta();
  } catch (error) {
    shell.main.replaceChildren(
      h(
        'div',
        { class: 'page-head' },
        h('h1', null, 'Tableau de bord en préparation'),
        h(
          'p',
          { class: 'note' },
          error instanceof NoDataError
            ? 'Aucun indicateur n’a encore été publié. Ils apparaîtront après le premier run hebdomadaire.'
            : `Les données sont momentanément indisponibles (${error instanceof Error ? error.message : String(error)}).`,
        ),
      ),
    );
    return;
  }
  window.addEventListener('hashchange', () => {
    void render(meta);
  });
  window.addEventListener('themechange', () => void render(meta));
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => void render(meta));
  await render(meta);
}

void start();
