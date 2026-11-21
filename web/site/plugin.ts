import { readFile } from 'node:fs/promises';
import { join, relative, sep } from 'node:path';
import type { Plugin } from 'vite';
import { PAGES, pageByFile } from './config';
import { seoFiles } from './seo';
import { renderPage } from './template';

/** Pages d'entrée du build, par identifiant (chemins absolus). */
export function siteInputs(webRoot: string): Record<string, string> {
  return Object.fromEntries(PAGES.map((page) => [page.id, join(webRoot, page.file)]));
}

/** Injecte le gabarit commun dans chaque page, en développement comme au build. */
export function sitePages(webRoot: string): Plugin {
  const contentDir = join(webRoot, 'content');
  return {
    name: 'site-pages',
    transformIndexHtml: {
      order: 'pre',
      handler: async (html, ctx) => {
        const file = relative(webRoot, ctx.filename).split(sep).join('/');
        const page = pageByFile(file);
        if (!page) throw new Error(`${file} : page absente de web/site/config.ts`);
        const content = page.content ? await readFile(join(contentDir, page.content), 'utf8') : undefined;
        return renderPage(html, page, content);
      },
    },
    generateBundle() {
      // `robots.txt` et, au lancement, `sitemap.xml` (SPEC.md §17.5).
      for (const [fileName, source] of Object.entries(seoFiles())) this.emitFile({ type: 'asset', fileName, source });
    },
    configureServer(server) {
      // Les textes ne sont pas des modules : une modification recharge la page.
      server.watcher.on('change', (file) => {
        if (file.startsWith(contentDir)) server.ws.send({ type: 'full-reload' });
      });
    },
  };
}
