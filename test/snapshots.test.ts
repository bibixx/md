import { test, expect } from 'bun:test';
import { mkdtempSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import chalk from 'chalk';
import { layout } from '../src/layout.ts';
import { highlighter } from '../src/highlight.ts';
import { getTheme } from '../src/theme.ts';
import { loadConfig } from '../src/config.ts';
import { readFixtures } from './helpers.ts';

// md's defaults, not whatever config file is on this machine
const { codePadding, tabWidth } = await loadConfig(path.join(mkdtempSync(path.join(os.tmpdir(), 'md-snapshots-')), 'config.json'));


const render = (src: string, cols: number, level: typeof chalk.level): string => {
  const before = chalk.level;
  chalk.level = level;
  try {
    const ctx = { theme: getTheme('dark'), highlight: highlighter, hyperlinks: true, codePadding, tabWidth };
    return layout(src, ctx, cols).join('\n');
  } finally {
    chalk.level = before;
  }
};

// so colour changes are readable in a snapshot diff
const showEscapes = (s: string): string => s.replaceAll('\x1b', '\\e').replaceAll('\x07', '\\a');

for (const { name, text: src } of await readFixtures()) {
  test(name, () => {
    expect(render(src, 40, 0)).toMatchSnapshot('plain, 40 columns');
    expect(render(src, 80, 0)).toMatchSnapshot('plain, 80 columns');
    expect(showEscapes(render(src, 80, 3))).toMatchSnapshot('colour, 80 columns');
  });
}
