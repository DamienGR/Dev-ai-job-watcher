import { getStore, type Store } from '@netlify/blobs';
import { makeStores, type BlobStore, type StoreName, type Stores } from './store';

/** Store Netlify Blobs (site-wide). Lecture « strong » pour l'état des runs (SPEC.md §12). */
export class NetlifyBlobStore implements BlobStore {
  private readonly store: Store;

  constructor(name: StoreName) {
    this.store = getStore({ name, consistency: name === 'state' ? 'strong' : 'eventual' });
  }

  async get(key: string): Promise<Uint8Array | null> {
    const data: ArrayBuffer | null = await this.store.get(key, { type: 'arrayBuffer' });
    return data === null ? null : new Uint8Array(data);
  }

  async set(key: string, data: Uint8Array): Promise<void> {
    await this.store.set(key, data.slice().buffer);
  }

  async list(prefix: string): Promise<string[]> {
    const keys: string[] = [];
    for await (const page of this.store.list({ prefix, paginate: true })) {
      keys.push(...page.blobs.map((blob) => blob.key));
    }
    return keys.sort();
  }

  async delete(key: string): Promise<void> {
    await this.store.delete(key);
  }
}

/** Stores du site, à n'appeler que depuis une fonction Netlify (contexte injecté par la plateforme). */
export function netlifyStores(): Stores {
  return makeStores((name) => new NetlifyBlobStore(name));
}
