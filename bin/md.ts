#!/usr/bin/env bun
import path from 'node:path';
import chalk from 'chalk';
import { segments } from '../src/layout.ts';
import { Document } from '../src/document.ts';
import { highlighter } from '../src/highlight.ts';
import { getTheme } from '../src/theme.ts';
import { page } from '../src/pager.ts';
import { loadConfig, configPath } from '../src/config.ts';

const USAGE = `usage: md [file] [options]

Renders markdown the way Claude Code does. Reads stdin when no file is given.
Opens a resizable full-screen viewer in a terminal; prints when piped or with -p.

  -p, --print        print instead of opening the viewer
  -w, --width N      render at N columns (default: terminal width, or 100 when piped)
      --light        use the light theme colours (default: detected from COLORFGBG)
      --dark         use the dark theme colours
      --no-color     plain text
  -h, --help         show this help

Padding is set in ${configPath()}:
  { "padding": { "top": 1, "bottom": 1, "left": 2, "right": 2 },
    "codePadding": { "vertical": 1, "horizontal": 1 }, "tabWidth": 2 }
("vertical" and "horizontal" work as shorthands; codePadding is inside code blocks' background;
tabWidth is the columns between tab stops in code.)`;

const args = Bun.argv.slice(2);
const flag = (...names: string[]) => args.some((a) => names.includes(a));
const value = (...names: string[]) => {
  const i = args.findIndex((a) => names.includes(a));
  return i === -1 ? undefined : args[i + 1];
};

if (flag('-h', '--help')) {
  await Bun.write(Bun.stdout, USAGE + '\n');
  process.exit(0);
}

const widthArg = value('-w', '--width');
const file = args.find((a) => !a.startsWith('-') && a !== widthArg);
const out = process.stdout;

if (flag('--no-color')) chalk.level = 0;

if (file === undefined && process.stdin.isTTY) {
  console.error(USAGE);
  process.exit(1);
}

let src: string;
try {
  src = file === undefined ? await Bun.stdin.text() : await Bun.file(file).text();
} catch (error) {
  console.error(`md: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}

const config = await loadConfig();
const ctx = {
  codePadding: config.codePadding,
  tabWidth: config.tabWidth,
  theme: getTheme(flag('--light') ? 'light' : flag('--dark') ? 'dark' : undefined),
  highlight: highlighter,
  hyperlinks: out.isTTY,
};
const doc = new Document(segments(src, ctx), config.padding);
const fixedWidth = widthArg === undefined ? undefined : Number(widthArg);
doc.setWidth(fixedWidth ?? (out.isTTY ? out.columns : 100));

if (out.isTTY && !flag('-p', '--print')) {
  page(doc, file === undefined ? 'stdin' : path.basename(file), { fixedWidth });
} else {
  out.write(doc.allLines().join('\n') + '\n');
}
