const WHEEL_LINES = 3;
const SHIFT_ALT_CTRL_BITS = 0b11100;

export type Action =
  | { type: 'quit' }
  | { type: 'escape' }
  | { type: 'exit' }
  | { type: 'help' }
  | { type: 'search' }
  | { type: 'next'; dir: 1 | -1 }
  | { type: 'lines'; by: number }
  | { type: 'pages'; by: number }
  | { type: 'edge'; to: 'top' | 'bottom' };

const KEYS: Record<string, Action> = {
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

// Terminals send several keys or wheel events in one chunk, especially when scrolling fast.
export function parseInput(chunk: string): Action[] {
  const actions: Action[] = [];
  for (const [key] of chunk.matchAll(/\x1b\[<\d+;\d+;\d+[Mm]|\x1b\[[\d;]*[A-Za-z~]|\x1b|[^]/gu)) {
    const mouse = /^\x1b\[<(\d+);\d+;\d+M$/u.exec(key);
    if (mouse) {
      const button = Number(mouse[1]) & ~SHIFT_ALT_CTRL_BITS;
      if (button === 64) actions.push({ type: 'lines', by: -WHEEL_LINES });
      if (button === 65) actions.push({ type: 'lines', by: WHEEL_LINES });
    } else {
      const action = KEYS[key];
      if (action) actions.push(action);
    }
  }
  return actions;
}
