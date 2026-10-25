import { test } from 'node:test';
import assert from 'node:assert/strict';
import chalk from 'chalk';
import { segments, layout } from '../src/layout.mjs';
import { Document } from '../src/document.mjs';
import { highlighter } from '../src/highlight.mjs';
import { getTheme } from '../src/theme.mjs';
import { start, down, up, lastTop, screen, position } from '../src/viewport.mjs';

chalk.level = 0;
const ctx = { theme: getTheme('dark'), highlight: highlighter, hyperlinks: false };

// paragraphs, a list, a table, a quote and code, repeated
const section = (i) =>
  [
    `## Section ${i}`,
    `Paragraph ${i} with enough words in it to wrap at narrow widths, so units are taller than one line.`,
    `- item ${i}a\n- item ${i}b with a longer tail that wraps`,
    `| k | v |\n|---|---|\n| ${i} | value ${i} |`,
    `> quote ${i} that is also long enough to wrap when the screen is narrow`,
    '```js\nconst x = ' + i + ';\n```',
  ].join('\n\n');
const big = Array.from({ length: 300 }, (_, i) => section(i)).join('\n\n');

const docAt = (src, cols, padding) => {
  const doc = new Document(segments(src, ctx), padding);
  doc.setWidth(cols);
  return doc;
};

test('showing the first screen lays out only the units on it', () => {
  const doc = docAt(big, 80);
  screen(doc, start(), 30);
  position(doc, start(), 30);
  assert.ok(doc.laidOut < 30, `laid out ${doc.laidOut} of ${doc.length}`);
});

test('every screen matches the same slice of the fully laid-out document', () => {
  const rows = 17;
  for (const cols of [40, 80]) {
    const all = docAt(big, cols).all();
    const doc = docAt(big, cols);
    for (const k of [0, 1, 5, 123, 1000, all.length - rows - 1]) {
      const pos = down(doc, start(), k, rows);
      assert.deepEqual(screen(doc, pos, rows), all.slice(k, k + rows), `cols ${cols}, line ${k}`);
    }
  }
});

test('the units lay out to exactly what layout() renders in one go', () => {
  assert.deepEqual(docAt(big, 60).all(), layout(big, ctx, 60));
});

test('scrolling down and back up by the same amount returns to the same place', () => {
  const doc = docAt(big, 50);
  const from = down(doc, start(), 400, 20);
  for (const n of [1, 3, 7, 20, 55]) assert.deepEqual(up(doc, down(doc, from, n, 20), n), from, `n = ${n}`);
});

test('scrolling stops with the last line at the bottom of the screen', () => {
  const doc = docAt(big, 80);
  const all = docAt(big, 80).all();
  const end = down(doc, start(), Infinity, 20);
  assert.deepEqual(end, lastTop(doc, 20));
  assert.deepEqual(screen(doc, end, 20), all.slice(-20));
  assert.deepEqual(up(doc, start(), 5), start());
});

test('the footer position is estimated until everything is laid out, then exact', () => {
  const doc = docAt(big, 70);
  const pos = down(doc, start(), 250, 20);
  assert.equal(position(doc, pos, 20).exact, false);
  const total = doc.all().length;
  assert.deepEqual(position(doc, pos, 20), { first: 251, last: 270, total, exact: true });
});

test('a resize drops what was laid out at the old width', () => {
  const doc = docAt(big, 80);
  doc.all();
  assert.equal(doc.setWidth(80), false);
  assert.equal(doc.setWidth(50), true);
  assert.equal(doc.laidOut, 0);
  assert.deepEqual(doc.all(), docAt(big, 50).all());
});

test('padding adds blank lines above and below and a left margin on text lines', () => {
  const doc = docAt('one\n\ntwo', 40, { top: 2, bottom: 1, left: 3, right: 0 });
  assert.deepEqual(doc.all(), ['', '', '   one', '', '   two', '']);
});
