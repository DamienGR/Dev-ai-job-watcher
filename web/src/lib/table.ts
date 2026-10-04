import type { Cell, Table } from './types';

/** Lignes d'une table de faits sous forme d'objets (`{ colonne: valeur }`). */
export function rowsOf<T>(table: Table): T[] {
  const { columns } = table;
  return table.rows.map((row) => {
    const record: Record<string, Cell> = {};
    for (let i = 0; i < columns.length; i++) record[columns[i]!] = row[i] ?? null;
    return record as T;
  });
}

/** Valeur des dimensions « toutes valeurs confondues » (France entière, tous groupes…). */
export const ALL = '*';

/** Index des lignes par clé composée. */
export function indexBy<T>(rows: readonly T[], key: (row: T) => string): Map<string, T> {
  return new Map(rows.map((row) => [key(row), row]));
}
