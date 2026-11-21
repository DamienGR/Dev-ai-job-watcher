import { Marked } from 'marked';
import { parseChangelog, withChangelog } from './changelog';
import { PAGES, SITE, type SitePage } from './config';
import { escapeHtml, longDate } from './text';

export { escapeHtml };

// Gabarit commun du site (SPEC.md §17.3, §17.4) : métadonnées, en-tête, navigation, pied de
// page et textes Markdown, injectés au build dans chaque page HTML d'entrée à la place des
// marqueurs `<!-- site:head -->`, `<!-- site:header -->`, `<!-- site:content -->` et
// `<!-- site:footer -->`.

const MARKERS = ['head', 'header', 'content', 'footer'] as const;
type Marker = (typeof MARKERS)[number];

export function pageTitle(page: SitePage): string {
  return page.title === SITE.name ? SITE.name : `${page.title} · ${SITE.name}`;
}

export function pageUrl(page: SitePage): string {
  return `${SITE.url}${page.path}`;
}

export function ogImageUrl(page: SitePage): string {
  return `${SITE.url}/og/${page.ogImage ? page.id : 'accueil'}.png`;
}

export function renderHead(page: SitePage): string {
  const meta = (attr: 'name' | 'property', key: string, value: string) => `<meta ${attr}="${key}" content="${escapeHtml(value)}" />`;
  const title = pageTitle(page);
  const lines = [
    `<title>${escapeHtml(title)}</title>`,
    meta('name', 'description', page.description),
    SITE.indexable && !page.error ? null : meta('name', 'robots', 'noindex'),
    page.error ? null : `<link rel="canonical" href="${escapeHtml(pageUrl(page))}" />`,
    meta('property', 'og:type', 'website'),
    meta('property', 'og:site_name', SITE.name),
    meta('property', 'og:locale', SITE.locale),
    meta('property', 'og:title', title),
    meta('property', 'og:description', page.description),
    page.error ? null : meta('property', 'og:url', pageUrl(page)),
    meta('property', 'og:image', ogImageUrl(page)),
    meta('property', 'og:image:width', '1200'),
    meta('property', 'og:image:height', '630'),
    meta('property', 'og:image:alt', `${SITE.name} : ${page.title === SITE.name ? SITE.tagline : page.title}`),
    meta('name', 'twitter:card', 'summary_large_image'),
    '<link rel="icon" href="/favicon.svg" type="image/svg+xml" />',
    '<link rel="apple-touch-icon" href="/apple-touch-icon.png" />',
    // Thème enregistré appliqué avant le premier affichage (script classique, bloquant, 0,3 Ko).
    '<script src="/theme.js"></script>',
  ];
  return lines.filter((line) => line !== null).join('\n');
}

/** Logotype : une jauge de baromètre (même dessin que `public/favicon.svg`). */
const LOGO_SVG =
  '<svg class="logo-mark" viewBox="0 0 32 32" width="32" height="32" aria-hidden="true" focusable="false">' +
  '<rect class="logo-bg" width="32" height="32" rx="7" />' +
  '<path d="M7 21a9 9 0 0 1 18 0" fill="none" stroke="#fff" stroke-width="2.6" stroke-linecap="round" />' +
  '<path d="M16 21 21.5 13.5" stroke="#fff" stroke-width="2.6" stroke-linecap="round" />' +
  '<circle cx="16" cy="21" r="2.4" fill="#fff" /></svg>';

export function renderHeader(page: SitePage): string {
  // La page elle-même, ou sa rubrique pour une sous-page (le journal sous Méthodologie).
  const current = (p: SitePage) => (p.id === page.id ? ' aria-current="page"' : p.path !== '/' && page.path.startsWith(p.path) ? ' aria-current="true"' : '');
  const links = PAGES.filter((p) => p.nav).map((p) => `<a href="${p.path}"${current(p)}>${escapeHtml(p.nav!)}</a>`);
  const home = PAGES[0]!;
  return [
    '<header class="site-header">',
    '  <a class="skip" href="#contenu">Aller au contenu</a>',
    `  <a class="logo" href="/"${current(home)}>${LOGO_SVG}<span class="logo-text"><span class="logo-name">${escapeHtml(SITE.name)}</span><span class="logo-sub">${escapeHtml(SITE.tagline)}</span></span></a>`,
    `  <nav class="site-nav" aria-label="Site">${links.join('')}</nav>`,
    '  <button type="button" class="theme" data-theme-toggle hidden>Thème : système</button>',
    '</header>',
  ].join('\n');
}

export function renderFooter(): string {
  return [
    '<footer class="site-footer">',
    '  <p><strong>Source : France Travail</strong> · statistiques agrégées, aucune annonce republiée, aucune donnée personnelle.</p>',
    '  <p data-site-updated hidden></p>',
    '  <p class="site-footer-links">',
    '    <a href="/mentions-legales/">Mentions légales</a>',
    `    <a href="${SITE.repository}">Code source sur GitHub</a>`,
    `    <span>Un projet de <a href="${SITE.author.site}">${escapeHtml(SITE.author.name)} (${escapeHtml(SITE.author.label)})</a>, écrit avec <a href="/ia/">Claude</a></span>`,
    '  </p>',
    '</footer>',
  ].join('\n');
}

const markdown = new Marked({ gfm: true });

/** Texte éditorial du dépôt (contenu de confiance) converti en HTML. */
export function renderMarkdown(source: string): string {
  return markdown.parse(source, { async: false }).trim();
}

/**
 * Mention visible d'un texte rédigé avec l'IA (SPEC.md §17.1, exigé ; D51), datée de sa
 * dernière révision.
 */
export function renderByline(updated: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(updated)) throw new Error(`date de révision invalide : ${updated}`);
  return `<p class="byline">Texte rédigé avec Claude, relu et validé par ${escapeHtml(SITE.author.name)}. Mis à jour le ${longDate(updated)}.</p>`;
}

/**
 * Texte d'une page : Markdown converti, mention de rédaction placée sous le titre, journal de
 * la taxonomie inclus si la page le demande (`changelog`, source de `TAXONOMY_CHANGELOG.md`).
 */
export function renderContent(page: SitePage, source: string, changelog?: string): string {
  if (!page.updated) throw new Error(`${page.file} : date de révision du texte manquante`);
  if (page.changelog && changelog === undefined) throw new Error(`${page.file} : journal de la taxonomie manquant`);
  const text = renderMarkdown(source);
  const html = page.changelog ? withChangelog(text, parseChangelog(changelog!), SITE.repository) : text;
  const end = html.indexOf('</h1>');
  if (!html.startsWith('<h1') || end < 0) throw new Error(`${page.file} : le texte doit commencer par un titre de niveau 1`);
  const split = end + '</h1>'.length;
  return `${html.slice(0, split)}\n${renderByline(page.updated)}${html.slice(split)}`;
}

function marker(name: Marker): RegExp {
  return new RegExp(`^([ \\t]*)<!--\\s*site:${name}\\s*-->`, 'gm');
}

/** Décale chaque ligne de `block` de l'indentation du marqueur remplacé. */
function indent(block: string, prefix: string): string {
  return block
    .split('\n')
    .map((line) => (line ? prefix + line : line))
    .join('\n');
}

/**
 * Remplit les marqueurs d'une page ; `content` est le Markdown de la page, s'il y en a un, et
 * `changelog` la source du journal de la taxonomie pour une page qui l'inclut.
 */
export function renderPage(html: string, page: SitePage, content?: string, changelog?: string): string {
  if (page.content && content === undefined) throw new Error(`${page.file} : texte ${page.content} manquant`);
  const parts: Record<Marker, string | undefined> = {
    head: renderHead(page),
    header: renderHeader(page),
    content: content === undefined ? undefined : renderContent(page, content, changelog),
    footer: renderFooter(),
  };
  let out = html;
  for (const name of MARKERS) {
    const value = parts[name];
    const found = marker(name).test(out);
    if (value === undefined) {
      if (found) throw new Error(`${page.file} : marqueur site:${name} sans contenu`);
      continue;
    }
    if (!found) throw new Error(`${page.file} : marqueur site:${name} absent`);
    // Le texte n'est pas réindenté : un bloc `<pre>` garderait les espaces ajoutés.
    out = out.replace(marker(name), (_match, prefix: string) => (name === 'content' ? prefix + value : indent(value, prefix)));
  }
  return out;
}
