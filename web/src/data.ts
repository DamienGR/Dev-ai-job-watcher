import type { Meta } from './lib/types';

// Lecture des agrégats par `api-data` (SPEC.md §3.3). `meta.json` est relu à chaque
// chargement ; les autres fichiers sont demandés avec `?v=<meta.generatedAt>`, une adresse
// propre à chaque envoi, mise en cache par le navigateur et le CDN (D33).

export const DATA_BASE = '/api/data/';

export class NoDataError extends Error {
  override name = 'NoDataError';
}

/** `meta.json` est préchargé par `index.html` (même requête, servie sans cache par `api-data`). */
export async function loadMeta(): Promise<Meta> {
  const response = await fetch(`${DATA_BASE}meta.json`);
  if (response.status === 404) throw new NoDataError('aucun agrégat publié');
  if (!response.ok) throw new Error(`meta.json : HTTP ${response.status}`);
  return (await response.json()) as Meta;
}

const cache = new Map<string, Promise<unknown>>();

export function loadFile<T>(name: string, meta: Meta): Promise<T> {
  const url = `${DATA_BASE}${name}?v=${encodeURIComponent(meta.generatedAt)}`;
  let promise = cache.get(url);
  if (!promise) {
    promise = fetch(url).then(async (response) => {
      if (!response.ok) throw new Error(`${name} : HTTP ${response.status}`);
      return response.json();
    });
    promise.catch(() => cache.delete(url));
    cache.set(url, promise);
  }
  return promise as Promise<T>;
}
