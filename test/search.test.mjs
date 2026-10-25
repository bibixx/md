import { test } from 'node:test';
import assert from 'node:assert/strict';
import chalk from 'chalk';
import { matcher, highlight, plain, editPrompt } from '../src/search.mjs';
import { segments } from '../src/layout.mjs';
import { Document } from '../src/document.mjs';
import { getTheme } from '../src/theme.mjs';
import { find, start } from '../src/viewport.mjs';

chalk.level = 1;
const INV = '\x1b[7m';
const UNINV = '\x1b[27m';

test('lowercase searches ignore case, a capital letter makes it case-sensitive', () => {
  assert.ok(matcher('hello').test.test('Say Hello'));
  assert.ok(!matcher('Hello').test.test('say hello'));
  assert.ok(matcher('Hello').test.test('Say Hello'));
});

test('the query is literal text, not a regex', () => {
  assert.ok(!matcher('a.b').test.test('axb'));
  assert.ok(matcher('f(x) [1]').test.test('call f(x) [1] now'));
});

test('matches are wrapped in reverse video without disturbing the line’s own styling', () => {
  const line = `see ${chalk.bold('foo')}bar and \x1b]8;;https://x.y\x07${chalk.blue('foobar')}\x1b]8;;\x07`;
  const out = highlight(line, matcher('obar'));
  assert.equal(plain(out).replaceAll(INV, '').replaceAll(UNINV, ''), plain(line));
  assert.equal(out.split(INV).length - 1, 2, JSON.stringify(out));
  // the match that crosses the bold → plain boundary still covers exactly "obar"
  const first = out.slice(out.indexOf(INV) + INV.length, out.indexOf(UNINV));
  assert.equal(plain(first), 'obar');
  assert.equal(highlight('nothing here', matcher('zzz')), 'nothing here');
});

test('the prompt edits text and reports submit, cancel and exit', () => {
  assert.deepEqual(editPrompt('', 'abc'), { text: 'abc', done: null });
  assert.deepEqual(editPrompt('ab😀', '\x7f'), { text: 'ab', done: null });
  assert.deepEqual(editPrompt('abc', '\x15xy'), { text: 'xy', done: null });
  assert.deepEqual(editPrompt('ab', '\x1b[Dc'), { text: 'abc', done: null }, 'arrow keys are ignored');
  assert.deepEqual(editPrompt('ab', 'c\rmore'), { text: 'abc', done: 'submit' });
  assert.deepEqual(editPrompt('ab', '\x1b'), { text: 'ab', done: 'cancel' });
  assert.deepEqual(editPrompt('ab', '\x03'), { text: 'ab', done: 'exit' });
});

const doc = (() => {
  const src = ['alpha one', 'beta two', 'gamma three', 'alpha four', 'delta five'].join('\n\n');
  const d = new Document(segments(src, { theme: getTheme('dark'), hyperlinks: false }));
  d.setWidth(80);
  return d;
})();
const lineAt = (p) => plain(doc.lines(p.unit)[p.offset]);
const has = (q) => (line) => matcher(q).test.test(plain(line));

test('n finds the next matching line below the top, N the one above, wrapping around', () => {
  const first = find(doc, start(), has('alpha'), 1);
  assert.equal(lineAt(first.pos), 'alpha four');
  assert.equal(first.wrapped, false);

  const again = find(doc, first.pos, has('alpha'), 1);
  assert.equal(lineAt(again.pos), 'alpha one');
  assert.equal(again.wrapped, true);

  const back = find(doc, first.pos, has('gamma'), -1);
  assert.equal(lineAt(back.pos), 'gamma three');
  assert.equal(back.wrapped, false);
});

test('a search with no match anywhere returns nothing', () => {
  assert.equal(find(doc, start(), has('zeta'), 1), null);
  assert.equal(find(doc, start(), has('zeta'), -1), null);
});
