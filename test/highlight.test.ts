import { test, expect } from 'bun:test';
import chalk from 'chalk';
import { highlighter } from '../src/highlight.ts';
import { strip } from '../src/text.ts';

chalk.level = 1;

test('highlighting keeps the source text exactly, including characters HTML escapes', () => {
  const code = `if (a < b && c > d) { s = "it's" + '<tag>' + '&amp;'; }`;
  expect(strip(highlighter.highlight(code, { language: 'js' }))).toBe(code);
});

test('nested scopes fall back to their parent style', () => {
  // highlight.js scopes a call as "title.function.invoke", which has no colour of its own
  const out = highlighter.highlight('foo();', { language: 'js' });
  expect(out.includes(chalk.yellow('foo')), JSON.stringify(out)).toBeTruthy();
});

test('an unknown language falls back to the plain text', () => {
  expect(highlighter.supportsLanguage('weirdlang')).toBe(false);
  expect(highlighter.highlight('x = 1', { language: 'weirdlang' })).toBe('x = 1');
});

// Each sample's embedded language must show up in colour, or a missing one goes unnoticed.
const SAMPLES = [
  ['html', '<p class="x">hi</p>\n<script>const n = "one"; // two\n</script>'],
  ['markdown', '# Title\n\n<b class="y">bold</b>'],
  ['php-template', '<div><?php echo "hi"; ?></div>'],
  ['sh', 'for f in *.md; do echo "$f"; done # loop'],
  ['python', 'def f(x: int) -> str:\n    """doc"""\n    return f"{x}"'],
];

// bun test shares one process, so this needs a fresh one; importing the full highlight.js
// package registers every language on the instance md uses.
function highlightInFreshProcess(preload: boolean): string[] {
  const script = `
    ${preload ? "await import('highlight.js');" : ''}
    const { default: chalk } = await import('chalk');
    chalk.level = 1;
    const { highlighter } = await import(${JSON.stringify(new URL('../src/highlight.ts', import.meta.url).href)});
    console.log(JSON.stringify(${JSON.stringify(SAMPLES)}.map(([language, code]) => highlighter.highlight(code, { language }))));`;
  const proc = Bun.spawnSync(['bun', '-e', script], { cwd: new URL('..', import.meta.url).pathname });
  expect(proc.exitCode, proc.stderr.toString()).toBe(0);
  const results: unknown = JSON.parse(proc.stdout.toString());
  if (!isStringArray(results)) throw new Error(`expected a list of strings, got ${proc.stdout.toString()}`);
  return results;
}

const isStringArray = (v: unknown): v is string[] => Array.isArray(v) && v.every((x) => typeof x === 'string');

test('loading languages on demand highlights exactly like loading them all', () => {
  expect(highlightInFreshProcess(false)).toEqual(highlightInFreshProcess(true));
});

test('a language and the ones it embeds are loaded the first time a block uses them', async () => {
  const { default: core } = await import('highlight.js/lib/core');
  for (const name of ['erlang', 'haskell']) expect(!core.listLanguages().includes(name), `${name} preloaded`).toBeTruthy();
  highlighter.highlight('main = print 1', { language: 'hs' }); // an alias
  expect(core.listLanguages().includes('haskell')).toBeTruthy();
  expect(!core.listLanguages().includes('erlang')).toBeTruthy();
});

test('the language index matches the installed highlight.js (run `bun run gen:languages` if not)', () => {
  const script = `
    const { default: hljs } = await import('highlight.js');
    const index = (await import(${JSON.stringify(new URL('../src/hljs-languages.json', import.meta.url).href)}, { with: { type: 'json' } })).default;
    const names = hljs.listLanguages().sort();
    const aliases = Object.fromEntries(names.flatMap((n) => (hljs.getLanguage(n).aliases ?? []).map((a) => [a.toLowerCase(), n])));
    console.log(JSON.stringify(index.names) === JSON.stringify(names) && JSON.stringify(Object.entries(index.aliases).sort()) === JSON.stringify(Object.entries(aliases).sort()));`;
  const proc = Bun.spawnSync(['bun', '-e', script], { cwd: new URL('..', import.meta.url).pathname });
  expect(proc.stdout.toString().trim(), proc.stderr.toString()).toBe('true');
});
