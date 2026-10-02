import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join, relative, sep } from 'node:path';
import { makeStores, type BlobStore, type Stores } from './store';

/** Store sur disque (`<dir>/<clé>`), pour les exécutions locales des scripts. */
export class FileStore implements BlobStore {
  constructor(private readonly dir: string) {}

  private path(key: string): string {
    if (key.split('/').some((part) => part === '..' || part === '')) {
      throw new Error(`clé invalide : ${key}`);
    }
    return join(this.dir, ...key.split('/'));
  }

  async get(key: string): Promise<Uint8Array | null> {
    try {
      return await readFile(this.path(key));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
      throw error;
    }
  }

  async set(key: string, data: Uint8Array): Promise<void> {
    const path = this.path(key);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, data);
  }

  async list(prefix: string): Promise<string[]> {
    try {
      const entries = await readdir(this.dir, { recursive: true, withFileTypes: true });
      return entries
        .filter((entry) => entry.isFile())
        .map((entry) => relative(this.dir, join(entry.parentPath, entry.name)).split(sep).join('/'))
        .filter((key) => key.startsWith(prefix))
        .sort();
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
      throw error;
    }
  }

  async delete(key: string): Promise<void> {
    await rm(this.path(key), { force: true });
  }
}

export function fileStores(rootDir: string): Stores {
  return makeStores((name) => new FileStore(join(rootDir, name)));
}
