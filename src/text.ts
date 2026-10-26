import chalk from 'chalk';
import type { Align, Padding, Style } from './types.ts';

// Measuring and wrapping are most of the layout time; Bun's native versions are 30-45x faster
// than the string-width / strip-ansi / wrap-ansi packages.
export const NL = '\n';
export const width = (s: string): number => Bun.stringWidth(s);
export const strip = (s: string): string => Bun.stripANSI(s);

interface WrapOptions {
  hard?: boolean;
  wordWrap?: boolean;
}

// Bun.wrapAnsi's trim also strips indentation, and without trim the space at a break counts
// against the width, so the indent is taken off before wrapping and put back after.
function wrapLine(line: string, cols: number, opts: WrapOptions): string[] {
  const indent = /^[ \t]*/u.exec(line)?.[0] ?? '';
  const rows = Bun.wrapAnsi(line.slice(indent.length), Math.max(1, cols - width(indent)), { ...opts, trim: true }).split(NL);
  rows[0] = indent + rows[0];
  return rows;
}

export function wrapText(text: string, cols: number): string[] {
  return text.split(NL).flatMap((line) => (line.includes(RULE_PLACEHOLDER) ? [rule(cols)] : wrapLine(line, cols, { hard: true })));
}

export const RULE_PLACEHOLDER = '\u0000rule\u0000';
const rule = (cols: number): string => chalk.gray('─'.repeat(Math.max(1, cols)));

// A terminal moves the cursor over a tab's cells without painting them, which breaks width
// maths and leaves holes in a background.
export function expandTabs(text: string, size = 2): string {
  if (!text.includes('\t')) return text;
  return text
    .split(NL)
    .map((line) => {
      let col = 0;
      return line
        .split('\t')
        .map((part, i) => {
          const gap = i === 0 ? '' : ' '.repeat(size - (col % size));
          col += gap.length + width(part);
          return gap + part;
        })
        .join('');
    })
    .join(NL);
}

const blank = (n: number): string[] => Array.from({ length: n }, () => '');

// Without colour there's no background to fill, so piped output gets no trailing spaces.
export function codeBlock(lines: string[], cols: number, bg: Style, { top = 0, bottom = 0, left = 0, right = 0 }: Partial<Padding> = {}): string[] {
  if (chalk.level === 0) return lines.flatMap((line) => wrapLine(line, cols, { hard: true }));
  const inner = Math.max(1, cols - left - right);
  const fill = (row: string) => bg(' '.repeat(left) + pad(row, width(row), inner, 'left') + ' '.repeat(right));
  const rows = lines.flatMap((line) => wrapLine(line, inner, { hard: true }));
  return [...blank(top), ...rows, ...blank(bottom)].map((row) => fill(row));
}

export function wrapCell(text: string, cols: number, { hard = false }: { hard?: boolean } = {}): string[] {
  if (cols <= 0) return [text];
  const lines = wrapLine(text.trimEnd(), cols, { hard, wordWrap: true }).filter((l) => l.length > 0);
  return lines.length > 0 ? lines : [''];
}

export function pad(text: string, textWidth: number, cols: number, align: Align): string {
  const gap = Math.max(0, cols - textWidth);
  if (align === 'center') {
    const left = Math.floor(gap / 2);
    return ' '.repeat(left) + text + ' '.repeat(gap - left);
  }
  if (align === 'right') return ' '.repeat(gap) + text;
  return text + ' '.repeat(gap);
}

export function endsWithBlankLine(s: string): boolean {
  if (!s.endsWith(NL)) return false;
  for (let i = s.length - 2; i >= 0; i--) {
    const c = s[i] ?? '';
    if (c === NL) return true;
    if (!/\s/u.test(c)) return false;
  }
  return false;
}
