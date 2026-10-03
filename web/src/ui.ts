import { MASKED } from './lib/format';

// Petits outils DOM du dashboard. Tout texte passe par `textContent` (createTextNode) :
// aucun libellé n'est injecté en HTML brut.

export type Child = Node | string | number | null | undefined | false | Child[];
type Attrs = Record<string, string | number | boolean | null | undefined | ((event: Event) => void)>;

export function h<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Attrs | null = null, ...children: Child[]): HTMLElementTagNameMap[K] {
  const element = document.createElement(tag);
  for (const [name, value] of Object.entries(attrs ?? {})) {
    if (value === null || value === undefined || value === false) continue;
    if (typeof value === 'function') element.addEventListener(name.replace(/^on/, ''), value);
    else if (value === true) element.setAttribute(name, '');
    else element.setAttribute(name, String(value));
  }
  append(element, children);
  return element;
}

export function append(parent: Node, children: Child[]): void {
  for (const child of children) {
    if (child === null || child === undefined || child === false) continue;
    if (Array.isArray(child)) append(parent, child);
    else parent.appendChild(child instanceof Node ? child : document.createTextNode(String(child)));
  }
}

/** Valeur masquée (SPEC.md §8.3). */
export function masked(): HTMLElement {
  return h('span', { class: 'masked', title: 'Moins de 5 observations : valeur masquée' }, MASKED);
}

/** Valeur formatée, ou « n < 5 ». */
export function valueOr(value: number | null | undefined, format: (v: number) => string): Child {
  return value === null || value === undefined ? masked() : format(value);
}

/** Pastille « partiel » des semaines et mois incomplets (hachurés sur les courbes). */
export function partialBadge(text = 'partiel'): HTMLElement {
  return h('span', { class: 'badge badge-partial', title: 'Période incomplète : rattrapage avant le premier run ou collecte incomplète' }, text);
}

/** Note sous un titre : filtres actifs que l'indicateur ne sait pas appliquer. */
export function ignoredNote(ignored: string[]): Child {
  if (!ignored.length) return null;
  return h('p', { class: 'note' }, `Non filtrable par ${ignored.join(', ')} : chiffres pour tout le périmètre.`);
}

export function card(title: string, ...content: Child[]): HTMLElement {
  return h('section', { class: 'card' }, h('h2', null, title), ...content);
}

export interface TileSpec {
  label: string;
  value: Child;
  detail?: Child;
  partial?: boolean;
  /** Valeur longue (deux nombres) : police réduite pour tenir sur une ligne. */
  compact?: boolean;
}

export function tile({ label, value, detail, partial, compact }: TileSpec): HTMLElement {
  return h(
    'div',
    { class: 'tile' },
    h('p', { class: 'tile-label' }, label, partial ? [' ', partialBadge()] : null),
    h('p', { class: compact ? 'tile-value tile-value-compact' : 'tile-value' }, value),
    detail ? h('p', { class: 'tile-detail' }, detail) : null,
  );
}

export interface Column<T> {
  label: string;
  numeric?: boolean;
  /** Colonne masquée sur mobile (son contenu doit être repris ailleurs dans la ligne). */
  secondary?: boolean;
  title?: string;
  render: (row: T) => Child;
}

function columnClass<T>(column: Column<T>): string | null {
  return [column.numeric ? 'num' : '', column.secondary ? 'col-secondary' : ''].filter(Boolean).join(' ') || null;
}

/** Tableau accessible, défilant horizontalement sur mobile. */
export function dataTable<T>(columns: Column<T>[], rows: readonly T[], caption?: string): HTMLElement {
  return h(
    'div',
    { class: 'table-wrap', tabindex: 0 },
    h(
      'table',
      null,
      caption ? h('caption', null, caption) : null,
      h('thead', null, h('tr', null, columns.map((c) => h('th', { scope: 'col', class: columnClass(c), title: c.title }, c.label)))),
      h(
        'tbody',
        null,
        rows.length
          ? rows.map((row) => h('tr', null, columns.map((c) => h('td', { class: columnClass(c) }, c.render(row)))))
          : h('tr', null, h('td', { colspan: columns.length, class: 'empty' }, 'Aucune donnée pour ces filtres.')),
      ),
    ),
  );
}

/** Bande p25–p75 et médiane sur une échelle commune (tableaux de salaires). */
export function rangeBar(p25: number, p50: number, p75: number, min: number, max: number): HTMLElement {
  const pos = (v: number) => `${(((v - min) / (max - min || 1)) * 100).toFixed(1)}%`;
  const bar = h('span', { class: 'range', 'aria-hidden': 'true' });
  const band = h('span', { class: 'range-band' });
  band.style.left = pos(p25);
  band.style.width = `calc(${pos(p75)} - ${pos(p25)})`;
  const median = h('span', { class: 'range-median' });
  median.style.left = pos(p50);
  bar.append(band, median);
  return bar;
}

/** Pastille de couleur d'une série (légende des tableaux et de la carte). */
export function swatch(color: string): HTMLElement {
  const span = h('span', { class: 'swatch', 'aria-hidden': 'true' });
  span.style.background = color;
  return span;
}
