import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { FileStore } from '../src/storage/filesystem';
import { MemoryStore } from '../src/storage/memory';
import { deletePrefix, getGzipJson, getJson, setGzipJson, setJson, type BlobStore } from '../src/storage/store';

const dir = await mkdtemp(join(tmpdir(), 'veille-store-'));
afterAll(() => rm(dir, { recursive: true, force: true }));

describe.each<[string, () => BlobStore]>([
  ['mémoire', () => new MemoryStore()],
  ['disque', () => new FileStore(join(dir, String(Math.random())))],
])('store %s', (_, create) => {
  it('lit, écrit, liste par préfixe et supprime', async () => {
    const store = create();
    expect(await store.get('ft/2026-W41/a-d31.json.gz')).toBeNull();
    await setGzipJson(store, 'ft/2026-W41/a-d31.json.gz', { offers: [{ id: '1' }] });
    await setGzipJson(store, 'ft/2026-W41/a-d2a.json.gz', { offers: [] });
    await setJson(store, 'runs/2026-W41/collect-ft.json', { status: 'running' });

    expect(await getGzipJson(store, 'ft/2026-W41/a-d31.json.gz')).toEqual({ offers: [{ id: '1' }] });
    expect(await getJson(store, 'runs/2026-W41/collect-ft.json')).toEqual({ status: 'running' });
    expect(await store.list('ft/2026-W41/')).toEqual(['ft/2026-W41/a-d2a.json.gz', 'ft/2026-W41/a-d31.json.gz']);

    expect(await deletePrefix(store, 'ft/')).toBe(2);
    expect(await store.list('')).toEqual(['runs/2026-W41/collect-ft.json']);
  });
});

it('refuse les clés qui sortent du répertoire', async () => {
  const store = new FileStore(join(dir, 'securite'));
  await expect(store.set('../evasion', new Uint8Array([1]))).rejects.toThrow('clé invalide');
});
