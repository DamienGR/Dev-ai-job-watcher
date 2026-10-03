import { beforeAll, describe, expect, it } from 'vitest';
import { employerType, normalizeCompany } from '../src/core/employer';
import { loadCompiledTaxonomy, type CompiledTaxonomy } from '../src/core/taxonomy';

let taxonomy: CompiledTaxonomy;
beforeAll(async () => {
  taxonomy = await loadCompiledTaxonomy();
});

describe('employeurs (SPEC.md §6.7)', () => {
  it.each([
    ['Capgemini Technology Services SAS', 'capgemini technology services'],
    ['SOPRA STERIA GROUP', 'sopra steria'],
    ['Experis France', 'experis'],
    ['Groupe La Poste', 'la poste'],
    ['S.A.R.L. Exemple & Fils', 's a r l exemple fils'],
    ["L'Oréal SA", "l oreal"],
    ['SAS', null],
    ['', null],
    [null, null],
  ])('companyNorm(%j) = %j', (name, expected) => {
    expect(normalizeCompany(name)).toBe(expected);
  });

  it.each<[string | null, string | null, string]>([
    ['78.20Z', 'EXEMPLE INTERIM', 'recrutement_interim'],
    [null, 'MANPOWER FRANCE', 'recrutement_interim'],
    ['62.02A', 'EXEMPLE CONSEIL', 'esn_conseil'],
    [null, 'Capgemini Technology Services', 'esn_conseil'],
    ['62.01Z', 'Capgemini', 'esn_conseil'],
    [null, 'Ernst & Young Advisory', 'esn_conseil'],
    ['84.11Z', 'EXEMPLE', 'public_recherche'],
    [null, 'AP-HP', 'public_recherche'],
    [null, 'Université de Toulon', 'public_recherche'],
    ['58.29C', 'EXEMPLE IA', 'editeur_logiciel'],
    ['64.19Z', 'EXEMPLE BANQUE', 'client_final'],
    [null, 'EXEMPLE BANQUE', 'inconnu'],
    [null, null, 'inconnu'],
  ])('NAF %s, nom %s → %s', (naf, company, expected) => {
    expect(employerType(naf, company, normalizeCompany(company), taxonomy)).toBe(expected);
  });
});
