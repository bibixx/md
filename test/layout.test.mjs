import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderPlain } from './helpers.mjs';

test('a paragraph directly above a list has no blank line between them', () => {
  assert.deepEqual(renderPlain('Intro:\n- a\n- b'), ['Intro:', '- a', '- b']);
});

test('a blank line between a paragraph and a list is kept', () => {
  assert.deepEqual(renderPlain('Intro:\n\n- a'), ['Intro:', '', '- a']);
});

test('text after a list is separated by one blank line', () => {
  assert.deepEqual(renderPlain('- a\n\nAfter.'), ['- a', '', 'After.']);
});

test('headings are followed by exactly one blank line', () => {
  assert.deepEqual(renderPlain('# Title\n\nBody.\n\n## Sub\nMore.'), ['Title', '', 'Body.', '', 'Sub', '', 'More.']);
});

test('tables and quotes get a blank line above them even without one in the source', () => {
  const lines = renderPlain('Text\n> quote');
  assert.deepEqual(lines, ['Text', '', '▎ quote']);
});

test('single newlines inside a paragraph reflow as spaces', () => {
  assert.deepEqual(renderPlain('one two\nthree four\nfive', 80), ['one two three four five']);
});

test('hard breaks (two trailing spaces or a backslash) still break the line', () => {
  assert.deepEqual(renderPlain('one  \ntwo\\\nthree'), ['one', 'two', 'three']);
});

test('code blocks keep their indentation and newlines', () => {
  assert.deepEqual(renderPlain('```py\nif x:\n    y = 1\n```'), ['if x:', '    y = 1']);
});

test('quotes keep the bar on every wrapped line, and nest', () => {
  const lines = renderPlain('> alpha beta gamma delta epsilon\n> > inner', 16);
  for (const line of lines.filter(Boolean)) assert.match(line, /^▎ /, line);
  assert.ok(lines.includes('▎ ▎ inner'));
});

test('a horizontal rule is a line across the available width, also inside lists and quotes', () => {
  const lines = renderPlain('Above\n\n---\n\n- item\n\n  ***\n\n> ___', 30);
  assert.ok(lines.includes('─'.repeat(30)), lines.join('\n'));
  assert.ok(lines.includes('  ' + '─'.repeat(28)), 'inside a list item');
  assert.ok(lines.includes('▎ ' + '─'.repeat(28)), 'inside a quote');
  assert.ok(!lines.some((l) => l.includes('---') || l.includes('\u0000')));
});

test('HTML comments are grey, other HTML is left as written', async () => {
  const { default: chalk } = await import('chalk');
  const { layout } = await import('../src/layout.mjs');
  const { getTheme } = await import('../src/theme.mjs');
  const level = chalk.level;
  chalk.level = 1;
  try {
    const lines = layout('Text <!-- note --> and <kbd>K</kbd>.\n\n<!--\ntwo\n-->', { theme: getTheme('dark'), hyperlinks: false }, 80);
    assert.equal(lines[0], `Text ${chalk.gray('<!-- note -->')} and <kbd>K</kbd>.`);
    assert.deepEqual(lines.slice(2), [chalk.gray('<!--'), chalk.gray('two'), chalk.gray('-->')]);
  } finally {
    chalk.level = level;
  }
});
