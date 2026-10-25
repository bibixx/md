import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderPlain, visibleWidth } from './helpers.mjs';

const borders = (lines) => lines.filter((l) => /^[┌├└]/.test(l));

test('a table that fits keeps its natural column widths', () => {
  const lines = renderPlain('| A | Long header |\n|---|---|\n| x | y |', 80);
  assert.equal(lines[0], '┌─────┬─────────────┐');
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
    assert.ok(lines.length > 0);
    for (const line of lines) assert.equal(visibleWidth(line), cols, `at ${cols} columns: ${line}`);
  }
});

test('wrapped words do not leave a leading space on the next line of a cell', () => {
  const lines = renderPlain('| Name | Description |\n|---|---|\n| iStat Menus | System stats in the menu bar |', 30);
  const body = lines.slice(lines.findIndex((l) => l.startsWith('├')) + 1);
  for (const line of body.filter((l) => l.startsWith('│'))) {
    for (const cell of line.split('│').slice(1, -1)) assert.doesNotMatch(cell, /^  \S/, `cell "${cell}"`);
  }
});

test('a cell needing more than four lines switches to header: value records', () => {
  const long = 'word '.repeat(80).trim();
  const lines = renderPlain(`| Name | Description |\n|---|---|\n| alpha | ${long} |\n| beta | short |`, 60);
  assert.equal(borders(lines).length, 0);
  assert.equal(lines[0], 'Name: alpha');
  assert.ok(lines[1].startsWith('Description: word word'));
  assert.ok(lines.includes('Name: beta'));
  assert.ok(lines.includes('Description: short'));
  assert.ok(lines.some((l) => /^─+$/.test(l)), 'records are separated by a rule');
});

test('headers are centred and body cells follow the column alignment', () => {
  const lines = renderPlain('| Left | Centre | Right |\n|:---|:---:|---:|\n| a | b | c |\n| longer | longer | longer |', 80);
  assert.equal(lines[1], '│  Left  │ Centre │ Right  │');
  assert.equal(lines[3], '│ a      │   b    │      c │');
});

test('wide characters count as two columns so borders line up', () => {
  const lines = renderPlain('| Lang | Hi |\n|---|---|\n| ja | こんにちは |\n| emoji | 😀🎉 |', 80);
  const widths = new Set(lines.map(visibleWidth));
  assert.equal(widths.size, 1, lines.join('\n'));
});

test('a cell shorter than its row is centred vertically', () => {
  const lines = renderPlain('| Name | Notes |\n|---|---|\n| short | one two three four five six seven |', 26);
  const body = lines.slice(3, -1);
  assert.equal(body.length, 3);
  assert.match(body[1], /^│ short/);
  assert.match(body[0], /^│ {7}│/);
});

test('only the first 200 rows are drawn, with a note about the rest', () => {
  const rows = Array.from({ length: 205 }, (_, i) => `| ${i} | x |`).join('\n');
  const lines = renderPlain(`| N | V |\n|---|---|\n${rows}`, 80);
  assert.equal(lines.at(-1), '… 5 more rows not shown');
  assert.ok(lines.some((l) => l.includes('│ 199 │')));
  assert.ok(!lines.some((l) => l.includes('│ 200 │')));
});
