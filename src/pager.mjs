// Full-screen viewer: alternate screen, lays out only what's on screen, re-wraps on resize.
import fs from 'node:fs';
import tty from 'node:tty';
import chalk from 'chalk';
import { width } from './text.mjs';
import { start, down, up, lastTop, screen, position, find } from './viewport.mjs';
import { matcher, highlight, plain, editPrompt } from './search.mjs';

const HELP = [
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

// The name on the left, the position flush right; the name is cut when narrow
export function footer(name, position, cols) {
  const room = cols - width(position) - 2;
  const left = room <= 0 ? '' : width(name) <= room ? name : name.slice(0, Math.max(0, room - 1)) + '…';
  return left + ' '.repeat(Math.max(1, cols - width(left) - width(position))) + position;
}

// Fills in the rest of the layout a few milliseconds at a time between keypresses, so the
// footer's line numbers become exact without ever blocking the viewer.
function layOutInBackground(doc, onDone) {
  let cancelled = false;
  let i = 0;
  const step = () => {
    if (cancelled) return;
    const until = performance.now() + 8;
    for (; i < doc.length && performance.now() < until; i++) doc.lines(i);
    if (i < doc.length) setImmediate(step);
    else onDone();
  };
  setImmediate(step);
  return () => (cancelled = true);
}

export function page(doc, name, { fixedWidth } = {}) {
  const input = process.stdin.isTTY ? process.stdin : new tty.ReadStream(fs.openSync('/dev/tty', 'r'));
  const out = process.stdout;
  let pos = start();
  let showHelp = false;
  let prompt = null; // text typed after "/" while the search prompt is open
  let search = null; // the active search, highlighted on screen
  let message = null; // shown in the footer until the next key
  let cancelBackground = () => {};

  const rows = () => out.rows - 1;

  // re-wrap for a new width, keeping the same unit at the top of the screen
  const relayout = ({ initial = false } = {}) => {
    const before = doc.cols === undefined ? 0 : doc.height(pos.unit);
    if (!doc.setWidth(fixedWidth ?? out.columns) && !initial) return;
    const after = doc.height(pos.unit);
    pos = { unit: pos.unit, offset: before ? Math.min(Math.round((pos.offset * after) / before), after - 1) : 0 };
    pos = down(doc, pos, 0, rows());
    cancelBackground();
    cancelBackground = layOutInBackground(doc, draw);
  };

  const helpLines = () => {
    const keyWidth = Math.max(...HELP.map(([k]) => width(k)));
    return ['', ...HELP.map(([k, what]) => `  ${chalk.bold(k.padEnd(keyWidth))}   ${what}`)];
  };

  const positionText = () => {
    const { first, last, total, exact } = position(doc, pos, rows());
    const pct = total ? Math.round((last / total) * 100) : 100;
    return exact ? `${first}-${last}/${total} (${pct}%)` : `~${first}-${last}/~${total} (~${pct}%)`;
  };

  const footerLine = () => {
    if (prompt !== null) return '/' + prompt + chalk.inverse(' ');
    if (showHelp) return chalk.dim(footer(name, '? q esc to close', out.columns));
    const left = message ?? (search ? `${name}  /${search.query} · n next · N previous · esc clear` : name);
    return chalk.dim(footer(left, positionText(), out.columns));
  };

  const draw = () => {
    const h = rows();
    let body = showHelp ? helpLines() : screen(doc, pos, h);
    if (search && !showHelp) body = body.map((line) => highlight(line, search));
    let frame = '\x1b[H';
    for (let i = 0; i < h; i++) frame += (body[i] ?? '') + '\x1b[0m\x1b[K\r\n';
    frame += footerLine() + '\x1b[K';
    out.write(frame);
  };

  // jump to the next/previous line with a match, putting it at the top of the screen
  const jump = (dir) => {
    if (!search) return;
    const found = find(doc, pos, (line) => search.test.test(plain(line)), dir);
    if (!found) message = `not found: ${search.query}`;
    else {
      pos = down(doc, found.pos, 0, rows());
      if (found.wrapped) message = dir > 0 ? 'search wrapped to the top' : 'search wrapped to the bottom';
    }
    draw();
  };

  const onPromptInput = (chunk) => {
    const { text, done } = editPrompt(prompt, chunk);
    if (done === 'exit') return quit();
    prompt = done ? null : text;
    if (done === 'submit' && text) {
      search = matcher(text);
      return jump(1);
    }
    draw();
  };

  const scroll = (delta) => {
    if (delta === -Infinity) pos = start();
    else if (delta === Infinity) pos = lastTop(doc, rows());
    else pos = delta > 0 ? down(doc, pos, delta, rows()) : up(doc, pos, -delta);
    draw();
  };

  const restore = () => out.write('\x1b[?1006l\x1b[?1000l\x1b[?7h\x1b[?25h\x1b[?1049l');
  const quit = () => {
    cancelBackground();
    restore();
    input.setRawMode(false);
    process.exit(0);
  };

  // alternate screen, hide cursor, no auto-wrap (lines are already fitted to the width),
  // and SGR mouse reporting so the scroll wheel reaches us
  out.write('\x1b[?1049h\x1b[?25l\x1b[?7l\x1b[?1000h\x1b[?1006h');
  input.setRawMode(true);
  input.resume();
  input.setEncoding('utf8');
  process.on('exit', restore);
  process.on('SIGTERM', quit);

  out.on('resize', () => {
    relayout();
    draw();
  });

  input.on('data', (chunk) => {
    if (prompt !== null) return onPromptInput(chunk);
    for (const action of parseInput(chunk)) {
      if (action.type === 'exit') return quit();
      message = null;
      if (showHelp) {
        // while help is open, only the keys that close it do anything
        if (['help', 'quit', 'escape'].includes(action.type)) (showHelp = false), draw();
        continue;
      }
      if (action.type === 'help') {
        showHelp = true;
        draw();
        continue;
      }
      if (action.type === 'search') {
        prompt = '';
        draw();
        // anything typed in the same chunk after "/" belongs to the prompt
        const rest = chunk.slice(chunk.indexOf('/') + 1);
        return rest ? onPromptInput(rest) : undefined;
      }
      if (action.type === 'next') {
        jump(action.dir);
        continue;
      }
      if (action.type === 'escape') {
        if (!search) return quit();
        search = null;
        draw();
        continue;
      }
      if (action.type === 'quit') return quit();
      const p = rows();
      if (action.type === 'lines') scroll(action.by);
      else if (action.type === 'pages') scroll(Math.trunc(action.by * p));
      else if (action.type === 'edge') scroll(action.to === 'top' ? -Infinity : Infinity);
    }
  });

  relayout({ initial: true });
  draw();
}

const WHEEL_LINES = 3;

const KEYS = {
  q: { type: 'quit' }, '\x1b': { type: 'escape' }, '\x03': { type: 'exit' }, '?': { type: 'help' },
  '/': { type: 'search' }, n: { type: 'next', dir: 1 }, N: { type: 'next', dir: -1 },
  j: { type: 'lines', by: 1 }, '\x1b[B': { type: 'lines', by: 1 }, '\r': { type: 'lines', by: 1 },
  k: { type: 'lines', by: -1 }, '\x1b[A': { type: 'lines', by: -1 },
  ' ': { type: 'pages', by: 1 }, f: { type: 'pages', by: 1 }, '\x1b[6~': { type: 'pages', by: 1 },
  b: { type: 'pages', by: -1 }, '\x1b[5~': { type: 'pages', by: -1 },
  d: { type: 'pages', by: 0.5 }, u: { type: 'pages', by: -0.5 },
  g: { type: 'edge', to: 'top' }, '\x1b[H': { type: 'edge', to: 'top' },
  G: { type: 'edge', to: 'bottom' }, '\x1b[F': { type: 'edge', to: 'bottom' },
};

// One chunk of terminal input can hold several keys or wheel events, especially when
// scrolling fast, so split it into escape sequences and single characters first.
export function parseInput(chunk) {
  const actions = [];
  for (const [key] of chunk.matchAll(/\x1b\[<\d+;\d+;\d+[Mm]|\x1b\[[\d;]*[A-Za-z~]|\x1b|[^]/g)) {
    const mouse = /^\x1b\[<(\d+);\d+;\d+M$/.exec(key);
    if (mouse) {
      const button = Number(mouse[1]) & ~0b11100; // drop the shift/alt/ctrl bits
      if (button === 64) actions.push({ type: 'lines', by: -WHEEL_LINES });
      if (button === 65) actions.push({ type: 'lines', by: WHEEL_LINES });
    } else if (KEYS[key]) actions.push(KEYS[key]);
  }
  return actions;
}
