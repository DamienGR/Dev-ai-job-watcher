import { describe, expect, it } from 'vitest';
import { DEFAULT_FILTERS, filtersToParams, ignoredFilters, parseFilters, scopeOf } from '../../web/src/lib/filters';
import { makeMeta } from './helpers';

const meta = makeMeta();

describe('filtres dans l’URL (SPEC.md §8.2)', () => {
  it('relit ce qu’il écrit, sans les valeurs par défaut', () => {
    const filters = { ...DEFAULT_FILTERS, period: '6m' as const, region: '53', groups: ['g1_dev'], roles: ['dev_backend'], contract: 'cdi', wide: true };
    const params = filtersToParams(filters);
    expect(params.toString()).toBe('periode=6m&region=53&groupes=g1_dev&roles=dev_backend&contrat=cdi&elargi=1');
    expect(parseFilters(params, meta)).toEqual(filters);
    expect(filtersToParams(DEFAULT_FILTERS).toString()).toBe('');
  });

  it('ignore les valeurs inconnues', () => {
    const params = new URLSearchParams('periode=2y&region=99&groupes=g1_dev,inconnu&roles=x&source=adzuna&contrat=zzz&elargi=oui');
    expect(parseFilters(params, meta)).toEqual({ ...DEFAULT_FILTERS, groups: ['g1_dev'] });
  });
});

describe('périmètre affiché', () => {
  it('montre les groupes du dashboard ; le périmètre élargi ajoute g9 et les non classés', () => {
    expect(scopeOf(meta, DEFAULT_FILTERS).groups).toEqual(['g1_dev', 'g2_data', 'g4_genai_agentique']);
    const wide = scopeOf(meta, { ...DEFAULT_FILTERS, wide: true });
    expect(wide.groups).toEqual(['g1_dev', 'g2_data', 'g4_genai_agentique', 'g9_elargi', 'non_classe']);
    expect(wide.roleOk('support_it') && wide.roleOk('non_classe')).toBe(true);
    expect(scopeOf(meta, DEFAULT_FILTERS).roleOk('support_it')).toBe(false);
  });

  it('restreint aux groupes et rôles choisis, et filtre région, source et contrat', () => {
    const scope = scopeOf(meta, { ...DEFAULT_FILTERS, groups: ['g1_dev'], roles: ['dev_backend'], region: '11', contract: 'cdi' });
    expect(scope.groups).toEqual(['g1_dev']);
    expect([scope.roleOk('dev_backend'), scope.roleOk('dev_frontend'), scope.roleOk('data_engineer')]).toEqual([true, false, false]);
    expect(scope.rowOk({ region: '11', source: 'francetravail', contract: 'cdi' })).toBe(true);
    expect(scope.rowOk({ region: '53', contract: 'cdi' })).toBe(false);
    expect(scope.rowOk({ region: null, contract: 'cdi' })).toBe(false);
    expect(scope.rowOk({ contract: 'cdd' })).toBe(false);
    expect(scope.rowOk({})).toBe(true);
  });

  it('liste les filtres actifs qu’un indicateur ne sait pas appliquer', () => {
    const filters = { ...DEFAULT_FILTERS, region: '11', groups: ['g1_dev'], contract: 'cdi' };
    expect(ignoredFilters(filters, ['groups'])).toEqual(['région', 'contrat']);
    expect(ignoredFilters(DEFAULT_FILTERS, [])).toEqual([]);
  });
});
