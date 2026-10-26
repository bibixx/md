import chalk from 'chalk';
import type { Token, Tokens } from 'marked';
import { NL, width, strip, wrapCell, pad } from './text.ts';
import { inline } from './tokens.ts';
import type { RenderContext } from './types.ts';

const MIN_COLUMN = 3;
const MAX_ROW_LINES = 4;
const MAX_ROWS = 200;

const BORDERS: Record<'top' | 'middle' | 'bottom', [string, string, string, string]> = {
  top: ['┌', '─', '┬', '┐'],
  middle: ['├', '─', '┼', '┤'],
  bottom: ['└', '─', '┴', '┘'],
};

function spreadSpareColumns(widths: number[], available: number, targets: number[]): void {
  let spare = available - sum(widths);
  while (spare > 0) {
    let best = 0;
    for (let i = 1; i < widths.length; i++)
      if ((targets[i] ?? 0) - (widths[i] ?? 0) > (targets[best] ?? 0) - (widths[best] ?? 0)) best = i;
    widths[best] = (widths[best] ?? 0) + 1;
    spare--;
  }
}

const sum = (values: number[]) => values.reduce((a, b) => a + b, 0);

function fitColumns(minWidths: number[], idealWidths: number[], available: number): { widths: number[]; hard: boolean } {
  if (sum(idealWidths) <= available) return { widths: idealWidths, hard: false };
  const minTotal = sum(minWidths);
  if (minTotal <= available) {
    const wants = idealWidths.map((w, i) => w - (minWidths[i] ?? 0));
    const totalWant = sum(wants);
    const widths = minWidths.map((w, i) => (totalWant === 0 ? w : w + Math.floor(((wants[i] ?? 0) / totalWant) * (available - minTotal))));
    spreadSpareColumns(widths, available, idealWidths);
    return { widths, hard: false };
  }
  const widths = minWidths.map((w) => Math.max(Math.floor(w * (available / minTotal)), MIN_COLUMN));
  spreadSpareColumns(widths, available, minWidths);
  return { widths, hard: true };
}

const notShown = (n: number): string => `… ${n.toLocaleString()} more ${n === 1 ? 'row' : 'rows'} not shown`;

export function renderTable(token: Tokens.Table, ctx: RenderContext, termWidth: number): string[] {
  const truncated = Math.max(0, token.rows.length - MAX_ROWS);
  const rows = truncated > 0 ? token.rows.slice(0, MAX_ROWS) : token.rows;

  type Cell = Token[] | undefined;
  const cache = new Map<Cell, string>();
  const ansi = (tokens: Cell): string => {
    let text = cache.get(tokens);
    if (text === undefined) cache.set(tokens, (text = inline(tokens ?? [], ctx, { parent: null })));
    return text;
  };
  const plainText = (tokens: Cell) => strip(ansi(tokens));

  const longestWord = (tokens: Cell) => {
    const words = plainText(tokens).split(/\s+/u).filter((w) => w.length > 0);
    return words.length === 0 ? MIN_COLUMN : Math.max(...words.map((w) => width(w)), MIN_COLUMN);
  };
  const fullWidth = (tokens: Cell) => Math.max(width(plainText(tokens)), MIN_COLUMN);

  const minWidths = token.header.map((h, i) => Math.max(longestWord(h.tokens), ...rows.map((r) => longestWord(r[i]?.tokens))));
  const idealWidths = token.header.map((h, i) => Math.max(fullWidth(h.tokens), ...rows.map((r) => fullWidth(r[i]?.tokens))));

  const n = token.header.length;
  const available = Math.max(termWidth - (1 + n * 3), n * MIN_COLUMN);
  const { widths, hard } = fitColumns(minWidths, idealWidths, available);

  const tallest = Math.max(
    1,
    ...token.header.map((h, i) => wrapCell(ansi(h.tokens), widths[i] ?? MIN_COLUMN, { hard }).length),
    ...rows.flatMap((r) => r.map((c, i) => wrapCell(ansi(c.tokens), widths[i] ?? MIN_COLUMN, { hard }).length))
  );

  const vertical = () =>
    verticalTable(
      rows.length === 0 ? [] : token.header.map((h) => plainText(h.tokens).trim()),
      rows.length === 0 ? [token.header.map((h) => ansi(h.tokens))] : rows.map((r) => r.map((c) => ansi(c.tokens))),
      termWidth,
      truncated
    );
  if (tallest > MAX_ROW_LINES) return vertical();

  const rowLines = (cells: Tokens.TableCell[], isHeader: boolean): string[] => {
    const wrapped = cells.map((c, i) => wrapCell(ansi(c.tokens), widths[i] ?? MIN_COLUMN, { hard }));
    const height = Math.max(...wrapped.map((w) => w.length), 1);
    const centringOffsets = wrapped.map((w) => Math.floor((height - w.length) / 2));
    const out: string[] = [];
    for (let y = 0; y < height; y++) {
      let line = '│';
      wrapped.forEach((w, i) => {
        const text = w[y - (centringOffsets[i] ?? 0)] ?? '';
        const align = isHeader ? 'center' : token.align[i] ?? 'left';
        line += ' ' + pad(text, width(text), widths[i] ?? MIN_COLUMN, align) + ' │';
      });
      out.push(line);
    }
    return out;
  };
  const rule = (kind: keyof typeof BORDERS): string => {
    const [left, run, join, right] = BORDERS[kind];
    return left + widths.map((w, i) => run.repeat(w + 2) + (i < widths.length - 1 ? join : right)).join('');
  };

  const lines = [rule('top'), ...rowLines(token.header, true), rule('middle')];
  rows.forEach((r, i) => {
    lines.push(...rowLines(r, false));
    if (i < rows.length - 1) lines.push(rule('middle'));
  });
  lines.push(rule('bottom'));

  if (Math.max(...lines.map((l) => width(strip(l)))) > termWidth) return vertical();
  if (truncated > 0) lines.push(notShown(truncated));
  return lines;
}

function verticalTable(headers: string[], rows: string[][], termWidth: number, truncated: number): string[] {
  const out: string[] = [];
  const separator = '─'.repeat(Math.min(termWidth - 1, 40));
  for (const row of rows) {
    const lines: string[] = [];
    row.forEach((cell, i) => {
      const header = headers[i] ?? '';
      const value = cell.trimEnd().replaceAll(/\n+/gu, ' ').replaceAll(/\s+/gu, ' ').trim();
      if (header === '' && value === '') return;
      const firstWidth = header === '' ? termWidth - 1 : termWidth - width(header) - 3;
      const wrapped = wrapCell(value, Math.max(firstWidth, 10));
      const rest = wrapped.length <= 1 ? [] : wrapCell(wrapped.slice(1).map((l) => l.trim()).join(' '), termWidth - 3);
      const first = wrapped[0] ?? '';
      lines.push(header === '' ? first : `${chalk.bold(`${header}:`)} ${first}`);
      for (const l of rest) if (l.trim() !== '') lines.push(l);
    });
    if (lines.length === 0) continue;
    if (out.length > 0) out.push(separator);
    out.push(...lines);
  }
  if (truncated > 0) {
    if (out.length > 0) out.push(separator);
    out.push(notShown(truncated));
  }
  return out.join(NL).split(NL);
}
