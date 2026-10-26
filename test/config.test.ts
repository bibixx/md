import { test, expect, spyOn } from 'bun:test';
import { mkdtempSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { loadConfig, configPath } from '../src/config.ts';

async function loadWith(contents?: string) {
  const file = path.join(mkdtempSync(path.join(os.tmpdir(), 'md-config-')), 'config.json');
  if (contents !== undefined) await Bun.write(file, contents);
  return loadConfig(file);
}

const DEFAULTS = { top: 1, bottom: 1, left: 2, right: 2 };

test('defaults apply when there is no config file', async () => {
  expect((await loadWith()).padding).toEqual(DEFAULTS);
});

test('codePadding defaults to one column left and right and takes the same shorthands', async () => {
  expect((await loadWith()).codePadding).toEqual({ top: 0, bottom: 0, left: 1, right: 1 });
  const { codePadding } = await loadWith(JSON.stringify({ codePadding: { vertical: 1, horizontal: 2, right: 0 } }));
  expect(codePadding).toEqual({ top: 1, bottom: 1, left: 2, right: 0 });
});

test('tabWidth defaults to 2 and ignores anything but a positive integer', async () => {
  expect((await loadWith()).tabWidth).toBe(2);
  expect((await loadWith(JSON.stringify({ tabWidth: 8 }))).tabWidth).toBe(8);
  const invalid = await Promise.all([0, -1, 1.5, '4'].map(async (tabWidth) => (await loadWith(JSON.stringify({ tabWidth }))).tabWidth));
  expect(invalid).toEqual([2, 2, 2, 2]);
});

test('vertical/horizontal shorthands set both sides, explicit sides win', async () => {
  const { padding } = await loadWith(JSON.stringify({ padding: { vertical: 3, horizontal: 4, left: 0 } }));
  expect(padding).toEqual({ top: 3, bottom: 3, left: 0, right: 4 });
});

test('invalid values fall back to the defaults for that side', async () => {
  const { padding } = await loadWith(JSON.stringify({ padding: { top: -1, bottom: 'x', left: 1.5, right: 5 } }));
  expect(padding).toEqual({ ...DEFAULTS, right: 5 });
});

test('a malformed file warns and uses the defaults', async () => {
  const errors = spyOn(console, 'error').mockImplementation(() => {});
  try {
    expect((await loadWith('{ not json')).padding).toEqual(DEFAULTS);
    expect(errors).toHaveBeenCalledTimes(1);
    expect(String(errors.mock.calls[0]?.[0])).toMatch(/ignoring .*config\.json/u);
  } finally {
    errors.mockRestore();
  }
});

test('the config lives under XDG_CONFIG_HOME, and an empty one counts as unset', () => {
  const saved = Bun.env.XDG_CONFIG_HOME;
  try {
    Bun.env.XDG_CONFIG_HOME = '/tmp/xdg';
    expect(configPath()).toBe('/tmp/xdg/md/config.json');
    Bun.env.XDG_CONFIG_HOME = '';
    expect(configPath()).toBe(path.join(os.homedir(), '.config', 'md', 'config.json'));
  } finally {
    if (saved === undefined) delete Bun.env.XDG_CONFIG_HOME;
    else Bun.env.XDG_CONFIG_HOME = saved;
  }
});
