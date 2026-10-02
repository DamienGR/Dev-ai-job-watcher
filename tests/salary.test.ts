import { describe, expect, it } from 'vitest';
import { normalize } from '../src/core/normalize';
import { parseTjm } from '../src/core/salary';

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
