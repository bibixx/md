import { test, expect } from 'bun:test';
import chalk from 'chalk';
import { segments, layout } from '../src/layout.ts';
import { Document } from '../src/document.ts';
import { highlighter } from '../src/highlight.ts';
import type { Highlighter } from '../src/types.ts';
import { getTheme } from '../src/theme.ts';
import { start, screen } from '../src/viewport.ts';
import { strip } from '../src/text.ts';
import { readFixtures } from './helpers.ts';

type ChalkLevel = typeof chalk.level;

const fixtures = await readFixtures();

function spyHighlighter() {
  const spy = {
    calls: 0,
    supportsLanguage: (lang: string | undefined) => highlighter.supportsLanguage(lang),
    highlight: (...args: Parameters<Highlighter['highlight']>) => {
      spy.calls++;
      return highlighter.highlight(...args);
    },
  };
  return spy;
}

const render = (src: string, cols: number, level: ChalkLevel, highlight: Highlighter = highlighter): string[] => {
  const before = chalk.level;
  chalk.level = level;
  try {
    return layout(src, { theme: getTheme('dark'), highlight, hyperlinks: false }, cols);
  } finally {
    chalk.level = before;
  }
};

test('lazily highlighted code lines land on the right lines in every fixture', () => {
  for (const { name, text } of fixtures) {
    // without colour, strikethrough falls back to literal ~~, and code isn't padded out to
    // its background, both of which differ on purpose
    const src = text.replaceAll('~~', '');
    const coloured = render(src, 70, 3);
    expect(coloured.map((line) => strip(line).trimEnd()), name).toEqual(render(src, 70, 0).map((line) => line.trimEnd()));
  }
});

test('code is still coloured, including strings and comments that span lines', () => {
  const lines = render('Text\n\n```js\nconst s = `a\nb`; /* one\ntwo */\n```', 80, 3);
  const codeLines = lines.slice(2);
  expect(codeLines.length).toBe(3);
  for (const line of codeLines) expect(line, JSON.stringify(line)).toMatch(/\x1b\[3\dm/u);
});

test('nothing is highlighted until a code block comes on screen, and each block only once', () => {
  const spy = spyHighlighter();
  const src = ['```js\nconst a = 1;\nconst b = 2;\n```', ...Array.from({ length: 200 }, () => 'Filler paragraph.'), '```py\nx = 1\n```'].join('\n\n');
  const doc = new Document(segments(src, { theme: getTheme('dark'), highlight: spy, hyperlinks: false }));
  expect(spy.calls).toBe(0);

  doc.setWidth(80);
  screen(doc, start(), 10);
  expect(spy.calls, 'only the block on the first screen').toBe(1);

  doc.setWidth(60); // a resize re-wraps the lines but doesn't highlight again
  screen(doc, start(), 10);
  expect(spy.calls).toBe(1);

  doc.allLines();
  expect(spy.calls).toBe(2);
});
