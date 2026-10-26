import { test, expect } from 'bun:test';
import { renderPlain } from './helpers.ts';

test('ordered markers go 1. → a. → i. → 1. as lists nest', () => {
  const md = ['1. one', '   1. two', '      1. three', '         1. four'].join('\n');
  expect(renderPlain(md).map((l) => l.trim().split(' ')[0])).toEqual(['1.', 'a.', 'i.', '1.']);
});

test('nested ordered lists count from the right number in each style', () => {
  const md = ['1. x', '   1. a', '   2. b', '   3. c', '      1. i', '      2. ii', '      3. iii', '      4. iv'].join('\n');
  const markers = renderPlain(md).map((l) => l.trim().split(' ')[0]);
  expect(markers).toEqual(['1.', 'a.', 'b.', 'c.', 'i.', 'ii.', 'iii.', 'iv.']);
});

test('an ordered list keeps its start number', () => {
  expect(renderPlain('5. five\n6. six')).toEqual(['5. five', '6. six']);
});

test('wrapped item text hangs under the text, not the marker', () => {
  const lines = renderPlain('- alpha beta gamma delta epsilon zeta eta theta', 20);
  expect(lines[0]).toBe('- alpha beta gamma');
  for (const line of lines.slice(1)) expect(line, line).toMatch(/^ {2}\S/u);
});

test('nested items indent by the width of the parent marker', () => {
  const lines = renderPlain('10. ten\n    - child');
  expect(lines).toEqual(['10. ten', '    - child']);
});

test('task items show their checkbox state', () => {
  expect(renderPlain('- [x] done\n- [ ] todo')).toEqual(['- [x] done', '- [ ] todo']);
});

test('code, quotes and tables inside an item line up under the item text', () => {
  const md = ['1. Install:', '   ```sh', '   npm i', '   ```', '   - nested:', '     > quote', '', '   | A | B |', '   |---|---|', '   | 1 | 2 |'].join('\n');
  const lines = renderPlain(md, 40);
  expect(lines.includes('   npm i'), lines.join('\n')).toBeTruthy();
  expect(lines.includes('     ▎ quote'), lines.join('\n')).toBeTruthy();
  expect(lines.includes('   ┌─────┬─────┐'), lines.join('\n')).toBeTruthy();
});
