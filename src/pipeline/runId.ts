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
