import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import chalk from 'chalk';
import { segments } from '../src/layout.mjs';
import { Document } from '../src/document.mjs';
import { highlighter } from '../src/highlight.mjs';
import { getTheme } from '../src/theme.mjs';
import { start, down, lastTop, screen, position } from '../src/viewport.mjs';

const BUDGET_MS = 500;

// every fixture, 100 times over: ~720 KB, ~35,000 lines, a mix of everything md renders
const fixtures = path.join(import.meta.dirname, '..', 'fixtures');
const one = fs
  .readdirSync(fixtures)
  .filter((f) => /^\d+-.*\.md$/.test(f))
  .map((f) => fs.readFileSync(path.join(fixtures, f), 'utf8'))
  .join('\n\n');
const big = Array(100).fill(one).join('\n\n');

test(`opening, scrolling and resizing a ${Math.round(big.length / 1024)} KB file stays under ${BUDGET_MS} ms`, { timeout: BUDGET_MS }, () => {
  chalk.level = 3;
  const ctx = { theme: getTheme('dark'), highlight: highlighter, hyperlinks: true };
  const rows = 50;
  const began = performance.now();

  // open: parse and style once, then the first screen and its footer
  const doc = new Document(segments(big, ctx), { top: 1, bottom: 1, left: 2, right: 2 });
  doc.setWidth(120);
  let pos = start();
  assert.equal(screen(doc, pos, rows).length, rows);
  position(doc, pos, rows);

  // a few pages down (space)
  for (let i = 0; i < 5; i++) {
    pos = down(doc, pos, rows, rows);
    screen(doc, pos, rows);
    position(doc, pos, rows);
  }

  // jump to the end (G), then resize there
  pos = lastTop(doc, rows);
  assert.equal(screen(doc, pos, rows).length, rows);
  doc.setWidth(80);
  pos = down(doc, pos, 0, rows);
  assert.equal(screen(doc, pos, rows).length, rows);
  position(doc, pos, rows);

  // back to the top (g)
  pos = start();
  assert.equal(screen(doc, pos, rows).length, rows);

  const elapsed = performance.now() - began;
  assert.ok(elapsed < BUDGET_MS, `took ${Math.round(elapsed)} ms`);
  // most of the document was never laid out
  assert.ok(doc.laidOut < doc.length / 10, `laid out ${doc.laidOut} of ${doc.length} units`);
});
