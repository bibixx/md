import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseInput } from '../src/pager.mjs';

const wheelDown = '\x1b[<65;10;5M';
const wheelUp = '\x1b[<64;10;5M';

test('several wheel events in one chunk each scroll', () => {
  assert.deepEqual(parseInput(wheelDown + wheelDown + wheelUp), [
    { type: 'lines', by: 3 },
    { type: 'lines', by: 3 },
    { type: 'lines', by: -3 },
  ]);
});

test('the wheel still scrolls with shift, alt or ctrl held', () => {
  for (const modifier of [4, 8, 16]) {
    assert.deepEqual(parseInput(`\x1b[<${65 + modifier};1;1M`), [{ type: 'lines', by: 3 }]);
  }
});

test('mouse clicks and releases are ignored', () => {
  assert.deepEqual(parseInput('\x1b[<0;10;5M\x1b[<0;10;5m'), []);
});

test('an arrow key is not mistaken for escape (quit) plus letters', () => {
  assert.deepEqual(parseInput('\x1b[B\x1b[A'), [
    { type: 'lines', by: 1 },
    { type: 'lines', by: -1 },
  ]);
});

test('a lone escape is its own key (clears a search, otherwise quits)', () => {
  assert.deepEqual(parseInput('\x1b'), [{ type: 'escape' }]);
});

test('the footer puts the position flush right and cuts a long name first', async () => {
  const { footer } = await import('../src/pager.mjs');
  const wide = footer('notes.md', '9-33/34 (97%)', 60);
  assert.equal(wide.length, 60);
  assert.ok(wide.startsWith('notes.md '));
  assert.ok(wide.endsWith(' 9-33/34 (97%)'));

  const narrow = footer('a-very-long-file-name-that-will-not-fit.md', '9-33/34 (97%)', 40);
  assert.equal(narrow.length, 40);
  assert.match(narrow, /^a-very-long-\S*…  9-33\/34 \(97%\)$/);
});

test('? toggles help and ctrl+c is a hard exit', () => {
  assert.deepEqual(parseInput('?\x03'), [{ type: 'help' }, { type: 'exit' }]);
});
