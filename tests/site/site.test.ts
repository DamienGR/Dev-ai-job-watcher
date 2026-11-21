import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { PAGES, SITE, type SitePage } from '../../web/site/config';
import { siteInputs } from '../../web/site/plugin';
import { escapeHtml, renderByline, renderContent, renderMarkdown, renderPage } from '../../web/site/template';
import { legacyDashboardUrl } from '../../web/src/site/legacy';

const ROOT = join(import.meta.dirname, '..', '..');
const WEB = join(ROOT, 'web');

function build(page: SitePage): string {
  const html = readFileSync(join(WEB, page.file), 'utf8');
  const content = page.content ? readFileSync(join(WEB, 'content', page.content), 'utf8') : undefined;
  return renderPage(html, page, content);
}

const page = (id: string) => PAGES.find((p) => p.id === id)!;

describe('anciens liens du tableau de bord (SPEC.md §17.4, exigé)', () => {
  it('mène une adresse /#/<page>?<filtres> vers /tableau-de-bord/, fragment conservé', () => {
    expect(legacyDashboardUrl('#/metiers?region=11&periode=6m')).toBe('/tableau-de-bord/#/metiers?region=11&periode=6m');
    expect(legacyDashboardUrl('#/carte')).toBe('/tableau-de-bord/#/carte');
    expect(legacyDashboardUrl('#/')).toBe('/tableau-de-bord/#/');
  });

  it('laisse l’accueil tel quel sans ancien fragment', () => {
    expect(legacyDashboardUrl('')).toBeNull();
    expect(legacyDashboardUrl('#')).toBeNull();
    expect(legacyDashboardUrl('#contenu')).toBeNull();
  });
});

describe('pages du site (SPEC.md §17.2)', () => {
  it('donne à chaque page un fichier d’entrée et une entrée de build', () => {
    expect(Object.keys(siteInputs(WEB)).sort()).toEqual(PAGES.map((p) => p.id).sort());
    for (const p of PAGES) {
      expect(existsSync(join(WEB, p.file)), p.file).toBe(true);
      expect(p.path === '/404.html' || p.path.endsWith('/'), p.path).toBe(true);
    }
    expect(page('tableau-de-bord').file).toBe('tableau-de-bord/index.html');
    expect(page('404').file).toBe('404.html');
  });

  it('remplit tous les marqueurs, avec un seul titre de niveau 1 par page', () => {
    for (const p of PAGES) {
      const html = build(p);
      expect(html, p.file).not.toMatch(/site:(head|header|content|footer)/);
      expect(html.match(/<h1[\s>]/g)?.length, p.file).toBe(1);
      expect(html, p.file).toContain('<main id="contenu"');
    }
  });

  it('garde tout le site hors des moteurs jusqu’au lancement (D47)', () => {
    expect(SITE.indexable).toBe(false);
    for (const p of PAGES) expect(build(p), p.file).toContain('<meta name="robots" content="noindex" />');
  });

  it('donne titre, description, URL canonique et image de partage à chaque page', () => {
    for (const p of PAGES) {
      const html = build(p);
      expect(html).toContain(`<meta name="description" content="${escapeHtml(p.description)}" />`);
      expect(html).toMatch(/<title>[^<]+<\/title>/);
      const image = /<meta property="og:image" content="([^"]+)"/.exec(html)?.[1];
      expect(image, p.file).toMatch(new RegExp(`^${SITE.url}/og/[\\w-]+\\.png$`));
      expect(existsSync(join(WEB, 'public', image!.slice(SITE.url.length))), image).toBe(true);
      if (p.error) expect(html).not.toContain('rel="canonical"');
      else expect(html).toContain(`<link rel="canonical" href="${SITE.url}${p.path}" />`);
    }
    expect(build(page('tableau-de-bord'))).toContain('<title>Tableau de bord · Baromètre emploi Dev &amp; IA</title>');
    expect(build(page('accueil'))).toContain('<title>Baromètre emploi Dev &amp; IA</title>');
  });

  it('suit l’ordre de navigation de SPEC.md §17.3 (Analyses viendra au lot S6)', () => {
    const nav = /<nav class="site-nav" aria-label="Site">(.*?)<\/nav>/.exec(build(page('accueil')))?.[1] ?? '';
    expect([...nav.matchAll(/<a href="([^"]+)">([^<]+)<\/a>/g)].map((m) => [m[1], m[2]])).toEqual([
      ['/tableau-de-bord/', 'Tableau de bord'],
      ['/ia/', 'L’IA dans ce projet'],
      ['/methodologie/', 'Méthodologie'],
      ['/a-propos/', 'À propos'],
    ]);
  });

  it('marque la page courante dans la navigation', () => {
    const dashboard = build(page('tableau-de-bord'));
    expect(dashboard).toContain('<a href="/tableau-de-bord/" aria-current="page">Tableau de bord</a>');
    expect(dashboard).not.toContain('<a class="logo" href="/" aria-current="page">');
    expect(build(page('accueil'))).toContain('<a class="logo" href="/" aria-current="page">');
    expect(build(page('mentions-legales'))).not.toContain('aria-current');
  });

  it('prépare sur l’accueil les emplacements des chiffres, de la courbe et de « ce qui bouge »', () => {
    const home = build(page('accueil'));
    for (const slot of ['figures', 'trend', 'movers']) expect(home).toContain(`data-home-${slot}`);
    expect(home).toContain('<a class="button" href="/tableau-de-bord/">');
  });

  it('mène de l’accueil au tableau de bord, à « L’IA dans ce projet » et à la méthodologie (§17.2)', () => {
    const home = build(page('accueil'));
    for (const href of ['/tableau-de-bord/', '/ia/', '/methodologie/']) expect(home).toContain(`href="${href}"`);
  });

  it('lit en direct la qualité des derniers runs sur la page Méthodologie (§17.2)', () => {
    const html = build(page('methodologie'));
    expect(html).toContain('<div class="quality" data-quality>');
    expect(html).toContain('<script type="module" src="/src/methodologie.ts"></script>');
  });

  it('donne sur la page À propos les liens LinkedIn, GitHub et dg-tech.dev, sans formulaire (D49)', () => {
    const html = build(page('a-propos'));
    expect(html).toContain('href="https://www.linkedin.com/in/');
    expect(html).toContain('href="https://github.com/DamienGR"');
    expect(html).toContain(`href="${SITE.author.site}"`);
    expect(html).not.toMatch(/<form[\s>]/);
  });

  it('relie chaque page aux mentions légales et à la page 404 vers l’accueil et le tableau de bord', () => {
    for (const p of PAGES) expect(build(p)).toContain('<a href="/mentions-legales/">Mentions légales</a>');
    const notFound = build(page('404'));
    expect(notFound).toContain('href="/"');
    expect(notFound).toContain('href="/tableau-de-bord/"');
  });
});

describe('textes rédigés avec l’IA (SPEC.md §17.1, exigé ; D51)', () => {
  const texts = PAGES.filter((p) => p.content);

  it('place la mention de rédaction avec Claude sous le titre de chaque page de texte', () => {
    expect(texts.map((p) => p.id).sort()).toEqual(['a-propos', 'ia', 'mentions-legales', 'methodologie']);
    for (const p of texts) {
      expect(build(p), p.file).toMatch(/<\/h1>\n\s*<p class="byline">Texte rédigé avec Claude, relu et validé par Damien Gros\. Mis à jour le \d{1,2} [a-zéû]+ \d{4}\.<\/p>/);
    }
    expect(renderByline('2026-11-21')).toContain('Mis à jour le 21 novembre 2026.');
  });

  it('le rappelle dans le pied de page de tout le site', () => {
    for (const p of PAGES) expect(build(p), p.file).toContain(', écrit avec <a href="/ia/">Claude</a>');
  });

  it('refuse un texte sans date de révision ou sans titre', () => {
    const text = page('ia');
    expect(() => renderContent({ ...text, updated: undefined }, '# Titre')).toThrow(/date de révision du texte manquante/);
    expect(() => renderContent(text, 'Pas de titre')).toThrow(/titre de niveau 1/);
    expect(() => renderByline('21/11/2026')).toThrow(/date de révision invalide/);
  });
});

describe('liens des textes (critère du lot S4)', () => {
  const repoFile = new RegExp(`^${SITE.repository.replace(/[.]/g, '\\.')}/blob/main/(.+)$`);
  const links = readdirSync(join(WEB, 'content'))
    .filter((f) => f.endsWith('.md'))
    .flatMap((f) => [...readFileSync(join(WEB, 'content', f), 'utf8').matchAll(/\]\(([^)\s]+)\)/g)].map((m) => ({ file: f, href: m[1]! })));

  it('pointe vers des fichiers qui existent dans le dépôt', () => {
    const files = links.filter((l) => repoFile.test(l.href));
    expect(files.length).toBeGreaterThan(5);
    for (const { file, href } of files) expect(existsSync(join(ROOT, repoFile.exec(href)![1]!)), `${file} : ${href}`).toBe(true);
  });

  it('pointe vers des pages du site qui existent', () => {
    const paths = new Set(PAGES.map((p) => p.path));
    const internal = links.filter((l) => l.href.startsWith('/'));
    expect(internal.length).toBeGreaterThan(3);
    for (const { file, href } of internal) expect(paths.has(href.split('#')[0]!), `${file} : ${href}`).toBe(true);
  });
});

describe('gabarit', () => {
  it('échappe les textes injectés', () => {
    expect(escapeHtml(`<a href="x">L'IA & co</a>`)).toBe('&lt;a href=&quot;x&quot;&gt;L&#39;IA &amp; co&lt;/a&gt;');
  });

  it('refuse une page sans marqueur ou sans son texte', () => {
    expect(() => renderPage('<head>\n<!-- site:head -->\n</head>', page('accueil'))).toThrow(/site:header absent/);
    expect(() => renderPage('', page('mentions-legales'))).toThrow(/texte mentions-legales\.md manquant/);
  });

  it('convertit le Markdown des pages de texte', () => {
    expect(renderMarkdown('## Titre\n\nUn [lien](https://example.org) et du **gras**.\n\n- a\n- b')).toBe(
      '<h2>Titre</h2>\n<p>Un <a href="https://example.org">lien</a> et du <strong>gras</strong>.</p>\n<ul>\n<li>a</li>\n<li>b</li>\n</ul>',
    );
  });
});

describe('en-têtes de sécurité (netlify.toml)', () => {
  const toml = readFileSync(join(import.meta.dirname, '..', '..', 'netlify.toml'), 'utf8');
  const csp = /Content-Security-Policy = "([^"]+)"/.exec(toml)?.[1] ?? '';

  it('n’autorise que les scripts du site', () => {
    expect(csp).toMatch(/script-src 'self';/);
    expect(csp).toContain("frame-ancestors 'none'");
  });

  it('laisse passer les tuiles de la carte', () => {
    const carte = readFileSync(join(WEB, 'src', 'pages', 'carte.ts'), 'utf8');
    const tiles = /tileLayer\('(https:\/\/[^/]+)/.exec(carte)?.[1];
    expect(tiles).toBeDefined();
    expect(csp).toMatch(new RegExp(`img-src [^;]*${tiles!.replace(/\./g, '\\.')}`));
  });
});
