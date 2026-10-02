import { makeStores, type BlobStore, type StoreName } from './store';

/** Store en mémoire, pour les tests. */
export class MemoryStore implements BlobStore {
  readonly data = new Map<string, Uint8Array>();

  async get(key: string): Promise<Uint8Array | null> {
    return this.data.get(key) ?? null;
  }

  async set(key: string, data: Uint8Array): Promise<void> {
    this.data.set(key, data);
  }

  async list(prefix: string): Promise<string[]> {
    return [...this.data.keys()].filter((key) => key.startsWith(prefix)).sort();
  }

  async delete(key: string): Promise<void> {
    this.data.delete(key);
  }
}

export function memoryStores(): Record<StoreName, MemoryStore> {
  return makeStores(() => new MemoryStore());
}
