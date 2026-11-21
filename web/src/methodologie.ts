import { loadFile, loadMeta, NoDataError } from './data';
import { fmtInt, fmtPct, shareOf } from './lib/format';
import { weekLabel, weekLongLabel } from './lib/periods';
import { fmtDuration, qualityRows, RUN_STATUS, type QualityRow } from './lib/quality';
import type { Meta, Table } from './lib/types';
import './site/site';
import { dataTable, h, valueOr } from './ui';

// Page Méthodologie (SPEC.md §17.2) : texte au build, qualité des derniers runs lue en direct
// dans `quality.json`, comme la page « Données & qualité » du tableau de bord.

const RUNS_SHOWN = 6;

function pct(part: number, total: number) {
  return valueOr(shareOf(part, total), fmtPct);
}

function render(slot: HTMLElement, meta: Meta, rows: QualityRow[]): void {
  const last = rows[0];
  if (!last) {
    slot.replaceChildren(h('p', { class: 'note' }, 'Aucun run publié pour l’instant.'));
    return;
  }
  const status = (r: QualityRow) => (r.status === 'complete' && r.coverageComplete ? null : ` (${RUN_STATUS[r.status] ?? r.status}${r.coverageComplete ? '' : ', couverture partielle'})`);
  slot.replaceChildren(
    h(
      'p',
      null,
      `Au dernier run (${weekLongLabel(last.run)}), ${fmtInt(last.read)} offres ont été lues et ${fmtInt(last.retained)} retenues, dont ${fmtInt(last.newOffers)} vues pour la première fois. `,
      'Parmi les offres retenues, ',
      h('strong', null, pct(last.classified, last.retained)),
      ' ont trouvé un métier de la taxonomie, ',
      h('strong', null, pct(last.salaryDeclared, last.retained)),
      ' annoncent un salaire exploitable et ',
      h('strong', null, pct(last.retained - last.noCoordinates, last.retained)),
      ` sont localisées précisément sur la carte. Taxonomie en vigueur : version ${meta.taxonomy.version}.`,
    ),
    dataTable(
      [
        { label: 'Run', render: (r) => [`${weekLabel(r.run)}`, status(r)] },
        { label: 'Lues', numeric: true, title: 'Offres lues, recherches par métier et par mot-clé confondues', render: (r) => fmtInt(r.read) },
        { label: 'Retenues', numeric: true, render: (r) => fmtInt(r.retained) },
        { label: 'Nouvelles', numeric: true, title: 'Offres vues pour la première fois', render: (r) => fmtInt(r.newOffers) },
        { label: 'Classées', numeric: true, title: 'Part des offres retenues rangées dans un métier', render: (r) => pct(r.classified, r.retained) },
        { label: 'Salaire', numeric: true, title: 'Part des offres retenues avec un salaire déclaré exploitable', render: (r) => pct(r.salaryDeclared, r.retained) },
        { label: 'Localisées', numeric: true, title: 'Part des offres retenues avec des coordonnées', render: (r) => pct(r.retained - r.noCoordinates, r.retained) },
        { label: 'Durée', numeric: true, title: 'Durée du traitement', render: (r) => fmtDuration(r.durationMs) },
      ],
      rows.slice(0, RUNS_SHOWN),
      `Qualité des ${Math.min(RUNS_SHOWN, rows.length)} derniers runs France Travail, du plus récent au plus ancien`,
    ),
    h('p', { class: 'note' }, 'Lundi de la semaine du run. Toutes les colonnes et l’historique complet : ', h('a', { href: '/tableau-de-bord/#/qualite' }, 'tableau de bord, page Données & qualité'), '.'),
  );
}

async function start(): Promise<void> {
  const slot = document.querySelector<HTMLElement>('[data-quality]');
  if (!slot) return;
  try {
    const meta = await loadMeta();
    render(slot, meta, qualityRows(await loadFile<Table>('quality.json', meta), 'francetravail'));
  } catch (error) {
    const text =
      error instanceof NoDataError
        ? 'Les chiffres apparaîtront après le premier run hebdomadaire.'
        : 'Les chiffres sont momentanément indisponibles. Rechargez la page dans quelques instants.';
    slot.replaceChildren(h('p', { class: 'note' }, text));
  }
}

void start();
