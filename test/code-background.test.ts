import { test, expect } from 'bun:test';
import chalk from 'chalk';
import { layout } from '../src/layout.ts';
import { highlighter } from '../src/highlight.ts';
import { getTheme } from '../src/theme.ts';
import { renderPlain, visibleWidth, must } from './helpers.ts';
import type { Padding } from '../src/types.ts';

const BG = '\x1b[48;2;30;30;30m';

const render = (md: string, cols = 80, codePadding?: Partial<Padding>): string[] => {
  const level = chalk.level;
  chalk.level = 3;
  try {
    return layout(md, { theme: getTheme('dark'), highlight: highlighter, hyperlinks: false, codePadding }, cols);
  } finally {
    chalk.level = level;
  }
};

test('a code block has a background across the full width, blank lines included', () => {
  for (const fence of ['```js', '```', '```nosuchlang']) {
    const lines = render(`Text\n\n${fence}\nconst a = 1;\n\nconsole.log(a);\n\`\`\``);
    const code = lines.slice(-3);
    for (const line of code) {
      expect(line.startsWith(BG), `${fence}: ${JSON.stringify(line)}`).toBeTruthy();
      expect(visibleWidth(line), fence).toBe(80);
    }
  }
});

test('long code lines wrap within the width', () => {
  const lines = render('```\n' + 'x'.repeat(50) + '\nshort\n```', 20);
  expect(lines.length).toBe(4);
  for (const line of lines) expect(visibleWidth(line)).toBe(20);
});

test('codePadding adds blank rows and columns inside the background, and code wraps inside it', () => {
  const lines = render('```\n' + 'x'.repeat(30) + '\n```', 20, { top: 1, bottom: 1, left: 2, right: 1 });
  expect(lines.length).toBe(4);
  for (const line of lines) {
    expect(line.startsWith(BG)).toBeTruthy();
    expect(visibleWidth(line)).toBe(20);
  }
  const plain = lines.map((l) => l.replaceAll(/\x1b\[[\d;]*m/gu, ''));
  expect(plain).toEqual([' '.repeat(20), '  ' + 'x'.repeat(17) + ' ', '  ' + 'x'.repeat(13) + ' '.repeat(5), ' '.repeat(20)]);
});

test("an unknown language's label sits above the background", () => {
  const lines = render('```nosuchlang\nabc\n```');
  expect(!must(lines[0]).includes(BG)).toBeTruthy();
  expect(must(lines[1]).startsWith(BG)).toBeTruthy();
});

test('code in a list item is indented, and its background starts at the indent', () => {
  const lines = render('1. Install:\n\n   ```sh\n   npm install\n   npm run build\n   ```');
  for (const line of lines.slice(-2)) {
    expect(line.startsWith('   ' + BG), JSON.stringify(line)).toBeTruthy();
    expect(visibleWidth(line)).toBe(80);
  }
});

test('without colour, code lines are not padded', () => {
  expect(renderPlain('```\nlonger line\nab\n```')).toEqual(['longer line', 'ab']);
});

test('tabs in code expand to tabWidth stops', () => {
  expect(renderPlain('```\n\tx\n```', 80, { tabWidth: 4 })).toEqual(['    x']);
});
