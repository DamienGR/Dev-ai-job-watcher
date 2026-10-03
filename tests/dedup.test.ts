import { describe, expect, it } from 'vitest';
import { dedupKey, titleKey } from '../src/core/dedup';
import { quantile, quartiles } from '../src/core/stats';

describe('clé de dédoublonnage inter-sources (SPEC.md §6.8)', () => {
  it('retire séniorité et mots vides de l’intitulé', () => {
    expect(titleKey('developpeur java senior')).toBe('developpeur java');
    expect(titleKey('ingenieur confirme en data science')).toBe('ingenieur data science');
    expect(titleKey('chef de projet experimente')).toBe('chef projet');
    expect(titleKey('developpeur c++ / c#')).toBe('developpeur c++ c#');
  });

  it('ignore la séniorité, distingue entreprise et lieu', () => {
    const key = dedupKey('developpeur java senior', 'exemple', '31', '76');
    expect(key).toMatch(/^[0-9a-f]{40}$/);
    expect(dedupKey('developpeur java junior', 'exemple', '31', '76')).toBe(key);
    expect(dedupKey('developpeur java', 'autre', '31', '76')).not.toBe(key);
    expect(dedupKey('developpeur java', 'exemple', '75', '11')).not.toBe(key);
  });

  it('se rabat sur la région sans département, et renonce sans entreprise', () => {
    expect(dedupKey('data engineer', 'exemple', null, '11')).toBe(dedupKey('data engineer', 'exemple', '11', null));
    expect(dedupKey('data engineer', null, '31', '76')).toBeNull();
  });
});

describe('quantiles (SPEC.md §7.1)', () => {
  it('interpole linéairement', () => {
    expect(quantile([1, 2, 3, 4], 0.5)).toBe(2.5);
    expect(quantile([10, 20, 30, 40, 50], 0.25)).toBe(20);
    expect(quantile([42], 0.75)).toBe(42);
  });

  it('masque les quartiles sous 5 valeurs', () => {
    expect(quartiles([1, 2, 3, 4])).toEqual({ n: 4, p25: null, p50: null, p75: null });
    expect(quartiles([50_000, 30_000, 40_000, 45_000, 35_000])).toEqual({ n: 5, p25: 35_000, p50: 40_000, p75: 45_000 });
  });
});
