import { test, expect } from 'bun:test';
import { wrapText, wrapCell, endsWithBlankLine, expandTabs } from '../src/text.ts';

test('wrapped lines do not start with the space they broke on', () => {
  expect(wrapText('aaa bbb ccc ddd', 7)).toEqual(['aaa bbb', 'ccc ddd']);
});

test('the leading space is also dropped when the line starts with a style code', () => {
  const rows = wrapText('\x1b[1maaa bbb ccc\x1b[22m', 4);
  for (const row of rows.slice(1)) expect(row.replaceAll(/\x1b\[[\d;]*m/gu, ''), JSON.stringify(row)).not.toMatch(/^ /u);
});

test('indentation at the start of a line is kept', () => {
  expect(wrapText('    indented', 40)).toEqual(['    indented']);
});

test('cells word-wrap without hard breaks unless asked to', () => {
  expect(wrapCell('supercalifragilistic', 5)).toEqual(['supercalifragilistic']);
  expect(wrapCell('supercalifragilistic', 5, { hard: true })).toEqual(['super', 'calif', 'ragil', 'istic']);
});

test('detects a trailing blank line, ignoring whitespace on it', () => {
  expect(endsWithBlankLine('text\n\n')).toBe(true);
  expect(endsWithBlankLine('text\n  \t\n')).toBe(true);
  expect(endsWithBlankLine('text\n')).toBe(false);
  expect(endsWithBlankLine('text')).toBe(false);
});

test('tabs expand to the next 2-column stop', () => {
  expect(expandTabs('\tx\nab\tc\nabc\td\na\u4e00\te')).toBe('  x\nab  c\nabc d\na\u4e00 e');
});
