import { promisify } from 'node:util';
import { gunzip, gzip } from 'node:zlib';

const gzipAsync = promisify(gzip);
const gunzipAsync = promisify(gunzip);

/** Stockage clé → octets, implémenté par Netlify Blobs, la mémoire (tests) ou le disque (scripts). */
export interface BlobStore {
  get(key: string): Promise<Uint8Array | null>;
  set(key: string, data: Uint8Array): Promise<void>;
  /** Clés commençant par `prefix`, triées. */
  list(prefix: string): Promise<string[]>;
  delete(key: string): Promise<void>;
}

/** Les cinq stores de SPEC.md §3.4. */
export const STORE_NAMES = ['raw', 'offers', 'index', 'aggregates', 'state'] as const;
export type StoreName = (typeof STORE_NAMES)[number];
export type Stores = Record<StoreName, BlobStore>;

export function makeStores<S extends BlobStore>(create: (name: StoreName) => S): Record<StoreName, S> {
  return {
    raw: create('raw'),
    offers: create('offers'),
    index: create('index'),
    aggregates: create('aggregates'),
    state: create('state'),
  };
}

export async function getJson<T>(store: BlobStore, key: string): Promise<T | null> {
  const data = await store.get(key);
  return data === null ? null : (JSON.parse(Buffer.from(data).toString('utf8')) as T);
}

export async function setJson(store: BlobStore, key: string, value: unknown): Promise<void> {
  await store.set(key, Buffer.from(JSON.stringify(value), 'utf8'));
}

export async function getGzipJson<T>(store: BlobStore, key: string): Promise<T | null> {
  const data = await store.get(key);
  return data === null ? null : (JSON.parse((await gunzipAsync(data)).toString('utf8')) as T);
}

export async function setGzipJson(store: BlobStore, key: string, value: unknown): Promise<void> {
  await store.set(key, await gzipAsync(Buffer.from(JSON.stringify(value), 'utf8')));
}

/** Supprime toutes les clés sous `prefix` ; renvoie le nombre de clés supprimées. */
export async function deletePrefix(store: BlobStore, prefix: string): Promise<number> {
  const keys = await store.list(prefix);
  for (const key of keys) await store.delete(key);
  return keys.length;
}

/** Écrit une liste d'objets en JSON Lines compressé (une ligne par objet). */
export async function setGzipJsonLines(store: BlobStore, key: string, items: readonly unknown[]): Promise<void> {
  const text = items.map((item) => JSON.stringify(item)).join('\n');
  await store.set(key, await gzipAsync(Buffer.from(text, 'utf8')));
}

/** Lit un fichier JSON Lines compressé ; `null` si la clé n'existe pas. */
export async function getGzipJsonLines<T>(store: BlobStore, key: string): Promise<T[] | null> {
  const data = await store.get(key);
  if (data === null) return null;
  const text = (await gunzipAsync(data)).toString('utf8');
  return text === '' ? [] : text.split('\n').map((line) => JSON.parse(line) as T);
}
