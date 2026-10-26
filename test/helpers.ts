import path from 'node:path';
import chalk from 'chalk';
import type { RenderContext } from '../src/types.ts';
import { layout } from '../src/layout.ts';
import { highlighter } from '../src/highlight.ts';
import { getTheme } from '../src/theme.ts';
import { strip, width } from '../src/text.ts';

export function renderPlain(md: string, cols = 80, options: Partial<RenderContext> = {}): string[] {
  const level = chalk.level;
  chalk.level = 0;
  try {
    return layout(md, { theme: getTheme('dark'), highlight: highlighter, hyperlinks: false, ...options }, cols);
  } finally {
    chalk.level = level;
  }
}

export const visibleWidth = (line: string): number => width(strip(line));

export function must<T>(value: T | null | undefined, what = 'value'): T {
  if (value === null || value === undefined) throw new Error(`expected a ${what}`);
  return value;
}

export const FIXTURES = path.join(import.meta.dir, '..', 'fixtures');

export function readFixtures(): Promise<{ name: string; text: string }[]> {
  const names = [...new Bun.Glob('[0-9]*-*.md').scanSync(FIXTURES)].toSorted();
  return Promise.all(names.map(async (name) => ({ name, text: await Bun.file(path.join(FIXTURES, name)).text() })));
}
