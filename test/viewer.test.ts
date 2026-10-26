import { test, expect } from 'bun:test';
import chalk from 'chalk';
import { Document } from '../src/document.ts';
import { segments } from '../src/layout.ts';
import { footer, Viewer, type Terminal } from '../src/pager.ts';
import { getTheme } from '../src/theme.ts';

const noop = (): void => {};

class FakeTerminal implements Terminal {
  written = '';
  rawMode = false;
  exited = false;
  private onKeys: ((chunk: string) => void) | undefined;
  private onResize: (() => void) | undefined;

  input = {
    setRawMode: (mode: boolean) => {
      this.rawMode = mode;
    },
    resume: noop,
    setEncoding: noop,
    on: (_event: 'data', listener: (chunk: string) => void) => {
      this.onKeys = listener;
    },
  };

  output: { rows: number; columns: number; write(text: string): void; on(event: 'resize', listener: () => void): void };

  constructor(columns: number, rows: number) {
    this.output = {
      rows,
      columns,
      write: (text) => {
        this.written += text;
      },
      on: (_event, listener) => {
        this.onResize = listener;
      },
    };
  }

  exit(): void {
    this.exited = true;
  }

  press(keys: string): void {
    this.onKeys?.(keys);
  }

  resize(columns: number): void {
    this.output.columns = columns;
    this.onResize?.();
  }

  get lines(): string[] {
    const frame = this.written.slice(this.written.lastIndexOf('\x1b[H'));
    return Bun.stripANSI(frame).split('\r\n');
  }

  get top(): string {
    return this.lines[0] ?? '';
  }

  get footer(): string {
    return this.lines.at(-1)?.trim() ?? '';
  }
}

const items = Array.from({ length: 100 }, (_, i) => `- item ${i + 1} of the list`).join('\n');

const FOOTER_ROWS = 1;

function open(src = items, cols = 40, documentRows = 9): FakeTerminal {
  chalk.level = 1;
  const fake = new FakeTerminal(cols, documentRows + FOOTER_ROWS);
  const doc = new Document(segments(src, { theme: getTheme('dark'), hyperlinks: false }));
  new Viewer(doc, 'items.md', undefined, fake).open();
  return fake;
}

const backgroundLayout = () => Bun.sleep(20);

test('opens on the first screen, and the footer becomes exact once the background layout is done', async () => {
  const fake = open();
  expect(fake.top).toBe('- item 1 of the list');
  expect(fake.lines).toHaveLength(10);
  await backgroundLayout();
  expect(fake.footer).toMatch(/^items\.md +1-9\/100 \(9%\)$/u);
});

test('switches the terminal to full screen with mouse reporting, and restores it on quit', () => {
  const fake = open();
  expect(fake.written.startsWith('\x1b[?1049h\x1b[?25l\x1b[?7l\x1b[?1000h\x1b[?1006h')).toBe(true);
  expect(fake.rawMode).toBe(true);
  fake.press('q');
  expect(fake.written.endsWith('\x1b[?1006l\x1b[?1000l\x1b[?7h\x1b[?25h\x1b[?1049l')).toBe(true);
  expect(fake.rawMode).toBe(false);
  expect(fake.exited).toBe(true);
});

test('space and b page, the wheel scrolls three lines, G and g jump to the ends', () => {
  const fake = open();
  const steps: [keys: string, top: string][] = [
    [' ', '- item 10 of the list'],
    ['b', '- item 1 of the list'],
    ['\x1b[<65;1;1M', '- item 4 of the list'],
    ['j', '- item 5 of the list'],
    ['G', '- item 92 of the list'],
    [' ', '- item 92 of the list'],
    ['g', '- item 1 of the list'],
  ];
  for (const [keys, top] of steps) {
    fake.press(keys);
    expect(fake.top, JSON.stringify(keys)).toBe(top);
  }
});

test('a resize re-wraps the document and keeps the same item at the top', () => {
  const fake = open();
  fake.press('     ');
  expect(fake.top).toBe('- item 46 of the list');
  fake.resize(20);
  expect(fake.top).toBe('- item 46 of the');
  expect(fake.lines[1]).toBe('  list');
});

test('search jumps to matches, n and N move between them, and esc clears it before quitting', () => {
  const fake = open();
  fake.press('/item 7');
  expect(fake.footer).toBe('/item 7');
  fake.press('\r');
  expect(fake.top).toBe('- item 7 of the list');
  expect(fake.footer).toMatch(/^items\.md {2}\/item 7/u);
  expect(fake.written).toContain('\x1b[7mitem 7\x1b[27m');

  fake.press('n');
  expect(fake.top).toBe('- item 70 of the list');
  fake.press('N');
  expect(fake.top).toBe('- item 7 of the list');

  fake.press('/nowhere\r');
  expect(fake.footer).toMatch(/^not found: nowhere/u);

  fake.press('\x1b');
  expect(fake.footer).toMatch(/^items\.md +\d/u);
  expect(fake.exited).toBe(false);
  fake.press('\x1b');
  expect(fake.exited).toBe(true);
});

test('keys typed in the same chunk as "/" go to the search prompt', () => {
  const fake = open();
  fake.press('/item 5 of\r');
  expect(fake.top).toBe('- item 5 of the list');
});

test('help replaces the page and ignores other keys until it is closed', () => {
  const fake = open();
  fake.press('?');
  expect(fake.lines.join('\n')).toContain('show or hide this help');
  fake.press('G');
  expect(fake.lines.join('\n')).toContain('show or hide this help');
  fake.press('?');
  expect(fake.top).toBe('- item 1 of the list');
});

test('ctrl+c quits, even from the search prompt', () => {
  const fake = open();
  fake.press('/ite');
  fake.press('\x03');
  expect(fake.exited).toBe(true);
});

test('the footer puts the position flush right and cuts a long name first', () => {
  const wide = footer('notes.md', '9-33/34 (97%)', 60);
  expect(wide.length).toBe(60);
  expect(wide.startsWith('notes.md ')).toBeTruthy();
  expect(wide.endsWith(' 9-33/34 (97%)')).toBeTruthy();

  const narrow = footer('a-very-long-file-name-that-will-not-fit.md', '9-33/34 (97%)', 40);
  expect(narrow.length).toBe(40);
  expect(narrow).toMatch(/^a-very-long-\S*…  9-33\/34 \(97%\)$/u);
});
