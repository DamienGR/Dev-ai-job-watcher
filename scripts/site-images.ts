import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { PAGES, SITE } from '../web/site/config';
import { escapeHtml } from '../web/site/template';

// Images du site (SPEC.md §17.3) : image de partage 1200 × 630 de chaque page qui en a une
// (`web/public/og/<id>.png`) et icône pour l'écran d'accueil des téléphones
// (`web/public/apple-touch-icon.png`). Outil ponctuel, relancé quand une page ou son titre
// change : `npm run site:images`. Il a besoin de Playwright et de Chromium, qui ne sont pas des
// dépendances du projet (`npx playwright install chromium`).

interface BrowserPage {
  setContent(html: string): Promise<void>;
  screenshot(options: { path: string; type: 'png' }): Promise<unknown>;
  close(): Promise<void>;
}
interface Browser {
  newPage(options: { viewport: { width: number; height: number }; deviceScaleFactor: number }): Promise<BrowserPage>;
  close(): Promise<void>;
}
const { chromium } = createRequire(import.meta.url)('playwright') as { chromium: { launch(): Promise<Browser> } };

const PUBLIC = join(import.meta.dirname, '..', 'web', 'public');
// Couleurs du thème clair (`web/src/site/site.css`) et des premières séries de la palette.
const COLORS = { page: '#f3f3f1', text: '#0b0b0b', secondary: '#52514e', accent: '#2a78d6', series: ['#2a78d6', '#eb6834', '#1baf7a', '#eda100'] };

function shareImage(title: string | null, description: string, logo: string): string {
  const arcs = COLORS.series
    .map((color, i) => {
      // Quatre secteurs d'une jauge en demi-cercle, à droite de l'image.
      const a0 = Math.PI * (1 - i / 4) - 0.03;
      const a1 = Math.PI * (1 - (i + 1) / 4) + 0.03;
      const r = 200;
      const [cx, cy] = [950, 470];
      const p = (a: number) => `${(cx + r * Math.cos(a)).toFixed(1)} ${(cy - r * Math.sin(a)).toFixed(1)}`;
      return `<path d="M ${p(a0)} A ${r} ${r} 0 0 1 ${p(a1)}" stroke="${color}" stroke-width="44" fill="none" />`;
    })
    .join('');
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><style>
    body { margin: 0; width: 1200px; height: 630px; background: ${COLORS.page}; font-family: Inter, system-ui, sans-serif; color: ${COLORS.text}; position: relative; overflow: hidden; }
    .gauge { position: absolute; inset: 0; }
    .text { position: absolute; left: 80px; top: 80px; width: 640px; }
    .brand { display: flex; align-items: center; gap: 20px; font-size: 34px; font-weight: 700; }
    .brand svg { width: 72px; height: 72px; }
    h1 { font-size: ${title ? 64 : 58}px; line-height: 1.08; margin: 56px 0 24px; letter-spacing: -0.02em; }
    p { font-size: 28px; line-height: 1.4; color: ${COLORS.secondary}; margin: 0; }
    .url { position: absolute; left: 80px; bottom: 64px; font-size: 26px; font-weight: 600; color: ${COLORS.accent}; }
  </style></head><body>
    <svg class="gauge" viewBox="0 0 1200 630">${arcs}<path d="M 950 470 L 1050 358" stroke="${COLORS.text}" stroke-width="16" stroke-linecap="round" /><circle cx="950" cy="470" r="24" fill="${COLORS.text}" /></svg>
    <div class="text">
      <div class="brand">${logo}<span>${escapeHtml(SITE.name)}</span></div>
      <h1>${escapeHtml(title ?? SITE.tagline)}</h1>
      <p>${escapeHtml(description)}</p>
    </div>
    <div class="url">barometre.dg-tech.dev</div>
  </body></html>`;
}

async function main(): Promise<void> {
  const logo = await readFile(join(PUBLIC, 'favicon.svg'), 'utf8');
  const browser = await chromium.launch();
  try {
    const og = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
    for (const page of PAGES.filter((p) => p.ogImage)) {
      const isHome = page.path === '/';
      const description = isHome ? 'Offres, métiers, salaires et régions, d’après les offres France Travail.' : page.description;
      await og.setContent(shareImage(isHome ? null : page.title, description, logo));
      await og.screenshot({ path: join(PUBLIC, 'og', `${page.id}.png`), type: 'png' });
      console.log(`og/${page.id}.png`);
    }
    await og.close();
    const icon = await browser.newPage({ viewport: { width: 180, height: 180 }, deviceScaleFactor: 1 });
    await icon.setContent(`<!doctype html><style>body{margin:0}svg{display:block;width:180px;height:180px}</style>${logo.replace('rx="7"', 'rx="0"')}`);
    await icon.screenshot({ path: join(PUBLIC, 'apple-touch-icon.png'), type: 'png' });
    console.log('apple-touch-icon.png');
  } finally {
    await browser.close();
  }
}

await main();
