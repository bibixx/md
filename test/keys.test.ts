import { test, expect } from 'bun:test';
import { parseInput } from '../src/keys.ts';

const wheelDown = '\x1b[<65;10;5M';
const wheelUp = '\x1b[<64;10;5M';

test('several wheel events in one chunk each scroll', () => {
  expect(parseInput(wheelDown + wheelDown + wheelUp)).toEqual([
    { type: 'lines', by: 3 },
    { type: 'lines', by: 3 },
    { type: 'lines', by: -3 },
  ]);
});

test('the wheel still scrolls with shift, alt or ctrl held', () => {
  for (const modifier of [4, 8, 16]) {
    expect(parseInput(`\x1b[<${65 + modifier};1;1M`)).toEqual([{ type: 'lines', by: 3 }]);
  }
});

test('mouse clicks and releases are ignored', () => {
  expect(parseInput('\x1b[<0;10;5M\x1b[<0;10;5m')).toEqual([]);
});

test('an arrow key is not mistaken for escape (quit) plus letters', () => {
  expect(parseInput('\x1b[B\x1b[A')).toEqual([
    { type: 'lines', by: 1 },
    { type: 'lines', by: -1 },
  ]);
});

test('a lone escape is its own key (clears a search, otherwise quits)', () => {
  expect(parseInput('\x1b')).toEqual([{ type: 'escape' }]);
});
