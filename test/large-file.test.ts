import { test, expect } from 'bun:test';
import chalk from 'chalk';
import { segments } from '../src/layout.ts';
import { Document } from '../src/document.ts';
import { highlighter } from '../src/highlight.ts';
import { getTheme } from '../src/theme.ts';
import { start, down, lastScreenTop, screen, position } from '../src/viewport.ts';
import { readFixtures } from './helpers.ts';

const BUDGET_MS = 500;

const one = (await readFixtures()).map((f) => f.text).join('\n\n');
const big = Array.from({ length: 100 }, () => one).join('\n\n');

test(`opening, scrolling and resizing a ${Math.round(big.length / 1024)} KB file stays under ${BUDGET_MS} ms`, () => {
  chalk.level = 3;
  const ctx = { theme: getTheme('dark'), highlight: highlighter, hyperlinks: true };
  const rows = 50;
  const began = performance.now();

  // open: parse and style once, then the first screen and its footer
  const doc = new Document(segments(big, ctx), { top: 1, bottom: 1, left: 2, right: 2 });
  doc.setWidth(120);
  let pos = start();
  expect(screen(doc, pos, rows).length).toBe(rows);
  position(doc, pos, rows);

  // a few pages down (space)
  for (let i = 0; i < 5; i++) {
    pos = down(doc, pos, rows, rows);
    screen(doc, pos, rows);
    position(doc, pos, rows);
  }

  // jump to the end (G), then resize there
  pos = lastScreenTop(doc, rows);
  expect(screen(doc, pos, rows).length).toBe(rows);
  doc.setWidth(80);
  pos = down(doc, pos, 0, rows);
  expect(screen(doc, pos, rows).length).toBe(rows);
  position(doc, pos, rows);

  // back to the top (g)
  pos = start();
  expect(screen(doc, pos, rows).length).toBe(rows);

  const elapsed = performance.now() - began;
  expect(elapsed < BUDGET_MS, `took ${Math.round(elapsed)} ms`).toBeTruthy();
  expect(doc.laidOut < doc.length / 10, `laid out ${doc.laidOut} of ${doc.length} units`).toBeTruthy();
}, { timeout: BUDGET_MS });
