import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { defineConfig, type Connect, type Plugin } from 'vite';
import { siteInputs, sitePages } from './web/site/plugin';

/**
 * En local (`npm run dev:web`, `vite preview`), `/api/data/:name` lit les agrégats produits par
 * `npm run process` dans `<DATA_DIR>/aggregates` (`.data` par défaut), comme `api-data` en
 * production.
 */
function localData(): Plugin {
  const dir = join(process.env.DATA_DIR ?? '.data', 'aggregates');
  const middleware: Connect.NextHandleFunction = async (req, res, next) => {
    const url = new URL(req.url ?? '/', 'http://localhost');
    if (!url.pathname.startsWith('/api/data/')) return next();
    const name = decodeURIComponent(url.pathname.slice('/api/data/'.length));
    try {
      if (!/^(review\/)?[\w-]+\.json$/.test(name)) throw new Error('fichier inconnu');
      const body = await readFile(join(dir, ...name.split('/')));
      res.setHeader('content-type', 'application/json; charset=utf-8');
      res.end(body);
    } catch {
      res.statusCode = 404;
      res.end('{"error":"introuvable"}');
    }
  };
  return {
    name: 'local-aggregates',
    configureServer: (server) => void server.middlewares.use(middleware),
    configurePreviewServer: (server) => void server.middlewares.use(middleware),
  };
}

const webRoot = resolve(import.meta.dirname, 'web');

// Site public statique (SPEC.md §17) : une page HTML par rubrique, dont le tableau de bord
// (§8) ; servi par Netlify depuis `web/dist`.
export default defineConfig({
  root: 'web',
  appType: 'mpa',
  plugins: [sitePages(webRoot), localData()],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    target: 'es2022',
    rollupOptions: { input: siteInputs(webRoot) },
  },
});
