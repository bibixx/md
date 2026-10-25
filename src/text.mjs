import chalk from 'chalk';

// Bun's native versions of string-width, strip-ansi and wrap-ansi; measuring and wrapping are
// most of the layout time, and these are 30-45x faster than the npm packages
export const NL = '\n';
export const width = (s) => Bun.stringWidth(s);
export const strip = (s) => Bun.stripANSI(s);

// Wrap one line, keeping its indentation. Trimming would also eat the indentation, and
// without it the space the line broke at is carried onto the next row (and counted against
// the width), so take the indentation off, wrap with trim, and put it back on the first row.
function wrapLine(line, cols, opts) {
  const indent = line.match(/^[ \t]*/)[0];
  const rows = Bun.wrapAnsi(line.slice(indent.length), Math.max(1, cols - width(indent)), { ...opts, trim: true }).split(NL);
  rows[0] = indent + rows[0];
  return rows;
}

// How Ink wraps a <Text>: each line hard-wrapped to the box width, indentation kept.
export function wrapText(text, cols) {
  return text.split(NL).flatMap((line) => (line.includes(RULE) ? [rule(cols)] : wrapLine(line, cols, { hard: true })));
}

// A horizontal rule spans whatever width it's laid out at, which the token renderer doesn't
// know, so it emits this placeholder line and wrapText draws the rule.
export const RULE = '\u0000rule\u0000';
const rule = (cols) => chalk.gray('─'.repeat(Math.max(1, cols)));

// Tabs become spaces up to the next multiple of `size` columns. A terminal would move the cursor
// over the cells instead, which leaves whatever was on screen there and breaks width maths.
export function expandTabs(text, size = 2) {
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

// Hard-wrap the lines of a code block and paint a background behind them across the whole
// width, with `inset` blank rows and columns inside it. Without colour there's no background
// to pad out, so the rows are left as they are and piped output has no trailing spaces.
export function codeBlock(lines, cols, bg, { top = 0, bottom = 0, left = 0, right = 0 } = {}) {
  if (chalk.level === 0) return lines.flatMap((line) => wrapLine(line, cols, { hard: true }));
  const inner = Math.max(1, cols - left - right);
  const fill = (row) => bg(' '.repeat(left) + pad(row, width(row), inner, 'left') + ' '.repeat(right));
  const rows = lines.flatMap((line) => wrapLine(line, inner, { hard: true }));
  return [...Array(top).fill(''), ...rows, ...Array(bottom).fill('')].map(fill);
}

// Word-wrap a table cell; empty lines are dropped.
export function wrapCell(text, cols, { hard = false } = {}) {
  if (cols <= 0) return [text];
  const lines = wrapLine(text.trimEnd(), cols, { hard, wordWrap: true }).filter((l) => l.length > 0);
  return lines.length > 0 ? lines : [''];
}

export function pad(text, textWidth, cols, align) {
  const gap = Math.max(0, cols - textWidth);
  if (align === 'center') {
    const left = Math.floor(gap / 2);
    return ' '.repeat(left) + text + ' '.repeat(gap - left);
  }
  if (align === 'right') return ' '.repeat(gap) + text;
  return text + ' '.repeat(gap);
}

// True when the text ends in a blank line (a newline followed only by whitespace up to the end).
export function endsWithBlankLine(s) {
  if (!s.endsWith(NL)) return false;
  for (let i = s.length - 2; i >= 0; i--) {
    if (s[i] === NL) return true;
    if (!/\s/.test(s[i])) return false;
  }
  return false;
}
