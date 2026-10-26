import { test, expect } from 'bun:test';
import { renderPlain } from './helpers.ts';

test('a paragraph directly above a list has no blank line between them', () => {
  expect(renderPlain('Intro:\n- a\n- b')).toEqual(['Intro:', '- a', '- b']);
});

test('a blank line between a paragraph and a list is kept', () => {
  expect(renderPlain('Intro:\n\n- a')).toEqual(['Intro:', '', '- a']);
});

test('text after a list is separated by one blank line', () => {
  expect(renderPlain('- a\n\nAfter.')).toEqual(['- a', '', 'After.']);
});

test('headings are followed by exactly one blank line', () => {
  expect(renderPlain('# Title\n\nBody.\n\n## Sub\nMore.')).toEqual(['Title', '', 'Body.', '', 'Sub', '', 'More.']);
});

test('tables and quotes get a blank line above them even without one in the source', () => {
  const lines = renderPlain('Text\n> quote');
  expect(lines).toEqual(['Text', '', '▎ quote']);
});

test('single newlines inside a paragraph reflow as spaces', () => {
  expect(renderPlain('one two\nthree four\nfive', 80)).toEqual(['one two three four five']);
});

test('hard breaks (two trailing spaces or a backslash) still break the line', () => {
  expect(renderPlain('one  \ntwo\\\nthree')).toEqual(['one', 'two', 'three']);
});

test('code blocks keep their indentation and newlines', () => {
  expect(renderPlain('```py\nif x:\n    y = 1\n```')).toEqual(['if x:', '    y = 1']);
});

test('quotes keep the bar on every wrapped line, and nest', () => {
  const lines = renderPlain('> alpha beta gamma delta epsilon\n> > inner', 16);
  for (const line of lines.filter(Boolean)) expect(line, line).toMatch(/^▎ /u);
  expect(lines.includes('▎ ▎ inner')).toBeTruthy();
});

test('a horizontal rule is a line across the available width, also inside lists and quotes', () => {
  const lines = renderPlain('Above\n\n---\n\n- item\n\n  ***\n\n> ___', 30);
  expect(lines.includes('─'.repeat(30)), lines.join('\n')).toBeTruthy();
  expect(lines.includes('  ' + '─'.repeat(28)), 'inside a list item').toBeTruthy();
  expect(lines.includes('▎ ' + '─'.repeat(28)), 'inside a quote').toBeTruthy();
  expect(!lines.some((l) => l.includes('---') || l.includes('\u0000'))).toBeTruthy();
});

test('HTML comments are grey, other HTML is left as written', async () => {
  const { default: chalk } = await import('chalk');
  const { layout } = await import('../src/layout.ts');
  const { getTheme } = await import('../src/theme.ts');
  const level = chalk.level;
  chalk.level = 1;
  try {
    const lines = layout('Text <!-- note --> and <kbd>K</kbd>.\n\n<!--\ntwo\n-->', { theme: getTheme('dark'), hyperlinks: false }, 80);
    expect(lines[0]).toBe(`Text ${chalk.gray('<!-- note -->')} and <kbd>K</kbd>.`);
    expect(lines.slice(2)).toEqual([chalk.gray('<!--'), chalk.gray('two'), chalk.gray('-->')]);
  } finally {
    chalk.level = level;
  }
});
