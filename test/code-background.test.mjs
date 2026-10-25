import { test } from 'node:test';
import assert from 'node:assert/strict';
import chalk from 'chalk';
import { layout } from '../src/layout.mjs';
import { highlighter } from '../src/highlight.mjs';
import { getTheme } from '../src/theme.mjs';
import { renderPlain, visibleWidth } from './helpers.mjs';

const BG = '\x1b[48;2;30;30;30m';

const render = (md, cols = 80, codePadding) => {
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
      assert.ok(line.startsWith(BG), `${fence}: ${JSON.stringify(line)}`);
      assert.equal(visibleWidth(line), 80, fence);
    }
  }
});

test('long code lines wrap within the width', () => {
  const lines = render('```\n' + 'x'.repeat(50) + '\nshort\n```', 20);
  assert.equal(lines.length, 4);
  for (const line of lines) assert.equal(visibleWidth(line), 20);
});

test('codePadding adds blank rows and columns inside the background, and code wraps inside it', () => {
  const lines = render('```\n' + 'x'.repeat(30) + '\n```', 20, { top: 1, bottom: 1, left: 2, right: 1 });
  assert.equal(lines.length, 4);
  for (const line of lines) {
    assert.ok(line.startsWith(BG));
    assert.equal(visibleWidth(line), 20);
  }
  const plain = lines.map((l) => l.replace(/\x1b\[[\d;]*m/g, ''));
  assert.deepEqual(plain, [' '.repeat(20), '  ' + 'x'.repeat(17) + ' ', '  ' + 'x'.repeat(13) + ' '.repeat(5), ' '.repeat(20)]);
});

test("an unknown language's label sits above the background", () => {
  const lines = render('```nosuchlang\nabc\n```');
  assert.ok(!lines[0].includes(BG));
  assert.ok(lines[1].startsWith(BG));
});

test('code in a list item is indented, and its background starts at the indent', () => {
  const lines = render('1. Install:\n\n   ```sh\n   npm install\n   npm run build\n   ```');
  for (const line of lines.slice(-2)) {
    assert.ok(line.startsWith('   ' + BG), JSON.stringify(line));
    assert.equal(visibleWidth(line), 80);
  }
});

test('without colour, code lines are not padded', () => {
  assert.deepEqual(renderPlain('```\nlonger line\nab\n```'), ['longer line', 'ab']);
});

test('tabs in code expand to tabWidth stops', () => {
  assert.deepEqual(renderPlain('```\n\tx\n```', 80, { tabWidth: 4 }), ['    x']);
});
