// Rendu minimal du journal de la taxonomie (TAXONOMY_CHANGELOG.md) pour la page « Données &
// qualité » : titres, paragraphes, listes, `code`, **gras** ; les liens gardent leur texte.
// Le résultat est une structure, insérée ensuite avec `textContent` (aucun HTML brut).

export interface Inline {
  text: string;
  code?: boolean;
  bold?: boolean;
}

export type Block =
  | { kind: 'heading'; level: number; inlines: Inline[] }
  | { kind: 'paragraph'; inlines: Inline[] }
  | { kind: 'list'; items: Inline[][] };

export function parseInline(text: string): Inline[] {
  const inlines: Inline[] = [];
  const pattern = /`([^`]+)`|\*\*([^*]+)\*\*|\[([^\]]+)\]\([^)]*\)/g;
  let last = 0;
  for (let match = pattern.exec(text); match; match = pattern.exec(text)) {
    if (match.index > last) inlines.push({ text: text.slice(last, match.index) });
    if (match[1] !== undefined) inlines.push({ text: match[1], code: true });
    else if (match[2] !== undefined) inlines.push({ text: match[2], bold: true });
    else inlines.push({ text: match[3]! });
    last = match.index + match[0].length;
  }
  if (last < text.length) inlines.push({ text: text.slice(last) });
  return inlines;
}

export function parseMarkdown(source: string): Block[] {
  const blocks: Block[] = [];
  let paragraph: string[] = [];
  let list: string[] | null = null;
  const flush = () => {
    if (paragraph.length) blocks.push({ kind: 'paragraph', inlines: parseInline(paragraph.join(' ')) });
    if (list) blocks.push({ kind: 'list', items: list.map(parseInline) });
    paragraph = [];
    list = null;
  };
  for (const raw of source.split('\n')) {
    const line = raw.trimEnd();
    const heading = /^(#{1,6})\s+(.*)$/.exec(line);
    const item = /^[-*]\s+(.*)$/.exec(line);
    if (heading) {
      flush();
      blocks.push({ kind: 'heading', level: heading[1]!.length, inlines: parseInline(heading[2]!) });
    } else if (item) {
      if (paragraph.length) {
        blocks.push({ kind: 'paragraph', inlines: parseInline(paragraph.join(' ')) });
        paragraph = [];
      }
      (list ??= []).push(item[1]!);
    } else if (line.trim() === '') {
      flush();
    } else if (list && /^\s+/.test(raw)) {
      list[list.length - 1] += ` ${line.trim()}`;
    } else {
      if (list) flush();
      paragraph.push(line.trim());
    }
  }
  flush();
  return blocks;
}
