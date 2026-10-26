import { test, expect } from 'bun:test';
import chalk from 'chalk';
import { segments, layout } from '../src/layout.ts';
import { Document } from '../src/document.ts';
import { highlighter } from '../src/highlight.ts';
import { getTheme } from '../src/theme.ts';
import { start, down, up, lastScreenTop, screen, position } from '../src/viewport.ts';
import type { Padding } from '../src/types.ts';

chalk.level = 0;
const ctx = { theme: getTheme('dark'), highlight: highlighter, hyperlinks: false };

const section = (i: number) =>
  [
    `## Section ${i}`,
    `Paragraph ${i} with enough words in it to wrap at narrow widths, so units are taller than one line.`,
    `- item ${i}a\n- item ${i}b with a longer tail that wraps`,
    `| k | v |\n|---|---|\n| ${i} | value ${i} |`,
    `> quote ${i} that is also long enough to wrap when the screen is narrow`,
    '```js\nconst x = ' + i + ';\n```',
  ].join('\n\n');
const big = Array.from({ length: 300 }, (_, i) => section(i)).join('\n\n');

const docAt = (src: string, cols: number, padding?: Partial<Padding>) => {
  const doc = new Document(segments(src, ctx), padding);
  doc.setWidth(cols);
  return doc;
};

test('showing the first screen lays out only the units on it', () => {
  const doc = docAt(big, 80);
  screen(doc, start(), 30);
  position(doc, start(), 30);
  expect(doc.laidOut < 30, `laid out ${doc.laidOut} of ${doc.length}`).toBeTruthy();
});

test('every screen matches the same slice of the fully laid-out document', () => {
  const rows = 17;
  for (const cols of [40, 80]) {
    const all = docAt(big, cols).allLines();
    const doc = docAt(big, cols);
    for (const k of [0, 1, 5, 123, 1000, all.length - rows - 1]) {
      const pos = down(doc, start(), k, rows);
      expect(screen(doc, pos, rows), `cols ${cols}, line ${k}`).toEqual(all.slice(k, k + rows));
    }
  }
});

test('the units lay out to exactly what layout() renders in one go', () => {
  expect(docAt(big, 60).allLines()).toEqual(layout(big, ctx, 60));
});

test('scrolling down and back up by the same amount returns to the same place', () => {
  const doc = docAt(big, 50);
  const from = down(doc, start(), 400, 20);
  for (const n of [1, 3, 7, 20, 55]) expect(up(doc, down(doc, from, n, 20), n), `n = ${n}`).toEqual(from);
});

test('scrolling stops with the last line at the bottom of the screen', () => {
  const doc = docAt(big, 80);
  const all = docAt(big, 80).allLines();
  const end = down(doc, start(), Infinity, 20);
  expect(end).toEqual(lastScreenTop(doc, 20));
  expect(screen(doc, end, 20)).toEqual(all.slice(-20));
  expect(up(doc, start(), 5)).toEqual(start());
});

test('the footer position is estimated until everything is laid out, then exact', () => {
  const doc = docAt(big, 70);
  const pos = down(doc, start(), 250, 20);
  expect(position(doc, pos, 20).exact).toBe(false);
  const total = doc.allLines().length;
  expect(position(doc, pos, 20)).toEqual({ first: 251, last: 270, total, exact: true });
});

test('a resize drops what was laid out at the old width', () => {
  const doc = docAt(big, 80);
  doc.allLines();
  expect(doc.setWidth(80)).toBe(false);
  expect(doc.setWidth(50)).toBe(true);
  expect(doc.laidOut).toBe(0);
  expect(doc.allLines()).toEqual(docAt(big, 50).allLines());
});

test('padding adds blank lines above and below and a left margin on text lines', () => {
  const doc = docAt('one\n\ntwo', 40, { top: 2, bottom: 1, left: 3, right: 0 });
  expect(doc.allLines()).toEqual(['', '', '   one', '', '   two', '']);
});
