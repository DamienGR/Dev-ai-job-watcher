import { loadMeta, NoDataError } from './data';
import { fmtPct, shareOf } from './lib/format';
import { journalRows, type JournalRow } from './lib/journal';
import { dateLongLabel, weekLabel, weekLongLabel } from './lib/periods';
import type { ClassifiedShare, Meta } from './lib/types';
import './site/site';

// Page « Journal de la taxonomie » (SPEC.md §17.2, lot 6). Le tableau des versions est écrit au
// build à partir de TAXONOMY_CHANGELOG.md ; ce script remplit ses deux dernières colonnes avec
// `meta.taxonomyHistory`, lu en direct : application aux données et effet du reclassement. Le
// tableau garde sa taille : la page ne bouge pas au chargement.

function appliedText(row: JournalRow, meta: Meta): string {
  switch (row.status) {
    case 'premier':
      return `Dès le premier run (semaine du ${weekLabel(meta.firstRun)})`;
    case 'appliquee':
      return row.appliedAt ? `Le ${dateLongLabel(row.appliedAt)}` : 'Oui';
    case 'incluse':
      return 'Avec la version suivante';
    case 'avant':
      return 'Non : avant le premier run';
    case 'attente':
      return 'En attente du reclassement';
  }
}

const share = (s: ClassifiedShare) => {
  const value = shareOf(s.classified, s.retained);
  return value === null ? '—' : fmtPct(value);
};

function fill(tr: HTMLTableRowElement, applied: string, effect: string, title?: string): void {
  const appliedCell = tr.querySelector<HTMLElement>('[data-applied]');
  const effectCell = tr.querySelector<HTMLElement>('[data-effect]');
  if (appliedCell) appliedCell.textContent = applied;
  if (effectCell) {
    effectCell.textContent = effect;
    if (title) effectCell.title = title;
  }
}

async function start(): Promise<void> {
  const table = document.querySelector<HTMLTableElement>('[data-journal]');
  if (!table) return;
  const trs = [...table.querySelectorAll<HTMLTableRowElement>('tr[data-version]')];
  const versions = trs.map((tr) => ({ version: Number(tr.dataset.version), date: tr.dataset.date ?? '' }));
  try {
    const meta = await loadMeta();
    journalRows(versions, meta.taxonomyHistory).forEach((row, i) => {
      const effect = row.effect;
      fill(
        trs[i]!,
        appliedText(row, meta),
        effect ? `${share(effect.before)} → ${share(effect.after)}` : '—',
        effect ? `Run de la ${weekLongLabel(effect.run)}` : undefined,
      );
    });
  } catch (error) {
    const text = error instanceof NoDataError ? 'Après le premier run' : 'Momentanément indisponible';
    for (const tr of trs) fill(tr, text, '—');
  }
}

void start();
