import chalk from 'chalk';
import { layout } from '../src/layout.mjs';
import { highlighter } from '../src/highlight.mjs';
import { getTheme } from '../src/theme.mjs';
import { strip, width } from '../src/text.mjs';

// Render to plain lines (no colour, no hyperlinks) so tests can compare layout.
export function renderPlain(md, cols = 80, options = {}) {
  const level = chalk.level;
  chalk.level = 0;
  try {
    return layout(md, { theme: getTheme('dark'), highlight: highlighter, hyperlinks: false, ...options }, cols);
  } finally {
    chalk.level = level;
  }
}

export const visibleWidth = (line) => width(strip(line));
