import { test } from 'node:test';
import assert from 'node:assert/strict';
import chalk from 'chalk';
import { highlighter } from '../src/highlight.mjs';
import { strip } from '../src/text.mjs';

chalk.level = 1;

test('highlighting keeps the source text exactly, including characters HTML escapes', () => {
  const code = `if (a < b && c > d) { s = "it's" + '<tag>' + '&amp;'; }`;
  assert.equal(strip(highlighter.highlight(code, { language: 'js' })), code);
});

test('nested scopes fall back to their parent style', () => {
  // highlight.js tags a call as "title.function.invoke", which has no entry of its own;
  // it should get the "title.function" colour (yellow)
  const out = highlighter.highlight('foo();', { language: 'js' });
  assert.ok(out.includes(chalk.yellow('foo')), JSON.stringify(out));
});

test('an unknown language falls back to the plain text', () => {
  assert.equal(highlighter.supportsLanguage('weirdlang'), false);
  assert.equal(highlighter.highlight('x = 1', { language: 'weirdlang' }), 'x = 1');
});
