import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

let n = 0;

// CONFIG_PATH is resolved when the module loads, so load a fresh copy per config dir
async function loadWith(contents) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'md-config-'));
  if (contents !== undefined) {
    fs.mkdirSync(path.join(dir, 'md'));
    fs.writeFileSync(path.join(dir, 'md', 'config.json'), contents);
  }
  process.env.XDG_CONFIG_HOME = dir;
  const { loadConfig } = await import(`../src/config.mjs?case=${n++}`);
  return loadConfig();
}

const DEFAULTS = { top: 1, bottom: 1, left: 2, right: 2 };

test('defaults apply when there is no config file', async () => {
  assert.deepEqual((await loadWith()).padding, DEFAULTS);
});

test('codePadding defaults to one column left and right and takes the same shorthands', async () => {
  assert.deepEqual((await loadWith()).codePadding, { top: 0, bottom: 0, left: 1, right: 1 });
  const { codePadding } = await loadWith(JSON.stringify({ codePadding: { vertical: 1, horizontal: 2, right: 0 } }));
  assert.deepEqual(codePadding, { top: 1, bottom: 1, left: 2, right: 0 });
});

test('tabWidth defaults to 2 and ignores anything but a positive integer', async () => {
  assert.equal((await loadWith()).tabWidth, 2);
  assert.equal((await loadWith(JSON.stringify({ tabWidth: 8 }))).tabWidth, 8);
  for (const tabWidth of [0, -1, 1.5, '4']) assert.equal((await loadWith(JSON.stringify({ tabWidth }))).tabWidth, 2);
});

test('vertical/horizontal shorthands set both sides, explicit sides win', async () => {
  const { padding } = await loadWith(JSON.stringify({ padding: { vertical: 3, horizontal: 4, left: 0 } }));
  assert.deepEqual(padding, { top: 3, bottom: 3, left: 0, right: 4 });
});

test('invalid values fall back to the defaults for that side', async () => {
  const { padding } = await loadWith(JSON.stringify({ padding: { top: -1, bottom: 'x', left: 1.5, right: 5 } }));
  assert.deepEqual(padding, { ...DEFAULTS, right: 5 });
});

test('a malformed file warns and uses the defaults', async (t) => {
  const errors = [];
  t.mock.method(console, 'error', (msg) => errors.push(msg));
  assert.deepEqual((await loadWith('{ not json')).padding, DEFAULTS);
  assert.equal(errors.length, 1);
  assert.match(errors[0], /ignoring .*config\.json/);
});
