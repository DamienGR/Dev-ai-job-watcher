import { PAGES, SITE } from './config';
import { escapeHtml, pageUrl } from './template';

// Fichiers pour les moteurs (SPEC.md §17.5, D47), écrits au build par le plugin du site.
// Avant le lancement, `robots.txt` laisse les robots lire les pages, qui portent `noindex`, et
// aucun plan du site n'est publié. Au lancement (`SITE_INDEXABLE=1`), `robots.txt` annonce
// `sitemap.xml`, qui liste toutes les pages hors page d'erreur.

export function renderRobots(indexable = SITE.indexable): string {
  const lines = ['User-agent: *', 'Allow: /'];
  if (indexable) lines.push('', `Sitemap: ${SITE.url}/sitemap.xml`);
  return `${lines.join('\n')}\n`;
}

export function renderSitemap(): string {
  const urls = PAGES.filter((page) => !page.error).map((page) => {
    const lastmod = page.updated ? `<lastmod>${page.updated}</lastmod>` : '';
    return `  <url><loc>${escapeHtml(pageUrl(page))}</loc>${lastmod}</url>`;
  });
  return ['<?xml version="1.0" encoding="UTF-8"?>', '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">', ...urls, '</urlset>', ''].join('\n');
}

/**
 * Fichiers à publier à la racine du site, selon l'état de l'indexation. Refuse d'ouvrir
 * l'indexation sur l'adresse `netlify.app` : le domaine du site (D46) se branche d'abord.
 */
export function seoFiles(indexable = SITE.indexable, url = SITE.url): Record<string, string> {
  if (!indexable) return { 'robots.txt': renderRobots(false) };
  if (/\.netlify\.app$/.test(new URL(url).hostname)) {
    throw new Error(`indexation demandée sur ${url} : brancher d'abord le domaine du site (D46, SPEC.md §17.8)`);
  }
  return { 'robots.txt': renderRobots(true), 'sitemap.xml': renderSitemap() };
}
