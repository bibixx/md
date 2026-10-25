// Scrolling over a Document by position { unit, offset }: the screen's top line is line
// `offset` of unit `unit`. Each move lays out only the units it passes over.

export const start = () => ({ unit: 0, offset: 0 });

const isBefore = (a, b) => a.unit < b.unit || (a.unit === b.unit && a.offset < b.offset);

// The top position that shows the last screenful, so scrolling stops there.
export function lastTop(doc, rows) {
  let need = rows;
  for (let i = doc.length - 1; i >= 0; i--) {
    const h = doc.height(i);
    if (h >= need) return { unit: i, offset: h - need };
    need -= h;
  }
  return start();
}

export function down(doc, pos, n, rows) {
  const max = lastTop(doc, rows);
  let { unit, offset } = pos;
  while (n > 0 && unit < doc.length) {
    const below = doc.height(unit) - offset - 1; // lines of this unit under the top line
    if (n <= below) {
      offset += n;
      n = 0;
    } else {
      n -= below + 1;
      unit++;
      offset = 0;
    }
  }
  const moved = { unit, offset };
  return unit >= doc.length || isBefore(max, moved) ? max : moved;
}

export function up(doc, pos, n) {
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

export function screen(doc, pos, rows) {
  const out = [];
  for (let i = pos.unit, offset = pos.offset; out.length < rows && i < doc.length; i++, offset = 0) {
    out.push(...doc.lines(i).slice(offset, offset + rows - out.length));
  }
  return out;
}

// The next line after (dir 1) or before (dir -1) the top line for which `test(line)` is true,
// wrapping around the document once. Returns { pos, wrapped } with that line on top, or null.
export function find(doc, pos, test, dir) {
  let { unit, offset } = pos;
  let wrapped = false;
  for (;;) {
    offset += dir;
    if (dir > 0 && offset >= doc.height(unit)) {
      unit++;
      offset = 0;
      if (unit >= doc.length) (unit = 0), (wrapped = true);
    } else if (dir < 0 && offset < 0) {
      unit--;
      if (unit < 0) (unit = doc.length - 1), (wrapped = true);
      offset = doc.height(unit) - 1;
    }
    const line = doc.lines(unit)[offset]; // undefined only for an empty unit
    if (line !== undefined && test(line)) return { pos: { unit, offset }, wrapped };
    if (unit === pos.unit && offset === pos.offset) return null; // back where we started
  }
}

// Line numbers for the footer; approximate until the whole document has been laid out.
export function position(doc, pos, rows) {
  let total = 0;
  for (let i = 0; i < doc.length; i++) total += doc.approxHeight(i);
  const first = doc.approxLinesBefore(pos.unit) + pos.offset + 1;
  const last = Math.min(first + rows - 1, total);
  return { first, last, total, exact: doc.complete };
}
