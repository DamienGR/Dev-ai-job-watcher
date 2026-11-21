import type { Review } from '../pipeline/aggregates/review';
import { NetlifyBlobStore } from '../storage/netlify';
import type { BlobStore } from '../storage/store';
import { fileNameAfter } from './http';
import { renderReviewMarkdown } from './reviewMarkdown';

export const EXPORT_PREFIX = '/api/export/';

const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;
/** L'export du mois en cours change à chaque run : cache court. */
const CACHE = 'public, max-age=300';

export interface ExportDeps {
  /** Store `aggregates` ; Netlify Blobs par défaut, ouvert à la requête. */
  store?: () => BlobStore;
  now?: () => Date;
}

const monthFormat = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit' });

/** Mois écoulé (AAAA-MM, Europe/Paris) : celui que lit la revue du premier mardi du mois. */
export function previousMonth(now: Date): string {
  const parts = monthFormat.formatToParts(now);
  const year = Number(parts.find((p) => p.type === 'year')?.value);
  const month = Number(parts.find((p) => p.type === 'month')?.value);
  return month === 1 ? `${year - 1}-12` : `${year}-${String(month - 1).padStart(2, '0')}`;
}

/**
 * `GET /api/export/taxonomy-review(.md|.json)?month=AAAA-MM` (SPEC.md §3.3, §9.1) : export de
 * revue mensuelle, mis en forme à partir de `review/AAAA-MM.json` envoyé par le VPS. Mois
 * écoulé par défaut. Lecture publique : seulement des comptages et des intitulés (D65).
 */
export function createExportHandler(deps: ExportDeps = {}) {
  const openStore = deps.store ?? (() => new NetlifyBlobStore('aggregates'));
  const now = deps.now ?? (() => new Date());
  return async (req: Request): Promise<Response> => {
    if (req.method !== 'GET') return Response.json({ error: 'méthode non autorisée' }, { status: 405 });
    const name = fileNameAfter(req, EXPORT_PREFIX);
    const format = name === 'taxonomy-review.md' ? 'md' : name === 'taxonomy-review.json' ? 'json' : null;
    if (!format) return Response.json({ error: 'export inconnu : taxonomy-review.md ou taxonomy-review.json' }, { status: 404 });

    const month = new URL(req.url).searchParams.get('month') ?? previousMonth(now());
    if (!MONTH.test(month)) return Response.json({ error: `mois invalide : ${month} (attendu : AAAA-MM)` }, { status: 400 });

    const store = openStore();
    const data = await store.get(`review/${month}.json`);
    if (data === null) {
      const available = (await store.list('review/')).map((key) => key.slice('review/'.length, -'.json'.length));
      return Response.json(
        { error: `aucune revue préparée pour ${month}`, available },
        { status: 404, headers: { 'cache-control': 'no-cache' } },
      );
    }
    if (format === 'json') {
      return new Response(data, { status: 200, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': CACHE } });
    }
    const review = JSON.parse(new TextDecoder().decode(data)) as Review;
    return new Response(renderReviewMarkdown(review), {
      status: 200,
      headers: { 'content-type': 'text/markdown; charset=utf-8', 'cache-control': CACHE },
    });
  };
}
