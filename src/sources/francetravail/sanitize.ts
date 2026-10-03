import type { FtOffer } from './api';

/**
 * Champs de contact retirés avant toute écriture, y compris dans `raw` (SPEC.md §11, exigé) :
 * `contact` (recruteur : nom, e-mail, téléphone, adresse) et `agence` (coordonnées de
 * l'agence France Travail). Le nom de l'entreprise (personne morale) est conservé.
 */
export const CONTACT_FIELDS = ['contact', 'agence'] as const;

const EMAIL = /[a-z0-9._%+-]+@[a-z0-9-]+(?:\.[a-z0-9-]+)*\.[a-z]{2,}/gi;
// Numéros français : 01 23 45 67 89, 01.23.45.67.89, 0123456789, +33 1 23 45 67 89…
const PHONE = /(?<![\d+])(?:(?:\+|00)33\s?(?:\(0\)\s?)?|0)[1-9](?:[\s.-]?\d{2}){4}(?!\d)/g;

/** Masque e-mails et numéros de téléphone d'un texte libre. */
export function redactContacts(text: string): string {
  return text.replace(EMAIL, '[e-mail masqué]').replace(PHONE, '[téléphone masqué]');
}

/**
 * Offre sans champs de contact. Par précaution, les e-mails et téléphones cités dans les
 * descriptions sont aussi masqués (voir docs/decisions.md).
 */
export function sanitizeOffer(offer: FtOffer): FtOffer {
  const clean: FtOffer = { ...offer };
  for (const field of CONTACT_FIELDS) delete clean[field];
  if (typeof clean.description === 'string') clean.description = redactContacts(clean.description);
  const entreprise = clean.entreprise;
  if (entreprise && typeof entreprise === 'object' && !Array.isArray(entreprise)) {
    const copy = { ...(entreprise as Record<string, unknown>) };
    if (typeof copy.description === 'string') copy.description = redactContacts(copy.description);
    clean.entreprise = copy;
  }
  return clean;
}
