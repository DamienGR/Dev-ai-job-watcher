import { describe, expect, it } from 'vitest';
import { normalize } from '../src/core/normalize';
import { adzunaSalary, parseFtSalary, parseTjm } from '../src/core/salary';

describe('TJM (SPEC.md §6.3)', () => {
  it.each<[string, number | null, number | null]>([
    // Annexe C
    ['TJM : 550 €/jour', 550, 550],
    ['TJM 400-550 €/j', 400, 550],
    ['Taux journalier : 2 500 €', null, null],
    // Autres formulations
    ['TJM entre 450 et 600 €', 450, 600],
    ['TJM de 400 à 550 euros HT', 400, 550],
    ['Mission freelance, 600 € HT / jour', 600, 600],
    ['TJM : 1.200 €/jour', 1200, 1200],
    ['TJM 550,00 €', 550, 550],
    ['Daily rate: €650', 650, 650],
    ['€700 per day', 700, 700],
    ['TJM selon profil', null, null],
    ['TJM : 100 €', null, null],
    ['Tickets restaurant 9 €/jour, télétravail 2 jours par semaine', null, null],
  ])('%s → [%s, %s]', (input, min, max) => {
    expect(parseTjm(normalize(input))).toEqual({ min, max });
  });
});

type Expected = [number | null, number | null, number | null, 'declared' | 'predicted' | 'none'];

describe('salaires France Travail (SPEC.md §6.3, annexe C)', () => {
  it.each<[string | null, string | null, Expected]>([
    // Annexe C
    ['Annuel de 50000.0 Euros à 55000.0 Euros sur 12 mois', null, [50_000, 55_000, 52_500, 'declared']],
    ['Annuel de 45000.0 Euros sur 12 mois', null, [45_000, 45_000, 45_000, 'declared']],
    ['Mensuel de 3000.0 Euros à 3500.0 Euros sur 13 mois', null, [39_000, 45_500, 42_250, 'declared']],
    ['Mensuel de 2500.0 Euros sur 12 mois', null, [30_000, 30_000, 30_000, 'declared']],
    ['Horaire de 15.0 Euros', null, [24_105, 24_105, 24_105, 'declared']],
    ['Annuel de 500000.0 Euros sur 12 mois', null, [null, null, null, 'none']],
    [null, 'Selon profil', [null, null, null, 'none']],
    [null, '45 - 55 k€ brut annuel', [45_000, 55_000, 50_000, 'declared']],
    // Formats observés sur l'API réelle (D18)
    ['Annuel de 40000.0 Euros à 48000.0 Euros - Mutuelle + TR', null, [40_000, 48_000, 44_000, 'declared']],
    ['Mensuel de 2200.0 Euros à 3000.0 Euros', null, [26_400, 36_000, 31_200, 'declared']],
    ['Mensuel de 3000.0 Euros - sur 13 mois', null, [39_000, 39_000, 39_000, 'declared']],
    ['Horaire de 12.0 Euros à 14.0 Euros', null, [19_284, 22_498, 20_891, 'declared']],
    ['Horaire de 11.88 Euros', null, [19_091, 19_091, 19_091, 'declared']],
    ['Annuel de 60000.0 Euros à 50000.0 Euros', null, [50_000, 60_000, 55_000, 'declared']],
    ['Annuel de 10000.0 Euros à 45000.0 Euros', null, [45_000, 45_000, 45_000, 'declared']],
    ['Annuel de 50000.0 Euros', 'Selon profil', [50_000, 50_000, 50_000, 'declared']],
    // Salaire annuel saisi comme mensuel : 18 000 € et plus lus tels quels (D23)
    ['Mensuel de 45000.0 Euros à 55000.0 Euros', null, [45_000, 55_000, 50_000, 'declared']],
    ['Mensuel de 18000.0 Euros', null, [18_000, 18_000, 18_000, 'declared']],
    ['Mensuel de 22404.24 Euros à 55541.0 Euros', null, [22_404, 55_541, 38_973, 'declared']],
    ['Mensuel de 17999.0 Euros', null, [215_988, 215_988, 215_988, 'declared']],
    ['Mensuel de 2500.0 Euros à 30000.0 Euros', null, [30_000, 30_000, 30_000, 'declared']],
    ['Mensuel de 800.0 Euros à 1300.0 Euros', null, [null, null, null, 'none']],
    // Repli sur le commentaire
    [null, '45k-55k', [45_000, 55_000, 50_000, 'declared']],
    [null, 'De 40 à 45 k€ selon expérience', [40_000, 45_000, 42_500, 'declared']],
    [null, '45 000 - 50 000 € annuel brut', [45_000, 50_000, 47_500, 'declared']],
    [null, '40k minimum', [40_000, 40_000, 40_000, 'declared']],
    [null, '2 500 € brut mensuel', [30_000, 30_000, 30_000, 'declared']],
    [null, '3 à 5 ans d\'expérience, 50 k€', [50_000, 50_000, 50_000, 'declared']],
    [null, '500 € par jour', [null, null, null, 'none']],
    [null, '400-450 € par jour', [null, null, null, 'none']],
    [null, '13ème mois', [null, null, null, 'none']],
    [null, '2500', [null, null, null, 'none']],
    ['Autre format inconnu', null, [null, null, null, 'none']],
    [null, null, [null, null, null, 'none']],
  ])('libellé %j, commentaire %j', (libelle, commentaire, [minAnnual, maxAnnual, midAnnual, source]) => {
    const { salary } = parseFtSalary(libelle, commentaire);
    expect({ minAnnual: salary.minAnnual, maxAnnual: salary.maxAnnual, midAnnual: salary.midAnnual, source: salary.source }).toEqual({
      minAnnual,
      maxAnnual,
      midAnnual,
      source,
    });
  });

  it('garde le texte brut et signale les montants hors bornes', () => {
    expect(parseFtSalary('Annuel de 500000.0 Euros sur 12 mois', null)).toEqual({
      salary: { minAnnual: null, maxAnnual: null, midAnnual: null, source: 'none', raw: 'Annuel de 500000.0 Euros sur 12 mois' },
      outOfBounds: true,
    });
    expect(parseFtSalary('Annuel de 50000.0 Euros', 'Mutuelle').salary.raw).toBe('Annuel de 50000.0 Euros | Mutuelle');
    expect(parseFtSalary(null, 'Selon profil').outOfBounds).toBe(false);
  });
});

describe('salaires Adzuna (SPEC.md §6.3, annexe C)', () => {
  it.each<[number | null, number | null, string | number, Expected]>([
    [50_000, 60_000, '0', [50_000, 60_000, 55_000, 'declared']],
    [50_000, 60_000, '1', [50_000, 60_000, 55_000, 'predicted']],
    [55_000, 55_000, 0, [55_000, 55_000, 55_000, 'declared']],
    [null, null, '0', [null, null, null, 'none']],
    [5_000, 6_000, '0', [null, null, null, 'none']],
  ])('min %s, max %s, prédit %s', (min, max, predicted, [minAnnual, maxAnnual, midAnnual, source]) => {
    const { salary } = adzunaSalary(min, max, predicted);
    expect([salary.minAnnual, salary.maxAnnual, salary.midAnnual, salary.source]).toEqual([minAnnual, maxAnnual, midAnnual, source]);
  });
});
