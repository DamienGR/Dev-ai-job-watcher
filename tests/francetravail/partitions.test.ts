import { describe, expect, it } from 'vitest';
import { loadTaxonomy, type Taxonomy } from '../../src/core/taxonomy';
import {
  collectionKeywords,
  EARLIEST_CREATION,
  formatFtDate,
  romeCodes,
  rootPartitions,
  splitPartition,
  type FtPartition,
} from '../../src/sources/francetravail/partitions';

const taxonomy = await loadTaxonomy();
const referenceTime = new Date('2026-10-05T05:00:00.250Z');
const context = { romeCodes: romeCodes(taxonomy), referenceTime };
const roots = rootPartitions(taxonomy);
const root = (id: string) => roots.find((p) => p.id === id)!;

describe('plan de collecte France Travail (SPEC.md §4.1)', () => {
  it('prévoit une seule partition nationale en passe A, avec tous les codes ROME', () => {
    const passA = roots.filter((p) => p.pass === 'A');
    expect(passA).toEqual([
      {
        id: 'a-fr',
        stem: 'a-fr',
        parent: null,
        pass: 'A',
        level: 'national',
        params: { codeROME: 'M1805,M1811,M1818,M1806,M1802,M1803,M1801,M1810' },
      },
    ]);
  });

  it('prévoit un mot-clé par partition en passe B, pour les seuls groupes keyword_pass', () => {
    const passB = roots.filter((p) => p.pass === 'B');
    expect(passB.map((p) => p.params.motsCles)).toEqual(collectionKeywords(taxonomy));
    expect(passB.length).toBeGreaterThan(0);
    expect(root('b-kforward-deployed').params).toEqual({ motsCles: 'forward deployed' });
    expect(new Set(roots.map((p) => p.id)).size).toBe(roots.length);
  });

  it('écarte les doublons de mots-clés et les rôles dépréciés', () => {
    const copy = structuredClone(taxonomy) as Taxonomy;
    copy.roles.find((r) => r.id === 'prompt_engineer')!.keywords = ['prompt engineer', 'Prompt Engineer', 'prompt-engineer'];
    copy.roles.find((r) => r.id === 'context_engineer')!.status = 'deprecated';
    const keywords = collectionKeywords(copy);
    expect(keywords.filter((k) => /prompt/i.test(k))).toEqual(['prompt engineer']);
    expect(keywords).not.toContain('context engineer');
  });

  it('découpe la passe A par code ROME, puis par dates de création', () => {
    const byRome = splitPartition(root('a-fr'), context);
    expect(byRome.map((p) => p.params)).toEqual(romeCodes(taxonomy).map((codeROME) => ({ codeROME })));
    expect(byRome[0]).toMatchObject({ id: 'a-fr-rm1805', parent: 'a-fr', level: 'rome' });

    const byDates = splitPartition(byRome[0]!, context);
    expect(byDates.map((p) => [p.params.minCreationDate, p.params.maxCreationDate])).toEqual([
      ['2000-01-01T00:00:00Z', '2013-05-19T02:30:00Z'],
      ['2013-05-19T02:30:01Z', '2026-10-05T05:00:00Z'],
    ]);
    expect(byDates[0]!.id).toBe('a-fr-rm1805-c20000101t000000-20130519t023000');
    expect(byDates.every((p) => p.level === 'dates' && p.stem === 'a-fr-rm1805')).toBe(true);
  });

  it('coupe une fenêtre de dates en deux moitiés contiguës, jusqu’à 2 secondes', () => {
    const window = (from: string, to: string): FtPartition => ({
      id: 'x',
      stem: 'a-fr-rm1805',
      parent: null,
      pass: 'A',
      level: 'dates',
      params: { codeROME: 'M1805', minCreationDate: from, maxCreationDate: to },
    });
    const halves = splitPartition(window('2026-09-01T00:00:00Z', '2026-09-01T00:00:09Z'), context);
    expect(halves.map((p) => [p.params.minCreationDate, p.params.maxCreationDate])).toEqual([
      ['2026-09-01T00:00:00Z', '2026-09-01T00:00:04Z'],
      ['2026-09-01T00:00:05Z', '2026-09-01T00:00:09Z'],
    ]);
    expect(halves[0]!.id).toBe('a-fr-rm1805-c20260901t000000-20260901t000004');
    expect(splitPartition(window('2026-09-01T00:00:00Z', '2026-09-01T00:00:01Z'), context)).toEqual([]);
  });

  it('découpe la passe B par région, puis par département, puis par dates', () => {
    const byRegion = splitPartition(root('b-kforward-deployed'), context);
    expect(byRegion).toHaveLength(18);
    const idf = byRegion.find((p) => p.params.region === '11')!;
    expect(idf.id).toBe('b-kforward-deployed-g11');

    const byDepartement = splitPartition(idf, context);
    expect(byDepartement.map((p) => p.params.departement)).toEqual(['75', '77', '78', '91', '92', '93', '94', '95']);
    expect(byDepartement[0]!.params).toEqual({ motsCles: 'forward deployed', departement: '75' });
    expect(splitPartition(byDepartement[0]!, context)[0]!.level).toBe('dates');

    // Région d'un seul département (Guadeloupe) : directement par dates.
    const guadeloupe = byRegion.find((p) => p.params.region === '01')!;
    expect(splitPartition(guadeloupe, context)[0]!.level).toBe('dates');
  });

  it('formate les dates au format de l’API', () => {
    expect(formatFtDate(EARLIEST_CREATION)).toBe('2000-01-01T00:00:00Z');
    expect(formatFtDate(Date.parse('2026-10-05T05:00:00.250Z'))).toBe('2026-10-05T05:00:00Z');
  });
});
