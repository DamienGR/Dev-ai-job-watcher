import { fmtInt, fmtPct, shareOf } from '../lib/format';
import { dateLongLabel, weekLongLabel } from '../lib/periods';
import { fmtDuration, qualityRows, RUN_STATUS } from '../lib/quality';
import type { Table } from '../lib/types';
import type { Page } from '../page';
import { append, card, dataTable, h, valueOr } from '../ui';

export const qualitePage: Page = {
  id: 'qualite',
  title: 'Données & qualité',
  async render(ctx) {
    const { meta } = ctx;
    const quality = qualityRows(await ctx.load<Table>('quality.json'));
    const last = quality[0];
    const pct = (part: number, total: number) => valueOr(shareOf(part, total), fmtPct);

    append(ctx.root, [
      card(
        'Derniers runs',
        h('p', { class: 'note' }, 'Un run par semaine, le lundi matin : collecte, traitement, puis envoi des agrégats.'),
        dataTable(
          [
            { label: 'Run', render: (r) => r.run },
            { label: 'Source', render: (r) => meta.sources.find((s) => s.id === r.source)?.label ?? r.source },
            { label: 'Statut', render: (r) => `${RUN_STATUS[r.status] ?? r.status}${r.coverageComplete ? '' : ', couverture partielle'}` },
            { label: 'Appels API', numeric: true, render: (r) => fmtInt(r.apiCalls) },
            { label: 'Lues', numeric: true, title: 'Offres lues (passes A et B)', render: (r) => fmtInt(r.read) },
            { label: 'Retenues', numeric: true, render: (r) => fmtInt(r.retained) },
            { label: 'Nouvelles', numeric: true, render: (r) => fmtInt(r.newOffers) },
            { label: 'Fermées', numeric: true, render: (r) => fmtInt(r.closed) },
            { label: 'Classées', numeric: true, render: (r) => pct(r.classified, r.retained) },
            { label: 'Salaire', numeric: true, title: 'Offres avec un salaire déclaré exploitable', render: (r) => pct(r.salaryDeclared, r.retained) },
            { label: 'Géolocalisées', numeric: true, render: (r) => pct(r.retained - r.noCoordinates, r.retained) },
            { label: 'Erreurs', numeric: true, render: (r) => fmtInt(r.errors + r.failedPartitions) },
            { label: 'Durée', numeric: true, render: (r) => fmtDuration(r.durationMs) },
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
        'Taxonomie',
        h(
          'p',
          null,
          `Version ${meta.taxonomy.version} du ${dateLongLabel(meta.taxonomy.updated)}, appliquée à toutes les offres depuis le premier run. `,
          'Chaque version, les propositions de la revue mensuelle et l’effet des changements sur la part des offres classées : ',
          h('a', { href: '/methodologie/journal/' }, 'journal de la taxonomie'),
          '.',
        ),
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
