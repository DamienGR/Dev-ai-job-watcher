import { randomBytes } from 'node:crypto';
import { mkdir, readdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { dirname, join, relative, sep } from 'node:path';
import { makeStores, type BlobStore, type Stores } from './store';

/** Suffixe des fichiers en cours d'écriture, invisibles pour `list`. */
const TMP_SUFFIX = '.tmp';

/**
 * Store sur disque (`<dir>/<clé>`) : stores du VPS (D21) et exécutions locales des scripts.
 * Chaque écriture est atomique (fichier temporaire puis renommage, SPEC.md §3.4) : un job
 * interrompu ne laisse jamais de fichier à moitié écrit sous une vraie clé.
 */
export class FileStore implements BlobStore {
  constructor(private readonly dir: string) {}

  private path(key: string): string {
    if (key.split('/').some((part) => part === '..' || part === '') || key.endsWith(TMP_SUFFIX)) {
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
    const tmp = `${path}.${randomBytes(6).toString('hex')}${TMP_SUFFIX}`;
    try {
      await writeFile(tmp, data);
      await rename(tmp, path);
    } catch (error) {
      await rm(tmp, { force: true });
      throw error;
    }
  }

  async list(prefix: string): Promise<string[]> {
    try {
      const entries = await readdir(this.dir, { recursive: true, withFileTypes: true });
      return entries
        .filter((entry) => entry.isFile() && !entry.name.endsWith(TMP_SUFFIX))
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
