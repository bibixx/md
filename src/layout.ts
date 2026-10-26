import chalk from 'chalk';
import { Lexer, type Tokens } from 'marked';
import { NL, strip, wrapText, codeBlock, endsWithBlankLine } from './text.ts';
import { render, listMarker, listBounds, isMarkedToken, topLevel } from './tokens.ts';
import { endsLoose, listItem, listRoom } from './lists.ts';
import { renderTable } from './table.ts';
import type { RenderContext, Unit } from './types.ts';

const QUOTE_BAR = '▎';

export function layout(src: string, ctx: RenderContext, cols: number): string[] {
  const out: string[] = [];
  for (const unit of segments(src, ctx)) {
    if (unit.blankLineAbove) out.push('');
    out.push(...unit.render(cols));
  }
  return out;
}

export function segments(src: string, ctx: RenderContext): Unit[] {
  const tokens = new Lexer({ gfm: true }).lex(src.replaceAll(/\r\n?/gu, NL));
  const units: Unit[] = [];
  let lastBox: 'none' | 'prose' | 'block' | 'list' = 'none';
  let prose = '';
  let proseNewlines = 0;
  let codeRanges: CodeRange[] = [];
  let proseEndedBlank = false;

  const addProse = (s: string) => {
    prose += s;
    for (let i = s.indexOf(NL); i !== -1; i = s.indexOf(NL, i + 1)) proseNewlines++;
  };

  const add = (blankLineAbove: boolean, renderUnit: Unit['render'], estimate: Unit['estimate']) => {
    units.push({ blankLineAbove: blankLineAbove && units.length > 0, render: renderUnit, estimate });
  };

  // chalk re-opens styles on every line, so each line of styled text can be its own unit.
  const addLines = (text: string, blank: boolean, wrapLine: (line: string, cols: number) => string[]) => {
    for (const [i, line] of text.split(NL).entries()) add(i === 0 && blank, (cols) => wrapLine(line, cols), estimateLine(line));
  };

  const flushProse = () => {
    if (!prose) return;
    const startsWithNewline = prose.startsWith(NL);
    const endsBlank = endsWithBlankLine(prose);
    const leading = /^\n*/u.exec(prose)?.[0].length ?? 0;
    const text = prose.replace(/^\n+/u, '').trimEnd();
    const code = codeRanges;
    prose = '';
    proseNewlines = 0;
    codeRanges = [];
    if (!text) {
      proseEndedBlank = true;
      return;
    }
    const margin = lastBox === 'none' ? 0 : lastBox === 'list' && !startsWithNewline ? 0 : 1;
    let block = 0;
    const blocksWithUnits = new Set<number>();
    for (const [i, line] of text.split(NL).entries()) {
      const proseLine = i + leading;
      while ((code[block]?.endLine ?? Infinity) <= proseLine) block++;
      const range = (code[block]?.startLine ?? Infinity) <= proseLine ? code[block] : undefined;
      if (range === undefined) {
        add(i === 0 && margin > 0, (cols) => wrapText(line, cols), estimateLine(line));
        continue;
      }
      // one unit per code block, so codePadding's rows go around the whole block
      if (blocksWithUnits.has(block)) continue;
      blocksWithUnits.add(block);
      const estimates = range.raw.map((raw) => estimateLine(raw));
      const { top = 0, bottom = 0 } = ctx.codePadding ?? {};
      add(i === 0 && margin > 0, (cols) => codeBlock(range.styledLines(), cols, ctx.theme.codeBg, ctx.codePadding), (cols) => top + bottom + estimates.reduce((n, e) => n + e(cols), 0));
    }
    lastBox = 'prose';
    proseEndedBlank = endsBlank;
  };

  // Highlighting waits until a block is first shown; until then `prose` holds its raw text,
  // which has the same line breaks.
  const addCode = (t: Tokens.Code): boolean => {
    if (prose !== '' && !prose.endsWith(NL)) return false;
    const raw = t.text.split(NL);
    let styledLines: () => string[];
    if (t.lang !== undefined && t.lang !== '' && ctx.highlight?.supportsLanguage(t.lang) !== true) {
      const [label, ...rest] = render(t, topLevel(ctx)).split(NL);
      addProse(label + NL);
      styledLines = () => rest.slice(0, raw.length);
    } else {
      let all: string[] | undefined;
      styledLines = () => (all ??= render(t, topLevel(ctx)).split(NL)).slice(0, raw.length);
    }
    codeRanges.push({ startLine: proseNewlines, endLine: proseNewlines + raw.length, raw, styledLines });
    addProse(t.text + NL);
    return true;
  };

  const blockMargin = (kind: 'block' | 'list') => (lastBox === 'none' ? 0 : kind === 'block' || lastBox === 'block' || proseEndedBlank ? 1 : 0);

  for (const t of tokens) {
    if (!isMarkedToken(t)) {
      addProse(render(t, topLevel(ctx)));
      continue;
    }
    if (t.type === 'table') {
      flushProse();
      add(blockMargin('block') > 0, (cols) => renderTable(t, topLevel(ctx), cols), () => 2 * t.rows.length + 3);
      lastBox = 'block';
    } else if (t.type === 'list') {
      flushProse();
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
        add(false, (cols) => listItem(item, ctx, { ...opts, cols, room: listRoom(cols) }), () => sourceLines);
      });
      lastBox = 'list';
    } else if (t.type === 'blockquote') {
      flushProse();
      const bar = chalk.dim(QUOTE_BAR);
      addLines(quoteBody(t, ctx), blockMargin('block') > 0, (line, cols) => wrapText(line, cols - 2).map((l) => `${bar} ${l}`));
      lastBox = 'block';
    } else if (!(t.type === 'code' && addCode(t))) addProse(render(t, topLevel(ctx)));
  }
  flushProse();
  return units;
}

interface CodeRange {
  startLine: number;
  endLine: number;
  raw: string[];
  styledLines: () => string[];
}

function estimateLine(line: string): (cols: number) => number {
  let length: number | undefined;
  return (cols) => {
    length ??= strip(line).length;
    return Math.max(1, Math.ceil(length / Math.max(1, cols)));
  };
}

function quoteBody(t: Tokens.Blockquote, ctx: RenderContext): string {
  const text = t.tokens.map((x) => render(x, { ...topLevel(ctx), quotesAround: 1 })).join('');
  return chalk.italic(text.replace(/^\n+/u, '').trimEnd());
}
