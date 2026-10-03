// Tables de faits des agrégats (SPEC.md §7.2) : `{ columns, rows }`, dimensions codées par
// identifiant, libellés dans `meta.json`.

export type Cell = string | number | boolean | null;

export interface Table {
  columns: string[];
  rows: Cell[][];
}

/** Valeur des dimensions « toutes valeurs confondues » (France entière, tous groupes…). */
export const ALL = '*';

const compare = (a: Cell, b: Cell): number => {
  if (a === b) return 0;
  if (a === null) return -1;
  if (b === null) return 1;
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  return String(a) < String(b) ? -1 : 1;
};

/** Tri stable des lignes, colonne par colonne. */
export function sortRows(rows: Cell[][]): Cell[][] {
  return rows.sort((a, b) => {
    for (let i = 0; i < Math.max(a.length, b.length); i++) {
      const c = compare(a[i] ?? null, b[i] ?? null);
      if (c !== 0) return c;
    }
    return 0;
  });
}

/** Compteur indexé par une combinaison de dimensions. */
export class Counter {
  private readonly counts = new Map<string, { key: Cell[]; n: number }>();

  add(key: Cell[], n = 1): void {
    const id = JSON.stringify(key);
    const entry = this.counts.get(id);
    if (entry) entry.n += n;
    else this.counts.set(id, { key, n });
  }

  get(key: Cell[]): number {
    return this.counts.get(JSON.stringify(key))?.n ?? 0;
  }

  entries(): { key: Cell[]; n: number }[] {
    return [...this.counts.values()];
  }

  /** Table `[...dimensions, n]`, triée. */
  toTable(dimensions: string[]): Table {
    return { columns: [...dimensions, 'n'], rows: sortRows(this.entries().map(({ key, n }) => [...key, n])) };
  }
}

/** Valeurs regroupées par combinaison de dimensions (quantiles). */
export class Grouper<T> {
  private readonly groups = new Map<string, { key: Cell[]; values: T[] }>();

  add(key: Cell[], value: T): void {
    const id = JSON.stringify(key);
    const group = this.groups.get(id);
    if (group) group.values.push(value);
    else this.groups.set(id, { key, values: [value] });
  }

  get(key: Cell[]): T[] {
    return this.groups.get(JSON.stringify(key))?.values ?? [];
  }

  entries(): { key: Cell[]; values: T[] }[] {
    return [...this.groups.values()];
  }
}

/**
 * Garde les `limit` premières valeurs (par effectif décroissant, puis ordre alphabétique) de
 * chaque partition : `partitionSize` premières dimensions de la clé.
 */
export function topN(counter: Counter, partitionSize: number, limit: number): { key: Cell[]; n: number }[] {
  const partitions = new Map<string, { key: Cell[]; n: number }[]>();
  for (const entry of counter.entries()) {
    const id = JSON.stringify(entry.key.slice(0, partitionSize));
    const list = partitions.get(id);
    if (list) list.push(entry);
    else partitions.set(id, [entry]);
  }
  return [...partitions.values()].flatMap((list) =>
    list.sort((a, b) => b.n - a.n || compare(a.key[partitionSize] ?? null, b.key[partitionSize] ?? null)).slice(0, limit),
  );
}
