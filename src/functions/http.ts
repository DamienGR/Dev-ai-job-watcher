import { safeEqual } from '../pipeline/internal';

/** Jeton `Authorization: Bearer …` de la requête, `null` s'il manque. */
export function bearerToken(req: Request): string | null {
  const authorization = req.headers.get('authorization') ?? '';
  return authorization.startsWith('Bearer ') ? authorization.slice('Bearer '.length) : null;
}

/** Vrai si la requête porte le secret attendu (comparaison à temps constant, SPEC.md §11). */
export function hasBearer(req: Request, expected: string | undefined): boolean {
  return safeEqual(bearerToken(req), expected);
}

/** Nom de fichier après le préfixe de la route (`/api/data/review/2026-10.json` → `review/2026-10.json`). */
export function fileNameAfter(req: Request, prefix: string): string | null {
  const { pathname } = new URL(req.url);
  if (!pathname.startsWith(prefix)) return null;
  try {
    return decodeURIComponent(pathname.slice(prefix.length));
  } catch {
    return null;
  }
}
