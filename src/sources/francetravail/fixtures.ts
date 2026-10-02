import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { FtApi, FtOffer, FtPage } from './api';

/** Réponse enregistrée : offres renvoyées à toute requête portant les paramètres `match`. */
export interface FtFixture {
  description?: string;
  match: Record<string, string>;
  offers: FtOffer[];
}

/**
 * API simulée à partir de `fixtures/francetravail/*.json` (SPEC.md §13), sans clé ni réseau.
 * Une requête reçoit les offres de toutes les fixtures dont les paramètres `match` sont
 * présents à l'identique ; aucune correspondance donne un résultat vide (HTTP 204).
 */
export class FixtureFtApi implements FtApi {
  readonly stats = { calls: 0, retries: 0 };

  constructor(private readonly fixtures: readonly FtFixture[]) {}

  static async fromDirectory(dir: string): Promise<FixtureFtApi> {
    const files = (await readdir(dir)).filter((file) => file.endsWith('.json')).sort();
    const fixtures = await Promise.all(
      files.map(async (file) => JSON.parse(await readFile(join(dir, file), 'utf8')) as FtFixture),
    );
    return new FixtureFtApi(fixtures);
  }

  async preflight(): Promise<void> {}

  async search(params: Record<string, string>, [first, last]: readonly [number, number]): Promise<FtPage> {
    this.stats.calls += 1;
    const seen = new Set<unknown>();
    const offers = this.fixtures
      .filter((fixture) => Object.entries(fixture.match).every(([name, value]) => params[name] === value))
      .flatMap((fixture) => fixture.offers)
      .filter((offer) => !seen.has(offer.id) && seen.add(offer.id));
    return { total: offers.length, offers: offers.slice(first, last + 1) };
  }
}
