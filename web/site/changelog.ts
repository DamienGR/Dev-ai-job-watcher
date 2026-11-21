import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Marked } from 'marked';
import { escapeHtml, longDate, shortDate } from './text';

// Journal des changements de la taxonomie (`TAXONOMY_CHANGELOG.md`, SPEC.md §9.2) sur la page
// « Journal de la taxonomie » (§17.2, lot 6). Au build, le tableau des versions et le détail
// de chaque version remplacent les marqueurs `<!-- site:taxonomy-versions -->` et
// `<!-- site:taxonomy-changelog -->` du texte de la page ; le script de la page complète
// ensuite le tableau avec `meta.taxonomyHistory` (application aux données, effet).
//
// Les entrées sont écrites par la revue mensuelle à partir d'intitulés d'offres : le HTML brut
// y est échappé, les liens relatifs mènent au fichier du dépôt, une image ou un lien autre que
// web arrête le build.

export const CHANGELOG_FILE = join(import.meta.dirname, '..', '..', 'TAXONOMY_CHANGELOG.md');
export const VERSIONS_MARKER = '<!-- site:taxonomy-versions -->';
export const CHANGELOG_MARKER = '<!-- site:taxonomy-changelog -->';

const ENTRY = /^## v(\d+) — (\d{4}-\d{2}-\d{2})[ \t]*$/;

export interface ChangelogEntry {
  version: number;
  date: string;
  /** Markdown de l'entrée, sans son titre. */
  body: string;
}

export function readChangelog(file = CHANGELOG_FILE): string {
  return readFileSync(file, 'utf8');
}

/**
 * Entrées du journal, de la plus récente à la plus ancienne, sans le préambule. Refuse un
 * titre de niveau 2 hors du format `## v<N> — <AAAA-MM-JJ>` ou des versions dans le désordre.
 */
export function parseChangelog(source: string): ChangelogEntry[] {
  const entries: { version: number; date: string; lines: string[] }[] = [];
  let fence = false;
  for (const line of source.split('\n')) {
    if (/^(```|~~~)/.test(line)) fence = !fence;
    if (!fence && line.startsWith('## ')) {
      const match = ENTRY.exec(line);
      if (!match) throw new Error(`TAXONOMY_CHANGELOG.md : titre « ${line} » hors format (## v<N> — <AAAA-MM-JJ>)`);
      const entry = { version: Number(match[1]), date: match[2]!, lines: [] };
      const previous = entries.at(-1);
      if (previous && (entry.version >= previous.version || entry.date > previous.date)) {
        throw new Error(`TAXONOMY_CHANGELOG.md : v${entry.version} après v${previous.version} (attendu : de la plus récente à la plus ancienne)`);
      }
      entries.push(entry);
    } else {
      entries.at(-1)?.lines.push(line);
    }
  }
  if (entries.length === 0) throw new Error('TAXONOMY_CHANGELOG.md : aucune version');
  return entries.map(({ version, date, lines }) => ({ version, date, body: lines.join('\n').trim() }));
}

/** Date de révision de la page : celle de son texte, ou celle de la dernière version si elle est plus récente. */
export function journalUpdated(textUpdated: string, entries: readonly ChangelogEntry[]): string {
  const latest = entries[0]?.date ?? textUpdated;
  return latest > textUpdated ? latest : textUpdated;
}

function repositoryHref(href: string, repository: string): string {
  if (/^https?:\/\//i.test(href) || href.startsWith('#') || href.startsWith('/')) return href;
  if (/^[a-z][a-z0-9+.-]*:/i.test(href)) throw new Error(`TAXONOMY_CHANGELOG.md : lien refusé (${href})`);
  return `${repository}/blob/main/${href.replace(/^\.\//, '')}`;
}

function changelogMarkdown(repository: string): Marked {
  return new Marked({
    gfm: true,
    walkTokens(token) {
      // Le titre d'une entrée devient un h3 : ses sous-titres commencent au h4.
      if (token.type === 'heading') token.depth = Math.min(6, Math.max(4, token.depth + 1));
      if (token.type === 'image') throw new Error(`TAXONOMY_CHANGELOG.md : image refusée (${token.href})`);
      if (token.type === 'link') token.href = repositoryHref(token.href, repository);
    },
    renderer: {
      html: (token) => (token.block ? `<p>${escapeHtml(token.text.trim())}</p>\n` : escapeHtml(token.text)),
    },
  });
}

/**
 * Tableau des versions, rempli au build avec le numéro et la date de chaque version. Les
 * cellules `data-applied` et `data-effect` sont complétées par le script de la page.
 */
export function renderVersionsTable(entries: readonly ChangelogEntry[]): string {
  const rows = entries.map(
    (e) =>
      `<tr data-version="${e.version}" data-date="${e.date}"><th scope="row"><a href="#v${e.version}">v${e.version}</a></th>` +
      `<td>${shortDate(e.date)}</td><td data-applied>…</td><td class="num" data-effect>…</td></tr>`,
  );
  return [
    '<div class="table-wrap" tabindex="0">',
    '<table data-journal>',
    '<caption>Versions de la taxonomie, de la plus récente à la plus ancienne</caption>',
    '<thead><tr><th scope="col">Version</th><th scope="col">Date</th><th scope="col">Appliquée aux données</th>' +
      '<th scope="col" class="num" title="Part des offres retenues rangées dans un métier, au dernier run, avec la version précédente puis avec celle-ci">Offres classées, avant → après</th></tr></thead>',
    `<tbody>\n${rows.join('\n')}\n</tbody>`,
    '</table>',
    '</div>',
  ].join('\n');
}

/** Détail de chaque version : un titre ancré (`#v<N>`) et la note du journal convertie. */
export function renderChangelog(entries: readonly ChangelogEntry[], repository: string): string {
  const markdown = changelogMarkdown(repository);
  return entries
    .map((e) => `<h3 id="v${e.version}">Version ${e.version} · ${longDate(e.date)}</h3>\n${markdown.parse(e.body, { async: false }).trim()}`)
    .join('\n');
}

/** Remplace les deux marqueurs du texte rendu de la page ; chacun doit y être une seule fois. */
export function withChangelog(html: string, entries: readonly ChangelogEntry[], repository: string): string {
  let out = html;
  for (const [marker, block] of [
    [VERSIONS_MARKER, () => renderVersionsTable(entries)],
    [CHANGELOG_MARKER, () => renderChangelog(entries, repository)],
  ] as const) {
    const count = out.split(marker).length - 1;
    if (count !== 1) throw new Error(`marqueur ${marker} trouvé ${count} fois (attendu : 1)`);
    out = out.replace(marker, block);
  }
  return out;
}
