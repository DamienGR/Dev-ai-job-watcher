/** Identifiant de run : semaine ISO en Europe/Paris, ex. « 2026-W41 » (SPEC.md §3.3). */
export const RUN_ID_PATTERN = /^\d{4}-W(0[1-9]|[1-4]\d|5[0-3])$/;

export function isRunId(value: string): boolean {
  return RUN_ID_PATTERN.test(value);
}

export function runIdFor(date: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Paris',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const field = (type: string) => Number(parts.find((part) => part.type === type)?.value);

  // Semaine ISO : celle du jeudi de la semaine (lundi = premier jour).
  const day = new Date(Date.UTC(field('year'), field('month') - 1, field('day')));
  const weekday = day.getUTCDay() || 7;
  day.setUTCDate(day.getUTCDate() + 4 - weekday);
  const isoYear = day.getUTCFullYear();
  const week = Math.ceil(((day.getTime() - Date.UTC(isoYear, 0, 1)) / 86_400_000 + 1) / 7);
  return `${isoYear}-W${String(week).padStart(2, '0')}`;
}

/** Lundi (00:00 UTC) de la semaine ISO `runId`. */
export function weekStart(runId: string): Date {
  const match = /^(\d{4})-W(\d{2})$/.exec(runId);
  if (!match) throw new Error(`runId invalide : ${runId}`);
  const year = Number(match[1]);
  // Le 4 janvier est toujours en semaine 1.
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const monday = new Date(jan4.getTime() - ((jan4.getUTCDay() || 7) - 1) * 86_400_000);
  return new Date(monday.getTime() + (Number(match[2]) - 1) * 7 * 86_400_000);
}

/** Semaine ISO décalée de `weeks` semaines (négatif pour reculer). */
export function addWeeks(runId: string, weeks: number): string {
  // Midi UTC : même jour calendaire à Paris.
  return runIdFor(new Date(weekStart(runId).getTime() + weeks * 7 * 86_400_000 + 12 * 3_600_000));
}

const monthFormat = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit' });

/** Mois (AAAA-MM, Europe/Paris) d'un instant ISO 8601. */
export function monthOf(iso: string): string {
  const parts = monthFormat.formatToParts(new Date(iso));
  return `${parts.find((p) => p.type === 'year')?.value}-${parts.find((p) => p.type === 'month')?.value}`;
}
