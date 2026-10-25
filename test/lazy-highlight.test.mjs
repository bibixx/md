import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import chalk from 'chalk';
import { segments, layout } from '../src/layout.mjs';
import { Document } from '../src/document.mjs';
import { highlighter } from '../src/highlight.mjs';
import { getTheme } from '../src/theme.mjs';
import { start, screen } from '../src/viewport.mjs';
import { strip } from '../src/text.mjs';

const fixtures = path.join(import.meta.dirname, '..', 'fixtures');
const files = fs.readdirSync(fixtures).filter((f) => /^\d+-.*\.md$/.test(f));

// counts highlight calls so the tests can see when highlighting happens
function spyHighlighter() {
  const spy = {
    calls: 0,
    supportsLanguage: highlighter.supportsLanguage,
    highlight: (...args) => (spy.calls++, highlighter.highlight(...args)),
  };
  return spy;
}

const render = (src, cols, level, highlight = highlighter) => {
  const before = chalk.level;
  chalk.level = level;
  try {
    return layout(src, { theme: getTheme('dark'), highlight, hyperlinks: false }, cols);
  } finally {
    chalk.level = before;
  }
};

test('lazily highlighted code lines land on the right lines in every fixture', () => {
  for (const file of files) {
    // without colour, strikethrough falls back to literal ~~, and code isn't padded out to
    // its background, both of which differ on purpose
    const src = fs.readFileSync(path.join(fixtures, file), 'utf8').replaceAll('~~', '');
    const coloured = render(src, 70, 3);
    assert.deepEqual(coloured.map((line) => strip(line).trimEnd()), render(src, 70, 0).map((line) => line.trimEnd()), file);
  }
});

test('code is still coloured, including strings and comments that span lines', () => {
  const lines = render('Text\n\n```js\nconst s = `a\nb`; /* one\ntwo */\n```', 80, 3);
  const codeLines = lines.slice(2);
  assert.equal(codeLines.length, 3);
  for (const line of codeLines) assert.match(line, /\x1b\[3\dm/, JSON.stringify(line));
});

test('nothing is highlighted until a code block comes on screen, and each block only once', () => {
  const spy = spyHighlighter();
  const src = ['```js\nconst a = 1;\nconst b = 2;\n```', ...Array(200).fill('Filler paragraph.'), '```py\nx = 1\n```'].join('\n\n');
  const doc = new Document(segments(src, { theme: getTheme('dark'), highlight: spy, hyperlinks: false }));
  assert.equal(spy.calls, 0);

  doc.setWidth(80);
  screen(doc, start(), 10);
  assert.equal(spy.calls, 1, 'only the block on the first screen');

  doc.setWidth(60); // a resize re-wraps the lines but doesn't highlight again
  screen(doc, start(), 10);
  assert.equal(spy.calls, 1);

  doc.all();
  assert.equal(spy.calls, 2);
});
