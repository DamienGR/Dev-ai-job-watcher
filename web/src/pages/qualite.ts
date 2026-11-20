import changelog from '../../../TAXONOMY_CHANGELOG.md?raw';
import { fmtInt, fmtPct, shareOf } from '../lib/format';
import { parseMarkdown, type Inline } from '../lib/markdown';
import { weekLongLabel } from '../lib/periods';
import { rowsOf } from '../lib/table';
import type { Table } from '../lib/types';
import type { Page } from '../page';
import { append, card, dataTable, h, valueOr, type Child } from '../ui';

interface QualityRow {
  run: string;
  source: string;
  status: string;
  collectStatus: string;
  coverageComplete: boolean;
  apiCalls: number;
  errors: number;
  truncatedPartitions: number;
  failedPartitions: number;
  read: number;
  collectedA: number;
  collectedB: number;
  distinct: number;
  abroad: number;
  droppedRetention: number;
  retained: number;
  newOffers: number;
  closed: number;
  classified: number;
  salaryDeclared: number;
  salaryPredicted: number;
  tjm: number;
  noCoordinates: number;
  noRegion: number;
  duplicates: number;
  durationMs: number;
}

const STATUS: Record<string, string> = { complete: 'complet', partial: 'partiel', failed: 'en échec', running: 'en cours' };

function inlines(items: Inline[]): Child[] {
  return items.map((i) => (i.code ? h('code', null, i.text) : i.bold ? h('strong', null, i.text) : i.text));
}

/** Journal de la taxonomie, sans son préambule (titres de version et contenu). */
function changelogView(): HTMLElement {
  const blocks = parseMarkdown(changelog);
  const start = blocks.findIndex((b) => b.kind === 'heading' && b.level === 2);
  const box = h('div', { class: 'changelog' });
  for (const block of blocks.slice(Math.max(0, start))) {
    if (block.kind === 'heading') box.append(h(block.level <= 2 ? 'h3' : 'h4', null, inlines(block.inlines)));
    else if (block.kind === 'paragraph') box.append(h('p', null, inlines(block.inlines)));
    else box.append(h('ul', null, block.items.map((item) => h('li', null, inlines(item)))));
  }
  return box;
}

export const qualitePage: Page = {
  id: 'qualite',
  title: 'Données & qualité',
  async render(ctx) {
    const { meta } = ctx;
    const quality = rowsOf<QualityRow>(await ctx.load<Table>('quality.json')).sort((a, b) => b.run.localeCompare(a.run));
    const last = quality[0];
    const pct = (part: number, total: number) => valueOr(shareOf(part, total), fmtPct);

    append(ctx.root, [
      card(
        'Derniers runs',
        h('p', { class: 'note' }, 'Un run par semaine, le lundi matin : collecte, traitement, puis envoi des agrégats.'),
        dataTable<QualityRow>(
          [
            { label: 'Run', render: (r) => r.run },
            { label: 'Source', render: (r) => meta.sources.find((s) => s.id === r.source)?.label ?? r.source },
            { label: 'Statut', render: (r) => `${STATUS[r.status] ?? r.status}${r.coverageComplete ? '' : ', couverture partielle'}` },
            { label: 'Appels API', numeric: true, render: (r) => fmtInt(r.apiCalls) },
            { label: 'Lues', numeric: true, title: 'Offres lues (passes A et B)', render: (r) => fmtInt(r.read) },
            { label: 'Retenues', numeric: true, render: (r) => fmtInt(r.retained) },
            { label: 'Nouvelles', numeric: true, render: (r) => fmtInt(r.newOffers) },
            { label: 'Fermées', numeric: true, render: (r) => fmtInt(r.closed) },
            { label: 'Classées', numeric: true, render: (r) => pct(r.classified, r.retained) },
            { label: 'Salaire', numeric: true, title: 'Offres avec un salaire déclaré exploitable', render: (r) => pct(r.salaryDeclared, r.retained) },
            { label: 'Géolocalisées', numeric: true, render: (r) => pct(r.retained - r.noCoordinates, r.retained) },
            { label: 'Erreurs', numeric: true, render: (r) => fmtInt(r.errors + r.failedPartitions) },
            { label: 'Durée', numeric: true, render: (r) => `${Math.round(r.durationMs / 100) / 10} s` },
          ],
          quality,
        ),
      ),
      card(
        'Couverture par source',
        h(
          'ul',
          { class: 'facts' },
          last
            ? h(
                'li',
                null,
                h('strong', null, 'France Travail'),
                ` : ${fmtInt(last.collectedA)} offres en passe A (filet des codes ROME), ${fmtInt(last.collectedB)} en passe B (mots-clés), `,
                `${fmtInt(last.distinct)} distinctes ; ${fmtInt(last.abroad)} à l’étranger et ${fmtInt(last.droppedRetention)} hors périmètre écartées. `,
                `${fmtInt(last.truncatedPartitions)} partition(s) tronquée(s).`,
              )
            : null,
          h('li', null, h('strong', null, 'Adzuna'), ' : pas encore collectée (lot 3, après ce dashboard).'),
        ),
      ),
      card(
        'Classification',
        last
          ? h(
              'ul',
              { class: 'facts' },
              h('li', null, `Taux de classification du dernier run : `, h('strong', null, pct(last.classified, last.retained)), ` (${fmtInt(last.classified)} offres classées sur ${fmtInt(last.retained)}).`),
              h('li', null, `Taxonomie v${meta.taxonomy.version}, mise à jour le ${meta.taxonomy.updated}. Elle évolue chaque mois après revue (SPEC.md §9).`),
              h('li', null, 'Les offres non classées restent comptées dans « Toutes offres » et apparaissent avec le périmètre élargi.'),
            )
          : null,
      ),
      card(
        'Périodes partielles',
        h(
          'p',
          null,
          `Premier run : ${weekLongLabel(meta.firstRun)}. France Travail ne renvoie que les offres encore ouvertes : `,
          'les semaines antérieures au premier run sont reconstituées à partir de ces seules offres et sous-estiment le volume réel. ',
          'Ces périodes sont hachurées sur les courbes et signalées « partiel » ailleurs. ',
          'La semaine du dernier run vient de commencer : elle n’apparaît sur les courbes qu’une fois collectée, au run suivant.',
        ),
      ),
      card(
        'Journal de la taxonomie',
        h(
          'ul',
          { class: 'facts' },
          meta.taxonomyHistory.map((entry) => h('li', null, `v${entry.version} appliquée le ${entry.date}`)),
        ),
        h('details', null, h('summary', null, 'Détail des changements'), changelogView()),
      ),
      card(
        'Sources et mentions',
        h(
          'ul',
          { class: 'facts' },
          h('li', null, h('strong', null, 'Source : France Travail'), ', API « Offres d’emploi v2 », réutilisée sous sa licence pour des statistiques agrégées. Aucune annonce n’est republiée.'),
          h('li', null, `Population active (densité de la carte) : ${meta.population.description}, ${meta.population.millesime}.`),
          h('li', null, 'Contours des régions : IGN Admin Express (Licence ouverte), via france-geojson. Fond de carte © contributeurs OpenStreetMap.'),
          h('li', null, 'Aucune donnée personnelle : les contacts des recruteurs sont supprimés dès la collecte.'),
        ),
      ),
    ]);
  },
};
