import { test, expect } from 'bun:test';
import { renderPlain, visibleWidth, must } from './helpers.ts';

const borders = (lines: string[]) => lines.filter((l) => /^[┌├└]/u.test(l));

test('a table that fits keeps its natural column widths', () => {
  const lines = renderPlain('| A | Long header |\n|---|---|\n| x | y |', 80);
  expect(lines[0]).toBe('┌─────┬─────────────┐');
});

test('a table that has to wrap fills the full width', () => {
  const md = [
    '| Command | What it does | Notes |',
    '|---|---|---|',
    '| configuration | Reads and validates the settings file | Looks in the config directory first, then falls back to the home directory |',
    '| synchronise | Pulls changes from the remote | Runs the hooks before and after, if there are any |',
  ].join('\n');
  for (const cols of [60, 73, 90]) {
    const lines = renderPlain(md, cols);
    expect(lines.length > 0).toBeTruthy();
    for (const line of lines) expect(visibleWidth(line), `at ${cols} columns: ${line}`).toBe(cols);
  }
});

test('wrapped words do not leave a leading space on the next line of a cell', () => {
  const lines = renderPlain('| Name | Description |\n|---|---|\n| iStat Menus | System stats in the menu bar |', 30);
  const body = lines.slice(lines.findIndex((l) => l.startsWith('├')) + 1);
  for (const line of body.filter((l) => l.startsWith('│'))) {
    for (const cell of line.split('│').slice(1, -1)) expect(cell, `cell "${cell}"`).not.toMatch(/^  \S/u);
  }
});

test('a cell needing more than four lines switches to header: value records', () => {
  const long = 'word '.repeat(80).trim();
  const lines = renderPlain(`| Name | Description |\n|---|---|\n| alpha | ${long} |\n| beta | short |`, 60);
  expect(borders(lines).length).toBe(0);
  expect(lines[0]).toBe('Name: alpha');
  expect(must(lines[1]).startsWith('Description: word word')).toBeTruthy();
  expect(lines.includes('Name: beta')).toBeTruthy();
  expect(lines.includes('Description: short')).toBeTruthy();
  expect(lines.some((l) => /^─+$/u.test(l)), 'records are separated by a rule').toBeTruthy();
});

test('headers are centred and body cells follow the column alignment', () => {
  const lines = renderPlain('| Left | Centre | Right |\n|:---|:---:|---:|\n| a | b | c |\n| longer | longer | longer |', 80);
  expect(lines[1]).toBe('│  Left  │ Centre │ Right  │');
  expect(lines[3]).toBe('│ a      │   b    │      c │');
});

test('wide characters count as two columns so borders line up', () => {
  const lines = renderPlain('| Lang | Hi |\n|---|---|\n| ja | こんにちは |\n| emoji | 😀🎉 |', 80);
  const widths = new Set(lines.map((line) => visibleWidth(line)));
  expect(widths.size, lines.join('\n')).toBe(1);
});

test('a cell shorter than its row is centred vertically', () => {
  const lines = renderPlain('| Name | Notes |\n|---|---|\n| short | one two three four five six seven |', 26);
  const body = lines.slice(3, -1);
  expect(body.length).toBe(3);
  expect(must(body[1])).toMatch(/^│ short/u);
  expect(must(body[0])).toMatch(/^│ {7}│/u);
});

test('only the first 200 rows are drawn, with a note about the rest', () => {
  const rows = Array.from({ length: 205 }, (_, i) => `| ${i} | x |`).join('\n');
  const lines = renderPlain(`| N | V |\n|---|---|\n${rows}`, 80);
  expect(lines.at(-1)).toBe('… 5 more rows not shown');
  expect(lines.some((l) => l.includes('│ 199 │'))).toBeTruthy();
  expect(!lines.some((l) => l.includes('│ 200 │'))).toBeTruthy();
});
