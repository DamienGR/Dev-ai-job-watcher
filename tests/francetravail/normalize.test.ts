import { readFile } from 'node:fs/promises';
import { beforeAll, describe, expect, it } from 'vitest';
import { loadCompiledTaxonomy, loadTaxonomy, type CompiledTaxonomy } from '../../src/core/taxonomy';
import { FranceTravailSource } from '../../src/sources/francetravail';
import type { FtRawPartition } from '../../src/sources/francetravail/collect';
import {
  emptyNormalizeStats,
  ftCadre,
  ftContract,
  ftExperience,
  ftFullTime,
  normalizeFtOffer,
  normalizeFtPartition,
} from '../../src/sources/francetravail/normalize';
import { FakeFtApi } from '../helpers';

let taxonomy: CompiledTaxonomy;
beforeAll(async () => {
  taxonomy = await loadCompiledTaxonomy();
});

async function fixtureOffers(name: string): Promise<Record<string, unknown>[]> {
  return JSON.parse(await readFile(`fixtures/francetravail/${name}.json`, 'utf8')).offers;
}

const ctx = (pass = 'A') => ({ runId: '2026-W40', pass, taxonomy });

describe('correspondances France Travail (SPEC.md §6.1, D18)', () => {
  it.each<[Parameters<typeof ftContract>[0], string]>([
    [{ typeContrat: 'CDI' }, 'cdi'],
    [{ typeContrat: 'CDD' }, 'cdd'],
    [{ typeContrat: 'MIS' }, 'interim'],
    [{ typeContrat: 'LIB' }, 'freelance'],
    [{ typeContrat: 'SAI' }, 'autre'],
    [{ typeContrat: 'CDD', alternance: true }, 'alternance'],
    [{ typeContrat: 'CDD', natureContrat: 'Cont. professionnalisation' }, 'alternance'],
    [{}, 'unknown'],
  ])('contrat %j → %s', (offer, contract) => {
    expect(ftContract(offer)).toBe(contract);
  });

  it.each<[string | null, string | null, string]>([
    ['D', 'Débutant accepté', 'debutant'],
    ['E', '0 An(s)', 'debutant'],
    ['E', '6 Mois', 'debutant'],
    ['E', '1 An(s)', '1_3'],
    ['E', '24 Mois', '1_3'],
    ['E', '3 An(s) - sur poste similaire', '3_5'],
    ['E', '48 Mois', '3_5'],
    ['E', '5 An(s)', '5_plus'],
    ['E', '10 An(s)', '5_plus'],
    ['E', 'Expérience exigée', 'unknown'],
    [null, null, 'unknown'],
  ])('expérience %s « %s » → %s', (exige, libelle, experience) => {
    expect(ftExperience(exige, libelle)).toBe(experience);
  });

  it('cadre et temps de travail', () => {
    expect([ftCadre('9'), ftCadre('7'), ftCadre(null), ftCadre(undefined)]).toEqual([true, false, null, null]);
    expect([ftFullTime('Temps plein'), ftFullTime('Temps partiel'), ftFullTime(null)]).toEqual([true, false, null]);
  });
});

describe('normalisation d’une offre France Travail (SPEC.md §6.1)', () => {
  it('produit le schéma Offer complet', async () => {
    const [raw] = await fixtureOffers('rome-m1811');
    const result = normalizeFtOffer(raw, ctx());
    if (!('offer' in result)) throw new Error('offre attendue');
    expect(result.offer).toMatchObject({
      uid: 'francetravail:FX00001',
      source: 'francetravail',
      sourceId: 'FX00001',
      runId: '2026-W40',
      collectedVia: ['rome'],
      title: 'Data Engineer (H/F)',
      titleNorm: 'data engineer',
      descriptionIsFull: true,
      createdAt: '2026-09-28T10:15:00.000Z',
      firstSeenRun: '2026-W40',
      lastSeenRun: '2026-W40',
      closedRun: null,
      isBackfill: false,
      company: 'EXEMPLE DATA',
      companyNorm: 'exemple data',
      employerType: 'esn_conseil',
      nafCode: '62.02A',
      location: { communeInsee: '31555', departement: '31', region: '76', precision: 'commune' },
      contract: 'cdi',
      experience: '3_5',
      cadre: true,
      salary: { minAnnual: 45_000, maxAnnual: 55_000, midAnnual: 50_000, source: 'declared' },
      romeCode: 'M1811',
      role: 'data_engineer',
      group: 'g2_data',
      taxonomyVersion: taxonomy.version,
      dedup: { duplicateOf: null },
    });
    expect(result.offer.dedup.key).toMatch(/^[0-9a-f]{40}$/);
    expect(result.salaryOutOfBounds).toBe(false);
  });

  it('se replie sur le commentaire de salaire et lit les technologies', async () => {
    const [raw] = await fixtureOffers('rome-m1806');
    const result = normalizeFtOffer(raw, ctx());
    if (!('offer' in result)) throw new Error('offre attendue');
    expect(result.offer.salary).toMatchObject({ minAnnual: 60_000, maxAnnual: 70_000, source: 'declared' });
  });

  it('lit le TJM du commentaire de salaire et range l’offre en freelance', () => {
    const result = normalizeFtOffer(
      {
        id: 'X1',
        intitule: 'Consultant Data',
        description: 'Mission longue.',
        dateCreation: '2026-09-28T10:15:00.000Z',
        lieuTravail: { libelle: '75 - Paris', commune: '75056' },
        typeContrat: 'SAI',
        salaire: { commentaire: '550 € par jour' },
      },
      ctx(),
    );
    if (!('offer' in result)) throw new Error('offre attendue');
    expect(result.offer.tjm).toEqual({ min: 550, max: 550 });
    expect(result.offer.contract).toBe('freelance');
    expect(result.offer.salary.source).toBe('none');
  });

  it('écarte les offres étrangères et invalides, et les compte', () => {
    const partition: FtRawPartition = {
      source: 'francetravail',
      runId: '2026-W40',
      partition: { id: 'a-fr', stem: 'a-fr', parent: null, pass: 'A', level: 'national', params: {} },
      fetchedAt: '2026-10-03T08:00:00.000Z',
      total: 4,
      truncated: false,
      offers: [
        { id: 'X1', intitule: 'Développeur', dateCreation: '2026-09-28T10:15:00Z', lieuTravail: { libelle: 'Luxembourg' } },
        { id: 'X2', intitule: 'Développeur', dateCreation: '2026-09-28T10:15:00Z', lieuTravail: { libelle: 'Luxembourg' } },
        { id: 'X3', intitule: 'Développeur', dateCreation: 'hier' },
        { id: 'X4', intitule: 'Développeur', dateCreation: '2026-09-28T10:15:00Z', lieuTravail: { libelle: 'France' } },
        { id: 'X5', intitule: 'Développeur', dateCreation: '2026-09-28T10:15:00Z', salaire: { libelle: 'Annuel de 900000.0 Euros' } },
      ],
    };
    const stats = emptyNormalizeStats();
    const offers = normalizeFtPartition(partition, taxonomy, stats);
    expect(offers.map((o) => [o.sourceId, o.location.precision])).toEqual([
      ['X4', 'pays'],
      ['X5', 'aucune'],
    ]);
    expect(stats).toEqual({ read: 5, invalid: 1, abroad: 2, abroadLabels: { Luxembourg: 2 }, salaryOutOfBounds: 1 });
  });

  it('marque la passe B comme collecte par mots-clés', async () => {
    const [raw] = await fixtureOffers('motscles-forward-deployed');
    const result = normalizeFtOffer(raw, ctx('B'));
    expect('offer' in result && result.offer.collectedVia).toEqual(['keyword']);
  });

  it('est exposée par FranceTravailSource.normalize', async () => {
    const source = new FranceTravailSource({ api: new FakeFtApi([]), taxonomy: await loadTaxonomy() });
    const partition = {
      source: 'francetravail',
      runId: '2026-W40',
      partition: { id: 'a-fr', stem: 'a-fr', parent: null, pass: 'A', level: 'national', params: {} },
      offers: await fixtureOffers('rome-m1805'),
    };
    expect(source.normalize(partition, '2026-W41').map((o) => [o.sourceId, o.runId])).toEqual([
      ['FX00002', '2026-W41'],
      ['FX00003', '2026-W41'],
      ['FX00004', '2026-W41'],
    ]);
  });
});
