// User config: $XDG_CONFIG_HOME/md/config.json (default ~/.config/md/config.json).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export const CONFIG_PATH = path.join(process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config'), 'md', 'config.json');

const DEFAULTS = {
  padding: { top: 1, bottom: 1, left: 2, right: 2 },
  // inside code blocks' background
  codePadding: { top: 0, bottom: 0, left: 1, right: 1 },
  // columns between tab stops in code
  tabWidth: 2,
};

const count = (v, fallback) => (Number.isInteger(v) && v >= 0 ? v : fallback);

// padding may also use "vertical"/"horizontal" shorthands; explicit sides win
function normalisePadding(p = {}, d) {
  return {
    top: count(p.top, count(p.vertical, d.top)),
    bottom: count(p.bottom, count(p.vertical, d.bottom)),
    left: count(p.left, count(p.horizontal, d.left)),
    right: count(p.right, count(p.horizontal, d.right)),
  };
}

export function loadConfig() {
  let raw = {};
  try {
    raw = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
  } catch (e) {
    if (e.code !== 'ENOENT') console.error(`md: ignoring ${CONFIG_PATH}: ${e.message}`);
  }
  return {
    padding: normalisePadding(raw.padding, DEFAULTS.padding),
    codePadding: normalisePadding(raw.codePadding, DEFAULTS.codePadding),
    tabWidth: count(raw.tabWidth, 0) || DEFAULTS.tabWidth,
  };
}
