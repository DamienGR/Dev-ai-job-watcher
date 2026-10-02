import { createHash, timingSafeEqual } from 'node:crypto';

export const INTERNAL_SECRET_HEADER = 'x-internal-secret';

/** Comparaison à temps constant (SPEC.md §11), y compris quand les longueurs diffèrent. */
export function safeEqual(provided: string | null | undefined, expected: string | null | undefined): boolean {
  if (!provided || !expected) return false;
  const digest = (value: string) => createHash('sha256').update(value, 'utf8').digest();
  return timingSafeEqual(digest(provided), digest(expected));
}

export interface InternalCallOptions {
  /** URL du site (`URL`, fournie par Netlify). */
  siteUrl: string;
  secret: string;
  fetch?: typeof fetch;
}

/**
 * Déclenche une fonction background (SPEC.md §3.3) : la plateforme répond 202 tout de suite
 * et exécute la fonction en arrière-plan.
 */
export async function callBackgroundFunction(
  name: string,
  body: unknown,
  { siteUrl, secret, fetch: fetchImpl = fetch }: InternalCallOptions,
): Promise<void> {
  const response = await fetchImpl(`${siteUrl.replace(/\/+$/, '')}/.netlify/functions/${name}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', [INTERNAL_SECRET_HEADER]: secret },
    body: JSON.stringify(body),
  });
  if (response.status !== 202) {
    throw new Error(`appel de ${name} refusé : HTTP ${response.status}`);
  }
}
