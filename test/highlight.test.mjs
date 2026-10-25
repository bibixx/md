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

// each sample's embedded language shows up in colour (JavaScript in HTML, HTML in markdown, ...)
const SAMPLES = [
  ['html', '<p class="x">hi</p>\n<script>const n = "one"; // two\n</script>'],
  ['markdown', '# Title\n\n<b class="y">bold</b>'],
  ['php-template', '<div><?php echo "hi"; ?></div>'],
  ['sh', 'for f in *.md; do echo "$f"; done # loop'],
  ['python', 'def f(x: int) -> str:\n    """doc"""\n    return f"{x}"'],
];

// Highlights the samples in a fresh process, so nothing is loaded beforehand;
// with `preload`, every language is registered first, as the full highlight.js package does.
function highlightInFreshProcess(preload) {
  const script = `
    ${preload ? "await import('highlight.js');" : ''}
    const { default: chalk } = await import('chalk');
    chalk.level = 1;
    const { highlighter } = await import(${JSON.stringify(new URL('../src/highlight.mjs', import.meta.url).href)});
    console.log(JSON.stringify(${JSON.stringify(SAMPLES)}.map(([language, code]) => highlighter.highlight(code, { language }))));`;
  const proc = Bun.spawnSync(['bun', '-e', script], { cwd: new URL('..', import.meta.url).pathname });
  assert.equal(proc.exitCode, 0, proc.stderr.toString());
  return JSON.parse(proc.stdout.toString());
}

test('loading languages on demand highlights exactly like loading them all', () => {
  assert.deepEqual(highlightInFreshProcess(false), highlightInFreshProcess(true));
});

test('a language and the ones it embeds are loaded the first time a block uses them', async () => {
  const { default: core } = await import('highlight.js/lib/core');
  for (const name of ['erlang', 'haskell']) assert.ok(!core.listLanguages().includes(name), `${name} preloaded`);
  highlighter.highlight('main = print 1', { language: 'hs' }); // an alias
  assert.ok(core.listLanguages().includes('haskell'));
  assert.ok(!core.listLanguages().includes('erlang'));
});

test('the language index matches the installed highlight.js (run `bun run gen:languages` if not)', () => {
  const script = `
    const { default: hljs } = await import('highlight.js');
    const index = (await import(${JSON.stringify(new URL('../src/hljs-languages.json', import.meta.url).href)}, { with: { type: 'json' } })).default;
    const names = hljs.listLanguages().sort();
    const aliases = Object.fromEntries(names.flatMap((n) => (hljs.getLanguage(n).aliases ?? []).map((a) => [a.toLowerCase(), n])));
    console.log(JSON.stringify(index.names) === JSON.stringify(names) && JSON.stringify(Object.entries(index.aliases).sort()) === JSON.stringify(Object.entries(aliases).sort()));`;
  const proc = Bun.spawnSync(['bun', '-e', script], { cwd: new URL('..', import.meta.url).pathname });
  assert.equal(proc.stdout.toString().trim(), 'true', proc.stderr.toString());
});
