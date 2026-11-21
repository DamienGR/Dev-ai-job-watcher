// Petits outils de texte des pages, sans dépendance au reste du site.

export function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

const LONG_DATE = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
const SHORT_DATE = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });

function parseDate(date: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error(`date invalide : ${date}`);
  return new Date(`${date}T00:00:00Z`);
}

/** Date AAAA-MM-JJ en toutes lettres (« 21 novembre 2026 ») ; refuse un autre format. */
export function longDate(date: string): string {
  return LONG_DATE.format(parseDate(date));
}

/** Date AAAA-MM-JJ abrégée et insécable, pour un tableau (« 21 nov. 2026 »). */
export function shortDate(date: string): string {
  return SHORT_DATE.format(parseDate(date)).replace(/ /g, '\u00a0');
}
