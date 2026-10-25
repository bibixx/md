// Lays rendered tokens out into terminal lines, the way Claude Code's <Markdown> component
// stacks its boxes: prose is gathered into one text block, while tables, quotes and lists
// are separate boxes with their own top margins.
//
// Everything that doesn't depend on the terminal width (parsing, styling, highlighting and
// the blank lines between blocks) happens once in segments(). What's left is a list of
// independent units, each wrapping itself to a width on demand, so a viewer only has to
// lay out the units that are on screen.
import chalk from 'chalk';
import { Lexer } from 'marked';
import { NL, width, strip, wrapText, codeBlock, endsWithBlankLine } from './text.mjs';
import { render, listMarker, listBounds } from './tokens.mjs';
import { renderTable } from './table.mjs';

const RIGHT_MARGIN = 4;
const LIST_ROOM_INSET = 10;
const MAX_LIST_INDENT = 32;
const QUOTE_BAR = '▎';
const STANDALONE = new Set(['code', 'blockquote', 'hr', 'table']);

const base = (ctx) => ({ ...ctx, listDepth: 0, orderedListNumber: null, parent: null, glueProse: false });

// Render the whole document at one width.
export function layout(src, ctx, cols) {
  return segments(src, ctx).flatMap((unit) => (unit.blank ? ['', ...unit.render(cols)] : unit.render(cols)));
}

// A unit is { blank, render(cols) → lines, estimate(cols) → line count }; `blank` means one
// empty line goes above it. Units are: one line of prose (a paragraph, a heading, a line of
// code block), one top-level list item, one table, or one line of a quote.
export function segments(src, ctx) {
  const tokens = new Lexer({ gfm: true }).lex(src.replace(/\r\n?/g, NL));
  const units = [];
  let prev = 'none'; // kind of the last box: none | prose | block | list | code
  let prose = '';
  let proseLines = 0; // newlines in `prose` so far
  let codeRanges = []; // { from, to, raw, lines() }: lines of `prose` that hold a code block's raw text
  let proseEndedBlank = false;

  const addProse = (s) => {
    prose += s;
    for (let i = s.indexOf(NL); i !== -1; i = s.indexOf(NL, i + 1)) proseLines++;
  };

  const add = (blank, render, estimate) => units.push({ blank: blank && units.length > 0, render, estimate });

  // one unit per line of already-styled text; chalk re-opens styles on every line, so each
  // line wraps on its own exactly as it would as part of the whole block
  const addLines = (text, blank, wrapLine) =>
    text.split(NL).forEach((line, i) => add(i === 0 && blank, (cols) => wrapLine(line, cols), estimateLine(line)));

  const flushProse = () => {
    if (!prose) return;
    const startsWithNewline = prose.startsWith(NL);
    const endsBlank = endsWithBlankLine(prose);
    const leading = prose.match(/^\n*/)[0].length;
    const text = prose.replace(/^\n+/, '').trimEnd();
    const code = codeRanges;
    prose = '';
    proseLines = 0;
    codeRanges = [];
    if (!text) {
      proseEndedBlank = true;
      return;
    }
    const margin = prev === 'none' ? 0 : (prev === 'list' || prev === 'code') && !startsWithNewline ? 0 : 1;
    let block = 0;
    let added = -1; // last code block that has its unit
    text.split(NL).forEach((line, i) => {
      const at = i + leading; // line number within `prose`
      while (block < code.length && code[block].to <= at) block++;
      const range = block < code.length && code[block].from <= at ? code[block] : undefined;
      if (!range) return add(i === 0 && margin > 0, (cols) => wrapText(line, cols), estimateLine(line));
      // a code block is one unit, so its padding rows go above and below the whole block
      if (added === block) return;
      added = block;
      const estimates = range.raw.map(estimateLine);
      const { top = 0, bottom = 0 } = ctx.codePadding ?? {};
      add(i === 0 && margin > 0, (cols) => codeBlock(range.lines(), cols, ctx.theme.codeBg, ctx.codePadding), (cols) => top + bottom + estimates.reduce((n, e) => n + e(cols), 0));
    });
    prev = 'prose';
    proseEndedBlank = endsBlank;
  };

  // A code block is styled (and highlighted, if the highlighter knows its language) when it's
  // first shown. Until then `prose` holds its raw text, which has the same line breaks. The
  // dimmed label of an unknown language goes into `prose` as is, outside the block.
  const addCode = (t) => {
    if (prose !== '' && !prose.endsWith(NL)) return false;
    const raw = t.text.split(NL);
    let lines;
    if (t.lang && !ctx.highlight?.supportsLanguage(t.lang)) {
      const [label, ...rest] = render(t, base(ctx)).split(NL);
      addProse(label + NL);
      lines = () => rest.slice(0, raw.length);
    } else {
      let all;
      lines = () => (all ??= render(t, base(ctx)).split(NL)).slice(0, raw.length);
    }
    codeRanges.push({ from: proseLines, to: proseLines + raw.length, raw, lines });
    addProse(t.text + NL);
    return true;
  };

  const blockMargin = (kind) => (prev === 'none' ? 0 : kind === 'block' || prev === 'block' || proseEndedBlank ? 1 : 0);

  for (const t of tokens) {
    if (t.type === 'table') {
      flushProse();
      add(blockMargin('block') > 0, (cols) => renderTable(t, base(ctx), cols), () => 2 * t.rows.length + 3);
      prev = 'block';
    } else if (t.type === 'list') {
      flushProse();
      // the first item carries the list's top margin
      const blankLineBefore = blockMargin('list') > 0;
      const { first } = listBounds(t);
      t.items.forEach((item, i) => {
        const opts = {
          marker: listMarker(0, t.ordered ? { number: first + i, ...listBounds(t) } : null),
          blankLineBefore: i === 0 ? blankLineBefore : endsLoose(t.items[i - 1]),
          indent: 0,
          depth: 0,
        };
        const sourceLines = item.raw.trimEnd().split(NL).length;
        add(false, (cols) => listItem(item, ctx, { ...opts, cols, room: cols - RIGHT_MARGIN - LIST_ROOM_INSET }), () => sourceLines);
      });
      prev = 'list';
    } else if (t.type === 'blockquote') {
      flushProse();
      const bar = chalk.dim(QUOTE_BAR);
      addLines(quoteBody(t, ctx), blockMargin('block') > 0, (line, cols) => wrapText(line, cols - 2).map((l) => `${bar} ${l}`));
      prev = 'block';
    } else if (!(t.type === 'code' && addCode(t))) addProse(render(t, base(ctx)));
  }
  flushProse();
  return units;
}

// Cheap guess of how many rows a line wraps to, for units not laid out yet.
// The plain length is width-independent, so it's measured once.
function estimateLine(line) {
  let length;
  return (cols) => {
    length ??= strip(line).length;
    return Math.max(1, Math.ceil(length / Math.max(1, cols)));
  };
}

// ---------- blockquote: left "quote" border, dimmed, then italic text ----------

function quoteBody(t, ctx) {
  const text = (t.tokens ?? []).map((x) => render(x, { ...base(ctx), quotesAround: 1 })).join('');
  return chalk.italic(text.replace(/^\n+/, '').trimEnd());
}

// ---------- lists: marker in its own cell, text with a hanging indent ----------

function fitIndent(indent, markerWidth, room) {
  const rowIndent = Math.max(0, Math.min(indent, room - 2));
  const markerCell = Math.max(2, Math.min(markerWidth, room - rowIndent));
  return { rowIndent, markerCell };
}

function endsLoose(item) {
  const last = item.tokens.at(-1);
  if (last?.type === 'space' || last?.type === 'heading' || last?.type === 'table') return true;
  if (last?.type === 'list') {
    const lastItem = last.items.at(-1);
    return lastItem ? endsLoose(lastItem) : false;
  }
  return false;
}

function list(token, ctx, { indent, depth, cols, room, blankLineBefore }) {
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

function listItem(item, ctx, { marker, blankLineBefore, indent, depth, cols, room }) {
  const parts = [];
  for (const t of item.tokens.filter((x) => x.type !== 'checkbox')) {
    if (t.type === 'list') {
      parts.push({ kind: 'list', token: t });
      continue;
    }
    const s = render(t, { ...ctx, listDepth: depth + 1, orderedListNumber: null, parent: item, glueProse: false });
    if (STANDALONE.has(t.type)) {
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
  const out = [];
  let blank = blankLineBefore;

  parts.forEach((part, i) => {
    if (part.kind === 'inline') {
      const startsWithNewline = part.text.startsWith(NL);
      const endsBlank = endsWithBlankLine(part.text);
      const text = part.text.replace(/^\n+/, '').trimEnd();
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
      // Claude Code prints code, quotes and tables inside an item at column 0, and tables as
      // pipe text; md indents them under the item's text and draws tables as boxes.
      if (blank) out.push('');
      const left = rowIndent + markerCell;
      const lines =
        part.token.type === 'table' ? renderTable(part.token, base(ctx), cols - left)
        : part.code ? codeBlock(part.text.replace(/\n$/, '').split(NL), cols - left, ctx.theme.codeBg, ctx.codePadding)
        : wrapText(part.text.replace(/^\n+/, '').trimEnd(), cols - left);
      out.push(...lines.map((line) => (line ? ' '.repeat(left) + line : line)));
      blank = false;
    } else {
      out.push(...list(part.token, ctx, { indent: childIndent, depth: depth + 1, cols, room, blankLineBefore: blank }));
      blank = false;
    }
  });
  return out;
}
