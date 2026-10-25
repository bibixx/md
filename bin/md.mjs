#!/usr/bin/env bun
import fs from 'node:fs';
import path from 'node:path';
import chalk from 'chalk';
import { segments } from '../src/layout.mjs';
import { Document } from '../src/document.mjs';
import { highlighter } from '../src/highlight.mjs';
import { getTheme } from '../src/theme.mjs';
import { page } from '../src/pager.mjs';
import { loadConfig, CONFIG_PATH } from '../src/config.mjs';

const USAGE = `usage: md [file] [options]

Renders markdown the way Claude Code does. Reads stdin when no file is given.
Opens a resizable full-screen viewer in a terminal; prints when piped or with -p.

  -p, --print        print instead of opening the viewer
  -w, --width N      render at N columns (default: terminal width, or 100 when piped)
      --light        use the light theme colours (default: detected from COLORFGBG)
      --dark         use the dark theme colours
      --no-color     plain text
  -h, --help         show this help

Padding is set in ${CONFIG_PATH}:
  { "padding": { "top": 1, "bottom": 1, "left": 2, "right": 2 },
    "codePadding": { "vertical": 1, "horizontal": 1 }, "tabWidth": 2 }
("vertical" and "horizontal" work as shorthands; codePadding is inside code blocks' background;
tabWidth is the columns between tab stops in code.)`;

const args = process.argv.slice(2);
const flag = (...names) => args.some((a) => names.includes(a));
const value = (...names) => {
  const i = args.findIndex((a) => names.includes(a));
  return i === -1 ? undefined : args[i + 1];
};

if (flag('-h', '--help')) {
  console.log(USAGE);
  process.exit(0);
}

const widthArg = value('-w', '--width');
const file = args.find((a, i) => !a.startsWith('-') && a !== widthArg);
const out = process.stdout;

if (flag('--no-color')) chalk.level = 0;

if (!file && process.stdin.isTTY) {
  console.error(USAGE);
  process.exit(1);
}

let src;
try {
  src = fs.readFileSync(file ?? 0, 'utf8');
} catch (e) {
  console.error(`md: ${e.message}`);
  process.exit(1);
}

const config = loadConfig();
const ctx = {
  codePadding: config.codePadding,
  tabWidth: config.tabWidth,
  theme: getTheme(flag('--light') ? 'light' : flag('--dark') ? 'dark' : undefined),
  highlight: highlighter,
  hyperlinks: out.isTTY === true,
};
const doc = new Document(segments(src, ctx), config.padding);
const fixedWidth = widthArg ? Number(widthArg) : undefined;
doc.setWidth(fixedWidth ?? (out.isTTY ? out.columns : 100));

// in a terminal, always open the viewer, even when the document fits; piped output just prints
if (out.isTTY && !flag('-p', '--print')) {
  page(doc, file ? path.basename(file) : 'stdin', { fixedWidth });
} else {
  out.write(doc.all().join('\n') + '\n');
}
