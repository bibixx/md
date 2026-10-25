// Box-drawn tables, with Claude Code's column fitting and its vertical fallback.
import chalk from 'chalk';
import { NL, width, strip, wrapCell, pad } from './text.mjs';
import { inline } from './tokens.mjs';

// Claude Code keeps 4 columns free on the right; md's padding covers the edges, so tables run full width.
const RIGHT_MARGIN = 0;
const MIN_COLUMN = 3;
const MAX_CELL_LINES = 4; // a row taller than this switches to the vertical layout
const MAX_ROWS = 200;

const BORDERS = {
  top: ['┌', '─', '┬', '┐'],
  middle: ['├', '─', '┼', '┤'],
  bottom: ['└', '─', '┴', '┘'],
};

// Rounding the shares down leaves a few columns unused; hand them out one at a time to the
// column that is furthest below its target, so a wrapped table always spans the full width.
function fill(widths, available, targets) {
  let spare = available - widths.reduce((a, b) => a + b, 0);
  while (spare > 0) {
    let best = 0;
    for (let i = 1; i < widths.length; i++)
      if (targets[i] - widths[i] > targets[best] - widths[best]) best = i;
    widths[best]++;
    spare--;
  }
}

const notShown =(n) => `… ${n.toLocaleString()} more ${n === 1 ? 'row' : 'rows'} not shown`;

export function renderTable(token, ctx, termWidth) {
  const truncated = Math.max(0, token.rows.length - MAX_ROWS);
  const rows = truncated > 0 ? token.rows.slice(0, MAX_ROWS) : token.rows;

  const cache = new Map();
  const ansi = (tokens) => {
    if (!cache.has(tokens)) cache.set(tokens, inline(tokens ?? [], ctx, { parent: null }));
    return cache.get(tokens);
  };
  const plainText = (tokens) => strip(ansi(tokens));

  const longestWord = (tokens) => {
    const words = plainText(tokens).split(/\s+/).filter((w) => w.length > 0);
    return words.length === 0 ? MIN_COLUMN : Math.max(...words.map(width), MIN_COLUMN);
  };
  const fullWidth = (tokens) => Math.max(width(plainText(tokens)), MIN_COLUMN);

  const minWidths = token.header.map((h, i) => Math.max(longestWord(h.tokens), ...rows.map((r) => longestWord(r[i]?.tokens))));
  const idealWidths = token.header.map((h, i) => Math.max(fullWidth(h.tokens), ...rows.map((r) => fullWidth(r[i]?.tokens))));

  const n = token.header.length;
  const available = Math.max(termWidth - (1 + n * 3) - RIGHT_MARGIN, n * MIN_COLUMN);
  const minTotal = minWidths.reduce((a, b) => a + b, 0);
  const idealTotal = idealWidths.reduce((a, b) => a + b, 0);

  // Ideal widths if they fit; otherwise give each column its longest word plus a share of the
  // leftover space proportional to how much it wanted; if even that fails, scale down and hard-wrap.
  let widths;
  let hard = false;
  if (idealTotal <= available) widths = idealWidths;
  else if (minTotal <= available) {
    const extra = available - minTotal;
    const wants = idealWidths.map((w, i) => w - minWidths[i]);
    const totalWant = wants.reduce((a, b) => a + b, 0);
    widths = minWidths.map((w, i) => (totalWant === 0 ? w : w + Math.floor((wants[i] / totalWant) * extra)));
    fill(widths, available, idealWidths);
  } else {
    hard = true;
    const scale = available / minTotal;
    widths = minWidths.map((w) => Math.max(Math.floor(w * scale), MIN_COLUMN));
    fill(widths, available, minWidths);
  }

  const tallest = Math.max(
    1,
    ...token.header.map((h, i) => wrapCell(ansi(h.tokens), widths[i], { hard }).length),
    ...rows.flatMap((r) => r.map((c, i) => wrapCell(ansi(c?.tokens), widths[i], { hard }).length))
  );

  const vertical = () =>
    verticalTable(
      rows.length === 0 ? [] : token.header.map((h) => plainText(h.tokens).trim()),
      rows.length === 0 ? [token.header.map((h) => ansi(h.tokens))] : rows.map((r) => r.map((c) => ansi(c?.tokens))),
      termWidth,
      truncated
    );
  if (tallest > MAX_CELL_LINES) return vertical();

  const rowLines = (cells, isHeader) => {
    const wrapped = cells.map((c, i) => wrapCell(ansi(c?.tokens), widths[i], { hard }));
    const height = Math.max(...wrapped.map((w) => w.length), 1);
    const offsets = wrapped.map((w) => Math.floor((height - w.length) / 2)); // centre cells vertically
    const out = [];
    for (let y = 0; y < height; y++) {
      let line = '│';
      wrapped.forEach((w, i) => {
        const text = w[y - offsets[i]] ?? '';
        const align = isHeader ? 'center' : token.align?.[i] ?? 'left';
        line += ' ' + pad(text, width(text), widths[i], align) + ' │';
      });
      out.push(line);
    }
    return out;
  };
  const rule = (kind) => {
    const [left, fill, join, right] = BORDERS[kind];
    return left + widths.map((w, i) => fill.repeat(w + 2) + (i < widths.length - 1 ? join : right)).join('');
  };

  const lines = [rule('top'), ...rowLines(token.header, true), rule('middle')];
  rows.forEach((r, i) => {
    lines.push(...rowLines(r, false));
    if (i < rows.length - 1) lines.push(rule('middle'));
  });
  lines.push(rule('bottom'));

  if (Math.max(...lines.map((l) => width(strip(l)))) > termWidth - RIGHT_MARGIN) return vertical();
  if (truncated > 0) lines.push(notShown(truncated));
  return lines;
}

// One "Header: value" line per cell, rows separated by a short rule.
function verticalTable(headers, rows, termWidth, truncated) {
  const out = [];
  const separator = '─'.repeat(Math.min(termWidth - 1, 40));
  for (const row of rows) {
    const lines = [];
    row.forEach((cell, i) => {
      const header = headers[i] || '';
      const value = cell.trimEnd().replace(/\n+/g, ' ').replace(/\s+/g, ' ').trim();
      if (!header && !value) return;
      const firstWidth = header ? termWidth - width(header) - 3 : termWidth - 1;
      const wrapped = wrapCell(value, Math.max(firstWidth, 10));
      const rest = wrapped.length <= 1 ? [] : wrapCell(wrapped.slice(1).map((l) => l.trim()).join(' '), termWidth - 3);
      lines.push(header ? `${chalk.bold(`${header}:`)} ${wrapped[0] || ''}` : wrapped[0] || '');
      for (const l of rest) if (l.trim()) lines.push(l);
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
