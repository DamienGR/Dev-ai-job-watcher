import { SITE } from './config';

// `/.well-known/security.txt` (RFC 9116, D71) : où signaler une faille du site ou du dépôt.
// Écrit au build par le plugin du site. `Expires` est obligatoire et doit rester à moins d'un
// an : il est recalculé à chaque build, et le site est redéployé à chaque fusion sur `main`.

export const SECURITY_CONTACT = 'mailto:contact@dg-tech.dev';
export const SECURITY_TXT = '.well-known/security.txt';

/** Durée de validité annoncée, comptée depuis le build (RFC 9116 : moins d'un an). */
const VALIDITY_DAYS = 360;

export function renderSecurityTxt(now: Date = new Date(), url: string = SITE.url): string {
  const expires = new Date(now.getTime() + VALIDITY_DAYS * 86_400_000);
  expires.setUTCHours(0, 0, 0, 0);
  return [
    `Contact: ${SECURITY_CONTACT}`,
    `Expires: ${expires.toISOString().replace('.000Z', 'Z')}`,
    'Preferred-Languages: fr, en',
    `Canonical: ${url}/${SECURITY_TXT}`,
    `Policy: ${SITE.repository}/blob/main/SECURITY.md`,
    '',
  ].join('\n');
}
