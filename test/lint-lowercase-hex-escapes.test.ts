import { test, expect } from 'bun:test';
import { mkdtempSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { uppercaseHexEscapes } from '../lint/lowercase-hex-escapes.ts';

// Escapes here are built from `bs`, or this file's own uppercase ones would fail the lint.
const bs = '\\';
const root = path.join(import.meta.dir, '..');
const samples = path.join(import.meta.dir, 'lint-samples');

// oxlint's RuleTester only runs on Node and Deno, so this runs the real oxlint.
async function lintSample(fix: boolean): Promise<{ stdout: string; fixed: string }> {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'md-lint-'));
  const file = path.join(dir, 'sample.ts');
  await Bun.write(file, Bun.file(path.join(samples, 'uppercase-hex-escapes.ts')));
  await Bun.write(
    path.join(dir, '.oxlintrc.json'),
    JSON.stringify({
      jsPlugins: [path.join(root, 'lint', 'plugin.ts')],
      categories: { correctness: 'off' },
      rules: { 'md/lowercase-hex-escapes': 'error' },
    })
  );
  const args = [path.join(root, 'node_modules', '.bin', 'oxlint'), '-c', '.oxlintrc.json', '-f', 'json', ...(fix ? ['--fix'] : []), 'sample.ts'];
  const proc = Bun.spawnSync(args, { cwd: dir });
  return { stdout: proc.stdout.toString(), fixed: await Bun.file(file).text() };
}

const message = (from: string, to: string) => `Use lowercase hex digits in escapes: ${bs}${from} → ${bs}${to}`;

const isDiagnostics = (v: unknown): v is { diagnostics: { message: string; labels: { span: { line: number } }[] }[] } =>
  typeof v === 'object' && v !== null && 'diagnostics' in v && Array.isArray(v.diagnostics);

test('reports each uppercase escape, with its line, in strings, templates and regexes', async () => {
  const { stdout } = await lintSample(false);
  const report: unknown = JSON.parse(stdout);
  if (!isDiagnostics(report)) throw new Error(`unexpected oxlint output: ${stdout}`);
  const found = report.diagnostics.map((d) => `${d.labels[0]?.span.line}: ${d.message}`).toSorted();
  expect(found).toEqual(
    [
      `3: ${message('x1B', 'x1b')}`,
      `4: ${message('u00E9', 'u00e9')}`,
      `4: ${message('u{1F600}', 'u{1f600}')}`,
      `5: ${message('x1B', 'x1b')}`,
      `6: ${message('x1F', 'x1f')}`,
    ].toSorted()
  );
});

test('--fix lowercases the escapes and leaves everything else alone', async () => {
  const { fixed } = await lintSample(true);
  expect(fixed).toBe(await Bun.file(path.join(samples, 'uppercase-hex-escapes.fixed.ts')).text());
});

test('the scanner skips escaped backslashes and reports each escape where it starts', () => {
  const raw = `a${bs}x1Bb${bs}${bs}x1Fc${bs}u00E9`;
  expect(uppercaseHexEscapes(raw)).toEqual([
    { start: 1, text: `${bs}x1B`, fixed: `${bs}x1b` },
    { start: 12, text: `${bs}u00E9`, fixed: `${bs}u00e9` },
  ]);
});
