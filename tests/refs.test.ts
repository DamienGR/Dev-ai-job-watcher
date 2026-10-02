import { describe, expect, it } from 'vitest';
import { DEPARTEMENTS, REGION_CODES, REGIONS, isRegionCode, regionOfDepartement } from '../src/refs';

describe('référentiel départements → régions (SPEC.md §3.4, §6.2)', () => {
  it('compte 101 départements et 18 régions, sans doublon', () => {
    expect(DEPARTEMENTS).toHaveLength(101);
    expect(new Set(DEPARTEMENTS.map((d) => d.code)).size).toBe(101);
    expect(REGIONS).toHaveLength(18);
    expect(REGIONS.map((r) => r.code).sort()).toEqual([...REGION_CODES].sort());
  });

  it('rattache chaque département à une région connue, et chaque région à au moins un département', () => {
    for (const d of DEPARTEMENTS) expect(isRegionCode(d.region), d.code).toBe(true);
    for (const r of REGIONS) expect(DEPARTEMENTS.some((d) => d.region === r.code), r.nom).toBe(true);
  });

  it('identifie les DROM par leurs départements 97x', () => {
    for (const d of DEPARTEMENTS) {
      const region = REGIONS.find((r) => r.code === d.region);
      expect(region?.drom, d.code).toBe(d.code.startsWith('97'));
    }
  });

  it.each([
    ['01', '84'],
    ['31', '76'],
    ['33', '75'],
    ['35', '53'],
    ['44', '52'],
    ['59', '32'],
    ['67', '44'],
    ['69', '84'],
    ['75', '11'],
    ['13', '93'],
    ['2A', '94'],
    ['2b', '94'],
    ['971', '01'],
    ['972', '02'],
    ['973', '03'],
    ['974', '04'],
    ['976', '06'],
  ])('%s → %s', (departement, region) => {
    expect(regionOfDepartement(departement)).toBe(region);
  });

  it.each(['20', '96', '975', '99', ''])('renvoie null pour le code inconnu « %s »', (code) => {
    expect(regionOfDepartement(code)).toBeNull();
  });
});
