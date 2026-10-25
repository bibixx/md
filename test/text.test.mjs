import { test } from 'node:test';
import assert from 'node:assert/strict';
import { wrapText, wrapCell, endsWithBlankLine, expandTabs } from '../src/text.mjs';

test('wrapped lines do not start with the space they broke on', () => {
  assert.deepEqual(wrapText('aaa bbb ccc ddd', 7), ['aaa bbb', 'ccc ddd']);
});

test('the leading space is also dropped when the line starts with a style code', () => {
  const rows = wrapText('\x1b[1maaa bbb ccc\x1b[22m', 4);
  for (const row of rows.slice(1)) assert.doesNotMatch(row.replace(/\x1b\[[\d;]*m/g, ''), /^ /, JSON.stringify(row));
});

test('indentation at the start of a line is kept', () => {
  assert.deepEqual(wrapText('    indented', 40), ['    indented']);
});

test('cells word-wrap without hard breaks unless asked to', () => {
  assert.deepEqual(wrapCell('supercalifragilistic', 5), ['supercalifragilistic']);
  assert.deepEqual(wrapCell('supercalifragilistic', 5, { hard: true }), ['super', 'calif', 'ragil', 'istic']);
});

test('detects a trailing blank line, ignoring whitespace on it', () => {
  assert.equal(endsWithBlankLine('text\n\n'), true);
  assert.equal(endsWithBlankLine('text\n  \t\n'), true);
  assert.equal(endsWithBlankLine('text\n'), false);
  assert.equal(endsWithBlankLine('text'), false);
});

test('tabs expand to the next 2-column stop', () => {
  assert.equal(expandTabs('\tx\nab\tc\nabc\td\na\u4e00\te'), '  x\nab  c\nabc d\na\u4e00 e');
});
