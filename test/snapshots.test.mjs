// Renders every fixture and compares it with the saved output in __snapshots__/, so any change
// to how something looks shows up as a failing test. After an intended change, accept the new
// output with `bun test --update-snapshots` and review the snapshot diff before committing.
// (This file uses bun:test rather than node:test because snapshots are a bun:test feature.)
import { test, expect } from 'bun:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import chalk from 'chalk';
import { layout } from '../src/layout.mjs';
import { highlighter } from '../src/highlight.mjs';
import { getTheme } from '../src/theme.mjs';

// md's defaults, not whatever config file is on this machine
process.env.XDG_CONFIG_HOME = fs.mkdtempSync(path.join(os.tmpdir(), 'md-snapshots-'));
const { loadConfig } = await import('../src/config.mjs?snapshots');
const { codePadding, tabWidth } = loadConfig();

const fixtures = path.join(import.meta.dirname, '..', 'fixtures');
const files = fs.readdirSync(fixtures).filter((f) => /^\d+-.*\.md$/.test(f));

const render = (src, cols, level) => {
  const before = chalk.level;
  chalk.level = level;
  try {
    const ctx = { theme: getTheme('dark'), highlight: highlighter, hyperlinks: true, codePadding, tabWidth };
    return layout(src, ctx, cols).join('\n');
  } finally {
    chalk.level = before;
  }
};

// escape codes written out so colour changes are readable in a diff
const visible = (s) => s.replaceAll('\x1b', '\\e').replaceAll('\x07', '\\a');

for (const file of files) {
  test(file, () => {
    const src = fs.readFileSync(path.join(fixtures, file), 'utf8');
    expect(render(src, 40, 0)).toMatchSnapshot('plain, 40 columns');
    expect(render(src, 80, 0)).toMatchSnapshot('plain, 80 columns');
    expect(visible(render(src, 80, 3))).toMatchSnapshot('colour, 80 columns');
  });
}
