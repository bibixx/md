import type { Document } from './document.ts';
import type { Position } from './types.ts';

export const start = (): Position => ({ unit: 0, offset: 0 });

const isBefore = (a: Position, b: Position) => a.unit < b.unit || (a.unit === b.unit && a.offset < b.offset);

export function lastScreenTop(doc: Document, rows: number): Position {
  let need = rows;
  for (let i = doc.length - 1; i >= 0; i--) {
    const h = doc.height(i);
    if (h >= need) return { unit: i, offset: h - need };
    need -= h;
  }
  return start();
}

export function down(doc: Document, pos: Position, n: number, rows: number): Position {
  const max = lastScreenTop(doc, rows);
  let { unit, offset } = pos;
  while (n > 0 && unit < doc.length) {
    const linesBelowTop = doc.height(unit) - offset - 1;
    if (n <= linesBelowTop) {
      offset += n;
      n = 0;
    } else {
      n -= linesBelowTop + 1;
      unit++;
      offset = 0;
    }
  }
  const moved = { unit, offset };
  return unit >= doc.length || isBefore(max, moved) ? max : moved;
}

export function up(doc: Document, pos: Position, n: number): Position {
  let { unit, offset } = pos;
  while (n > 0) {
    if (n <= offset) {
      offset -= n;
      n = 0;
    } else if (unit === 0) {
      offset = 0;
      n = 0;
    } else {
      n -= offset + 1;
      unit--;
      offset = doc.height(unit) - 1;
    }
  }
  return { unit, offset };
}

export function screen(doc: Document, pos: Position, rows: number): string[] {
  const out: string[] = [];
  for (let i = pos.unit, offset = pos.offset; out.length < rows && i < doc.length; i++, offset = 0) {
    out.push(...doc.lines(i).slice(offset, offset + rows - out.length));
  }
  return out;
}

/** The nearest line after (1) or before (-1) the top line that passes `test`, wrapping around once. */
export function find(doc: Document, pos: Position, test: (line: string) => boolean, dir: 1 | -1): { pos: Position; wrapped: boolean } | null {
  let { unit, offset } = pos;
  let wrapped = false;
  for (;;) {
    offset += dir;
    if (dir > 0 && offset >= doc.height(unit)) {
      unit++;
      offset = 0;
      if (unit >= doc.length) {
        unit = 0;
        wrapped = true;
      }
    } else if (dir < 0 && offset < 0) {
      unit--;
      if (unit < 0) {
        unit = doc.length - 1;
        wrapped = true;
      }
      offset = doc.height(unit) - 1;
    }
    const line = doc.lines(unit)[offset];
    if (line !== undefined && test(line)) return { pos: { unit, offset }, wrapped };
    if (unit === pos.unit && offset === pos.offset) return null;
  }
}

export function position(doc: Document, pos: Position, rows: number): { first: number; last: number; total: number; exact: boolean } {
  let total = 0;
  for (let i = 0; i < doc.length; i++) total += doc.approxHeight(i);
  const first = doc.approxLinesBefore(pos.unit) + pos.offset + 1;
  const last = Math.min(first + rows - 1, total);
  return { first, last, total, exact: doc.complete };
}
