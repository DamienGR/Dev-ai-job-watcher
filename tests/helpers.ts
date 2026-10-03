import { regionOfDepartement } from '../src/refs';
import type { FtApi, FtOffer, FtPage } from '../src/sources/francetravail/api';
import type { Clock } from '../src/sources/http';

/** Horloge factice : `sleep` avance le temps sans attendre. */
export function fakeClock(start = 0): Clock & { time: number; sleeps: number[] } {
  const clock = {
    time: start,
    sleeps: [] as number[],
    now: () => clock.time,
    sleep: async (ms: number) => {
      clock.sleeps.push(ms);
      clock.time += ms;
    },
  };
  return clock;
}

export interface UniverseOffer {
  id: string;
  /** `null` : offre localisée au seul niveau national (« France »), sans département. */
  departement: string | null;
  romeCode: string;
  dateCreation: string;
  intitule: string;
}

/** Offre au format de l'API, avec des champs de contact à retirer. */
export function apiOffer(o: UniverseOffer): FtOffer {
  return {
    id: o.id,
    intitule: o.intitule,
    description: `Offre ${o.id}. Contact : jeanne.exemple@exemple.fr, 06 12 34 56 78.`,
    dateCreation: o.dateCreation,
    lieuTravail: o.departement === null ? { libelle: 'France' } : { libelle: `${o.departement} - VILLE`, commune: `${o.departement}001` },
    romeCode: o.romeCode,
    entreprise: { nom: 'EXEMPLE SAS', description: 'Écrivez à rh@exemple.fr' },
    contact: { nom: 'Jeanne Exemple', courriel: 'jeanne.exemple@exemple.fr', telephone: '0612345678' },
    agence: { courriel: 'agence@francetravail.fr', telephone: '3949' },
  };
}

/**
 * API France Travail simulée sur un « univers » d'offres : applique les filtres de la vraie API
 * (département, région, codes ROME, mots-clés, dates de création) et la pagination `range`.
 * Comme sur l'API réelle, une offre sans département n'est renvoyée que sans filtre géographique.
 */
export class FakeFtApi implements FtApi {
  readonly stats = { calls: 0, retries: 0 };
  readonly calls: Record<string, string>[] = [];

  constructor(
    private readonly universe: UniverseOffer[],
    private readonly options: {
      clock?: ReturnType<typeof fakeClock>;
      callDurationMs?: number;
      fail?: (params: Record<string, string>, callIndex: number) => Error | null;
    } = {},
  ) {}

  async preflight(): Promise<void> {}

  async search(params: Record<string, string>, [first, last]: readonly [number, number]): Promise<FtPage> {
    const index = this.stats.calls;
    this.stats.calls += 1;
    this.calls.push({ ...params, range: `${first}-${last}` });
    if (this.options.clock && this.options.callDurationMs) this.options.clock.time += this.options.callDurationMs;
    const error = this.options.fail?.(params, index);
    if (error) throw error;

    const min = params.minCreationDate ? Date.parse(params.minCreationDate) : -Infinity;
    const max = params.maxCreationDate ? Date.parse(params.maxCreationDate) : Infinity;
    const matching = this.universe
      .filter((o) => !params.departement || (o.departement !== null && params.departement.split(',').includes(o.departement)))
      .filter((o) => !params.region || (o.departement !== null && regionOfDepartement(o.departement) === params.region))
      .filter((o) => !params.codeROME || params.codeROME.split(',').includes(o.romeCode))
      .filter((o) => !params.motsCles || o.intitule.toLowerCase().includes(params.motsCles.toLowerCase()))
      .filter((o) => {
        const t = Date.parse(o.dateCreation);
        return t >= min && t <= max;
      })
      .sort((a, b) => a.id.localeCompare(b.id));
    return { total: matching.length, offers: matching.slice(first, last + 1).map(apiOffer) };
  }
}

/** `n` offres réparties sur une période, numérotées à partir de `prefix`. */
export function offers(
  n: number,
  { prefix, departement, romeCode = 'M1805', intitule = 'Développeur Java', from = '2026-06-01T00:00:00Z', stepHours = 7 }: {
    prefix: string;
    departement: string | null;
    romeCode?: string;
    intitule?: string;
    from?: string;
    stepHours?: number;
  },
): UniverseOffer[] {
  const start = Date.parse(from);
  return Array.from({ length: n }, (_, i) => ({
    id: `${prefix}${String(i).padStart(5, '0')}`,
    departement,
    romeCode,
    intitule,
    dateCreation: new Date(start + i * stepHours * 3_600_000).toISOString(),
  }));
}
