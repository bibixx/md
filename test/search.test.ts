import { test, expect } from 'bun:test';
import chalk from 'chalk';
import { matcher, highlightMatches, plain, editPrompt } from '../src/search.ts';
import { segments } from '../src/layout.ts';
import { Document } from '../src/document.ts';
import { getTheme } from '../src/theme.ts';
import { find, start } from '../src/viewport.ts';
import type { Position } from '../src/types.ts';
import { must } from './helpers.ts';

chalk.level = 1;
const INV = '\x1b[7m';
const UNINV = '\x1b[27m';

test('lowercase searches ignore case, a capital letter makes it case-sensitive', () => {
  expect(must(matcher('hello')).pattern.test('Say Hello')).toBeTruthy();
  expect(!must(matcher('Hello')).pattern.test('say hello')).toBeTruthy();
  expect(must(matcher('Hello')).pattern.test('Say Hello')).toBeTruthy();
});

test('the query is literal text, not a regex', () => {
  expect(!must(matcher('a.b')).pattern.test('axb')).toBeTruthy();
  expect(must(matcher('f(x) [1]')).pattern.test('call f(x) [1] now')).toBeTruthy();
});

test('matches are wrapped in reverse video without disturbing the line’s own styling', () => {
  const line = `see ${chalk.bold('foo')}bar and \x1b]8;;https://x.y\x07${chalk.blue('foobar')}\x1b]8;;\x07`;
  const out = highlightMatches(line, must(matcher('obar')));
  expect(plain(out).replaceAll(INV, '').replaceAll(UNINV, '')).toBe(plain(line));
  expect(out.split(INV).length - 1, JSON.stringify(out)).toBe(2);
  // the match that crosses the bold → plain boundary still covers exactly "obar"
  const first = out.slice(out.indexOf(INV) + INV.length, out.indexOf(UNINV));
  expect(plain(first)).toBe('obar');
  expect(highlightMatches('nothing here', must(matcher('zzz')))).toBe('nothing here');
});

test('the prompt edits text and reports submit, cancel and exit', () => {
  expect(editPrompt('', 'abc')).toEqual({ text: 'abc', done: null });
  expect(editPrompt('ab😀', '\x7f')).toEqual({ text: 'ab', done: null });
  // one backspace removes a whole flag, skin-toned emoji or combined accent, not one code point of it
  for (const character of ['🇵🇱', '👍🏽', 'e\u0301']) expect(editPrompt(`ab${character}`, '\x7f').text, character).toBe('ab');
  expect(editPrompt('abc', '\x15xy')).toEqual({ text: 'xy', done: null });
  expect(editPrompt('ab', '\x1b[Dc'), 'arrow keys are ignored').toEqual({ text: 'abc', done: null });
  expect(editPrompt('ab', 'c\rmore')).toEqual({ text: 'abc', done: 'submit' });
  expect(editPrompt('ab', '\x1b')).toEqual({ text: 'ab', done: 'cancel' });
  expect(editPrompt('ab', '\x03')).toEqual({ text: 'ab', done: 'exit' });
});

const doc = (() => {
  const src = ['alpha one', 'beta two', 'gamma three', 'alpha four', 'delta five'].join('\n\n');
  const d = new Document(segments(src, { theme: getTheme('dark'), hyperlinks: false }));
  d.setWidth(80);
  return d;
})();
const lineAt = (p: Position) => plain(must(doc.lines(p.unit)[p.offset]));
const has = (q: string) => (line: string) => must(matcher(q)).pattern.test(plain(line));

test('n finds the next matching line below the top, N the one above, wrapping around', () => {
  const first = must(find(doc, start(), has('alpha'), 1));
  expect(lineAt(first.pos)).toBe('alpha four');
  expect(first.wrapped).toBe(false);

  const again = must(find(doc, first.pos, has('alpha'), 1));
  expect(lineAt(again.pos)).toBe('alpha one');
  expect(again.wrapped).toBe(true);

  const back = must(find(doc, first.pos, has('gamma'), -1));
  expect(lineAt(back.pos)).toBe('gamma three');
  expect(back.wrapped).toBe(false);
});

test('a search with no match anywhere returns nothing', () => {
  expect(find(doc, start(), has('zeta'), 1)).toBe(null);
  expect(find(doc, start(), has('zeta'), -1)).toBe(null);
});
