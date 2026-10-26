import { openSync } from 'node:fs';
import tty from 'node:tty';
import chalk from 'chalk';
import { width } from './text.ts';
import { start, down, up, lastScreenTop, screen, position, find } from './viewport.ts';
import { matcher, highlightMatches, plain, editPrompt, type Matcher } from './search.ts';
import type { Document } from './document.ts';
import { parseInput, type Action } from './keys.ts';

const HELP: [keys: string, what: string][] = [
  ['j k ↑ ↓', 'one line'],
  ['wheel', 'three lines'],
  ['d u', 'half a screen'],
  ['space b', 'one screen (also f, Page Up/Down)'],
  ['g G', 'top / bottom (also Home/End)'],
  ['/', 'search (lowercase ignores case)'],
  ['n N', 'next / previous match'],
  ['?', 'show or hide this help'],
  ['esc', 'clear the search, or quit'],
  ['q', 'quit'],
];

export function footer(name: string, where: string, cols: number): string {
  const room = cols - width(where) - 2;
  const left = room <= 0 ? '' : width(name) <= room ? name : name.slice(0, Math.max(0, room - 1)) + '…';
  return left + ' '.repeat(Math.max(1, cols - width(left) - width(where))) + where;
}

const ALT_SCREEN_ON = '\x1b[?1049h';
const ALT_SCREEN_OFF = '\x1b[?1049l';
const CURSOR_HIDDEN = '\x1b[?25l';
const CURSOR_SHOWN = '\x1b[?25h';
// lines are already fitted to the width, so the terminal mustn't wrap them again
const AUTO_WRAP_OFF = '\x1b[?7l';
const AUTO_WRAP_ON = '\x1b[?7h';
// SGR mouse reporting (1000 + 1006), so the scroll wheel reaches the viewer
const MOUSE_REPORTING_ON = '\x1b[?1000h\x1b[?1006h';
const MOUSE_REPORTING_OFF = '\x1b[?1006l\x1b[?1000l';

type AfterKey = 'continue' | 'stop';

const BACKGROUND_SLICE_MS = 8;

function layOutInBackground(doc: Document, onDone: () => void): () => void {
  let cancelled = false;
  let i = 0;
  const step = () => {
    if (cancelled) return;
    const until = performance.now() + BACKGROUND_SLICE_MS;
    for (; i < doc.length && performance.now() < until; i++) doc.lines(i);
    if (i < doc.length) setImmediate(step);
    else onDone();
  };
  setImmediate(step);
  return () => {
    cancelled = true;
  };
}

const helpLines = (): string[] => {
  const keyWidth = Math.max(...HELP.map(([k]) => width(k)));
  return ['', ...HELP.map(([k, what]) => `  ${chalk.bold(k.padEnd(keyWidth))}   ${what}`)];
};

const noop = (): void => {};

export interface KeyInput {
  setRawMode(mode: boolean): unknown;
  resume(): unknown;
  setEncoding(encoding: 'utf8'): unknown;
  on(event: 'data', listener: (chunk: string) => void): unknown;
}

export interface ScreenOutput {
  readonly rows: number;
  readonly columns: number;
  write(text: string): unknown;
  on(event: 'resize', listener: () => void): unknown;
}

export interface Terminal {
  input: KeyInput;
  output: ScreenOutput;
  exit(): void;
}

export function page(doc: Document, name: string, { fixedWidth }: { fixedWidth?: number } = {}): void {
  // keys come from the terminal itself when the document was piped in on stdin
  const input = process.stdin.isTTY ? process.stdin : new tty.ReadStream(openSync('/dev/tty', 'r'));
  const viewer = new Viewer(doc, name, fixedWidth, { input, output: process.stdout, exit: () => process.exit(0) });
  process.on('exit', viewer.restore);
  process.on('SIGTERM', viewer.quit);
  viewer.open();
}

export class Viewer {
  private readonly input: KeyInput;
  private readonly out: ScreenOutput;
  private pos = start();
  private showHelp = false;
  private promptText: string | null = null;
  private activeSearch: Matcher | null = null;
  private footerMessage: string | null = null;
  private cancelBackground = noop;

  constructor(
    private readonly doc: Document,
    private readonly name: string,
    private readonly fixedWidth: number | undefined,
    private readonly terminal: Terminal
  ) {
    this.input = terminal.input;
    this.out = terminal.output;
  }

  open(): void {
    this.out.write(ALT_SCREEN_ON + CURSOR_HIDDEN + AUTO_WRAP_OFF + MOUSE_REPORTING_ON);
    this.input.setRawMode(true);
    this.input.resume();
    this.input.setEncoding('utf8');
    this.out.on('resize', () => {
      this.relayout();
      this.draw();
    });
    this.input.on('data', this.onData);
    this.relayout({ initial: true });
    this.draw();
  }

  private get rows(): number {
    return this.out.rows - 1;
  }

  private relayout({ initial = false } = {}): void {
    const { doc } = this;
    const before = doc.cols === undefined ? 0 : doc.height(this.pos.unit);
    if (!doc.setWidth(this.fixedWidth ?? this.out.columns) && !initial) return;
    const after = doc.height(this.pos.unit);
    const offset = before === 0 ? 0 : Math.min(Math.round((this.pos.offset * after) / before), after - 1);
    this.pos = down(doc, { unit: this.pos.unit, offset }, 0, this.rows);
    this.cancelBackground();
    this.cancelBackground = layOutInBackground(doc, () => {
      this.draw();
    });
  }

  private positionText(): string {
    const { first, last, total, exact } = position(this.doc, this.pos, this.rows);
    const pct = total === 0 ? 100 : Math.round((last / total) * 100);
    return exact ? `${first}-${last}/${total} (${pct}%)` : `~${first}-${last}/~${total} (~${pct}%)`;
  }

  private footerLine(): string {
    if (this.promptText !== null) return '/' + this.promptText + chalk.inverse(' ');
    if (this.showHelp) return chalk.dim(footer(this.name, '? q esc to close', this.out.columns));
    const searching = this.activeSearch ? `${this.name}  /${this.activeSearch.query} · n next · N previous · esc clear` : this.name;
    return chalk.dim(footer(this.footerMessage ?? searching, this.positionText(), this.out.columns));
  }

  private draw(): void {
    const h = this.rows;
    let body = this.showHelp ? helpLines() : screen(this.doc, this.pos, h);
    const active = this.activeSearch;
    if (active && !this.showHelp) body = body.map((line) => highlightMatches(line, active));
    let frame = '\x1b[H';
    for (let i = 0; i < h; i++) frame += (body[i] ?? '') + '\x1b[0m\x1b[K\r\n';
    frame += this.footerLine() + '\x1b[K';
    this.out.write(frame);
  }

  private jumpToMatch(dir: 1 | -1): void {
    const active = this.activeSearch;
    if (!active) return;
    const found = find(this.doc, this.pos, (line) => active.pattern.test(plain(line)), dir);
    if (found) {
      this.pos = down(this.doc, found.pos, 0, this.rows);
      if (found.wrapped) this.footerMessage = dir > 0 ? 'search wrapped to the top' : 'search wrapped to the bottom';
    } else this.footerMessage = `not found: ${active.query}`;
    this.draw();
  }

  private onPromptInput(chunk: string): void {
    const { text, done } = editPrompt(this.promptText ?? '', chunk);
    if (done === 'exit') {
      this.quit();
      return;
    }
    this.promptText = done === null ? text : null;
    if (done === 'submit' && text !== '') {
      this.activeSearch = matcher(text);
      this.jumpToMatch(1);
      return;
    }
    this.draw();
  }

  private scroll(delta: number): void {
    const { doc, pos, rows } = this;
    if (delta === -Infinity) this.pos = start();
    else if (delta === Infinity) this.pos = lastScreenTop(doc, rows);
    else this.pos = delta > 0 ? down(doc, pos, delta, rows) : up(doc, pos, -delta);
    this.draw();
  }

  readonly restore = (): void => {
    this.out.write(MOUSE_REPORTING_OFF + AUTO_WRAP_ON + CURSOR_SHOWN + ALT_SCREEN_OFF);
  };

  readonly quit = (): void => {
    this.cancelBackground();
    this.restore();
    this.input.setRawMode(false);
    this.terminal.exit();
  };

  private readonly onData = (chunk: string): void => {
    if (this.promptText !== null) {
      this.onPromptInput(chunk);
      return;
    }
    for (const action of parseInput(chunk)) if (this.handle(action, chunk) === 'stop') return;
  };

  private closeHelpOnKey(action: Action): AfterKey {
    if (action.type === 'help' || action.type === 'quit' || action.type === 'escape') {
      this.showHelp = false;
      this.draw();
    }
    return 'continue';
  }

  private handle(action: Action, chunk: string): AfterKey {
    if (action.type === 'exit') {
      this.quit();
      return 'stop';
    }
    this.footerMessage = null;
    if (this.showHelp) return this.closeHelpOnKey(action);
    switch (action.type) {
      case 'help':
        this.showHelp = true;
        this.draw();
        return 'continue';
      case 'search': {
        this.promptText = '';
        this.draw();
        const typedAfterSlash = chunk.slice(chunk.indexOf('/') + 1);
        if (typedAfterSlash !== '') this.onPromptInput(typedAfterSlash);
        return 'stop';
      }
      case 'next':
        this.jumpToMatch(action.dir);
        return 'continue';
      case 'escape':
        if (!this.activeSearch) {
          this.quit();
          return 'stop';
        }
        this.activeSearch = null;
        this.draw();
        return 'continue';
      case 'quit':
        this.quit();
        return 'stop';
      case 'lines':
        this.scroll(action.by);
        return 'continue';
      case 'pages':
        this.scroll(Math.trunc(action.by * this.rows));
        return 'continue';
      case 'edge':
        this.scroll(action.to === 'top' ? -Infinity : Infinity);
        return 'continue';
    }
    const unhandled: never = action;
    return unhandled;
  }
}
