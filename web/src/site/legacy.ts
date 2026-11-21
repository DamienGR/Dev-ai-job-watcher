// Anciens liens du tableau de bord (SPEC.md §17.4, exigé) : avant le lot S2, il était servi à
// la racine, en pages à fragment (`/#/metiers?region=11`). Le fragment n'arrive jamais au
// serveur : l'accueil redirige en JavaScript vers `/tableau-de-bord/`, fragment conservé.

export const DASHBOARD_PATH = '/tableau-de-bord/';

/** Adresse du tableau de bord pour un fragment d'ancien lien, ou `null` si ce n'en est pas un. */
export function legacyDashboardUrl(hash: string): string | null {
  return hash.startsWith('#/') ? `${DASHBOARD_PATH}${hash}` : null;
}
