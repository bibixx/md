import type { MarkedToken, Tokens } from 'marked';
import { NL, width, wrapText, codeBlock, endsWithBlankLine } from './text.ts';
import { render, listMarker, listBounds, isMarkedToken, topLevel } from './tokens.ts';
import { renderTable } from './table.ts';
import type { RenderContext } from './types.ts';

const RIGHT_MARGIN = 4;
const LIST_ROOM_INSET = 10;
const MAX_LIST_INDENT = 32;
const STANDALONE = new Set(['code', 'blockquote', 'hr', 'table']);

export const listRoom = (cols: number): number => cols - RIGHT_MARGIN - LIST_ROOM_INSET;

function fitIndent(indent: number, markerWidth: number, room: number) {
  const rowIndent = Math.max(0, Math.min(indent, room - 2));
  const markerCell = Math.max(2, Math.min(markerWidth, room - rowIndent));
  return { rowIndent, markerCell };
}

export function endsLoose(item: Tokens.ListItem | undefined): boolean {
  const last = item?.tokens.at(-1);
  if (last === undefined || !isMarkedToken(last)) return false;
  if (last.type === 'space' || last.type === 'heading' || last.type === 'table') return true;
  if (last.type === 'list') {
    return endsLoose(last.items.at(-1));
  }
  return false;
}

interface ListLayout {
  indent: number;
  depth: number;
  cols: number;
  room: number;
}

function list(token: Tokens.List, ctx: RenderContext, { indent, depth, cols, room, blankLineBefore }: ListLayout & { blankLineBefore: boolean }): string[] {
  const { first } = listBounds(token);
  return token.items.flatMap((item, i) =>
    listItem(item, ctx, {
      marker: listMarker(depth, token.ordered ? { number: first + i, ...listBounds(token) } : null),
      blankLineBefore: i === 0 ? blankLineBefore : endsLoose(token.items[i - 1]),
      indent,
      depth,
      cols,
      room,
    })
  );
}

type Part =
  | { kind: 'inline'; text: string }
  | { kind: 'block'; text: string; code: boolean; token: MarkedToken }
  | { kind: 'list'; token: Tokens.List };

export function listItem(item: Tokens.ListItem, ctx: RenderContext, { marker, blankLineBefore, indent, depth, cols, room }: ListLayout & { marker: string; blankLineBefore: boolean }): string[] {
  const parts: Part[] = [];
  // newer marked versions add a 'checkbox' token for task items; md draws its own
  for (const t of item.tokens.filter((x) => x.type !== 'checkbox')) {
    if (isMarkedToken(t) && t.type === 'list') {
      parts.push({ kind: 'list', token: t });
      continue;
    }
    const s = render(t, { ...ctx, listDepth: depth + 1, orderedListNumber: null, parent: item, inListItemText: false });
    if (isMarkedToken(t) && STANDALONE.has(t.type)) {
      parts.push({ kind: 'block', text: s, code: t.type === 'code', token: t });
      continue;
    }
    const last = parts.at(-1);
    if (last?.kind === 'inline') last.text += s;
    else parts.push({ kind: 'inline', text: s });
  }
  if (parts[0]?.kind !== 'inline') parts.unshift({ kind: 'inline', text: '' });

  const markerWidth = width(marker) + 1;
  const childIndent = Math.min(indent + markerWidth, MAX_LIST_INDENT);
  const { rowIndent, markerCell } = fitIndent(indent, markerWidth, room);
  const out: string[] = [];
  let blank = blankLineBefore;

  parts.forEach((part, i) => {
    if (part.kind === 'inline') {
      const startsWithNewline = part.text.startsWith(NL);
      const endsBlank = endsWithBlankLine(part.text);
      const text = part.text.replace(/^\n+/u, '').trimEnd();
      if (!text && i > 0) {
        blank ||= part.text.includes(NL);
        return;
      }
      const isFirst = i === 0;
      if (blank || (!isFirst && startsWithNewline)) out.push('');
      const left = isFirst ? rowIndent : rowIndent + markerCell;
      const lines = wrapText(text, cols - left - (isFirst ? markerCell : 0));
      lines.forEach((line, j) => {
        const lead = isFirst && j === 0 ? ' '.repeat(rowIndent) + marker.padEnd(markerCell) : ' '.repeat(isFirst ? rowIndent + markerCell : left);
        out.push(lead + line);
      });
      blank = endsBlank;
    } else if (part.kind === 'block') {
      // Claude Code prints these at column 0, and tables as pipe text.
      if (blank) out.push('');
      const left = rowIndent + markerCell;
      const lines =
        part.token.type === 'table' ? renderTable(part.token, topLevel(ctx), cols - left)
        : part.code ? codeBlock(part.text.replace(/\n$/u, '').split(NL), cols - left, ctx.theme.codeBg, ctx.codePadding)
        : wrapText(part.text.replace(/^\n+/u, '').trimEnd(), cols - left);
      out.push(...lines.map((line) => (line ? ' '.repeat(left) + line : line)));
      blank = false;
    } else {
      out.push(...list(part.token, ctx, { indent: childIndent, depth: depth + 1, cols, room, blankLineBefore: blank }));
      blank = false;
    }
  });
  return out;
}
