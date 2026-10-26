import os from 'node:os';
import path from 'node:path';
import type { Padding } from './types.ts';

// An empty XDG_CONFIG_HOME counts as unset, as the XDG spec says.
export function configPath(): string {
  const xdg = Bun.env.XDG_CONFIG_HOME;
  return path.join(xdg === undefined || xdg === '' ? path.join(os.homedir(), '.config') : xdg, 'md', 'config.json');
}

export interface Config {
  padding: Padding;
  /** inside code blocks' background */
  codePadding: Padding;
  tabWidth: number;
}

const DEFAULTS: Config = {
  padding: { top: 1, bottom: 1, left: 2, right: 2 },
  codePadding: { top: 0, bottom: 0, left: 1, right: 1 },
  tabWidth: 2,
};

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null;
const count = (v: unknown, fallback: number): number => (typeof v === 'number' && Number.isInteger(v) && v >= 0 ? v : fallback);

function normalisePadding(value: unknown, d: Padding): Padding {
  const p = isRecord(value) ? value : {};
  return {
    top: count(p.top, count(p.vertical, d.top)),
    bottom: count(p.bottom, count(p.vertical, d.bottom)),
    left: count(p.left, count(p.horizontal, d.left)),
    right: count(p.right, count(p.horizontal, d.right)),
  };
}

export async function loadConfig(file = configPath()): Promise<Config> {
  let raw: Record<string, unknown> = {};
  try {
    const parsed: unknown = await Bun.file(file).json();
    if (isRecord(parsed)) raw = parsed;
  } catch (error) {
    const missing = error instanceof Error && 'code' in error && error.code === 'ENOENT';
    if (!missing) console.error(`md: ignoring ${file}: ${error instanceof Error ? error.message : String(error)}`);
  }
  return {
    padding: normalisePadding(raw.padding, DEFAULTS.padding),
    codePadding: normalisePadding(raw.codePadding, DEFAULTS.codePadding),
    tabWidth: count(raw.tabWidth, 0) || DEFAULTS.tabWidth,
  };
}
