import { describe, expect, it } from 'vitest';
import { departementOfCommune, ftLocation, regionOfName } from '../src/core/location';

describe('localisation France Travail (SPEC.md §6.2)', () => {
  it.each([
    ['31555', '31'],
    ['75102', '75'],
    ['2A004', '2A'],
    ['2b033', '2B'],
    ['97411', '974'],
    ['97701', '977'],
    ['3155', null],
    ['ABCDE', null],
  ])('commune %s → département %s', (commune, departement) => {
    expect(departementOfCommune(commune)).toBe(departement);
  });

  it('localise à la commune, avec coordonnées', () => {
    expect(ftLocation({ libelle: '31 - TOULOUSE', commune: '31555', latitude: 43.6, longitude: 1.44 })).toEqual({
      label: '31 - TOULOUSE',
      communeInsee: '31555',
      departement: '31',
      region: '76',
      lat: 43.6,
      lng: 1.44,
      precision: 'commune',
    });
  });

  it.each([
    ['75 - Paris', '75', '11'],
    ['974 - La Réunion', '974', '04'],
    ['2A - Ajaccio', '2A', '94'],
    ['93 - Seine Saint Denis', '93', '11'],
  ])('sans commune, lit le département du libellé « %s »', (libelle, departement, region) => {
    expect(ftLocation({ libelle })).toMatchObject({ departement, region, communeInsee: null, precision: 'departement' });
  });

  it.each([
    ['Île-de-France', '11'],
    ['Ile-de-France', '11'],
    ['Auvergne-Rhône-Alpes', '84'],
    ["Provence-Alpes-Côte d'Azur", '93'],
    ['Rhône-Alpes', '84'],
    ['Midi-Pyrénées', '76'],
  ])('libellé de région « %s » → %s', (libelle, region) => {
    expect(regionOfName(libelle)).toBe(region);
    expect(ftLocation({ libelle })).toMatchObject({ departement: null, region, precision: 'region' });
  });

  it('« France » et collectivités hors régions : précision pays, sans région', () => {
    expect(ftLocation({ libelle: 'France' })).toMatchObject({ region: null, departement: null, precision: 'pays' });
    expect(ftLocation({ libelle: '977 - Saint-Barthélemy' })).toMatchObject({ region: null, precision: 'pays' });
    expect(ftLocation({ libelle: '977 - Saint-Barthélemy', commune: '97701' })).toMatchObject({
      communeInsee: '97701',
      region: null,
      precision: 'pays',
    });
  });

  it('sans aucune information : précision aucune', () => {
    expect(ftLocation({})).toMatchObject({ label: null, region: null, precision: 'aucune' });
    expect(ftLocation(undefined)).toMatchObject({ precision: 'aucune' });
  });

  it.each(['Luxembourg', 'Belgique', 'Principauté de Monaco', 'Montréal, QC, Canada', '99 - Allemagne'])(
    'exclut une offre à l’étranger : « %s »',
    (libelle) => {
      expect(ftLocation({ libelle })).toBeNull();
    },
  );

  it('ignore des coordonnées hors limites', () => {
    expect(ftLocation({ libelle: '31 - TOULOUSE', commune: '31555', latitude: 143, longitude: 1.44 })).toMatchObject({
      lat: null,
      lng: 1.44,
    });
  });
});
