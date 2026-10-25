// A laid-out document that only wraps the units it's asked for, caching them for the
// current width. Padding lives here too: blank units above and below, and a left margin.
export class Document {
  constructor(units, { top = 0, bottom = 0, left = 0, right = 0 } = {}) {
    const pad = (n) => ({ blank: false, padding: true, render: () => Array(n).fill(''), estimate: () => n });
    this.units = [...(top > 0 ? [pad(top)] : []), ...units, ...(bottom > 0 ? [pad(bottom)] : [])];
    this.left = left;
    this.right = right;
    this.cols = undefined;
    this.margin = ' '.repeat(left);
  }

  get length() {
    return this.units.length;
  }

  // Returns true when the width changed (and everything laid out so far was dropped).
  setWidth(cols) {
    if (cols === this.cols) return false;
    this.cols = cols;
    this.inner = Math.max(20, cols - this.left - this.right);
    this.cache = new Array(this.units.length);
    this.estimates = new Array(this.units.length);
    this.laidOut = 0;
    return true;
  }

  lines(i) {
    let lines = this.cache[i];
    if (lines === undefined) {
      const unit = this.units[i];
      const body = unit.render(this.inner);
      lines = unit.padding ? body : body.map((line) => (line ? this.margin + line : line));
      if (unit.blank) lines.unshift('');
      this.cache[i] = lines;
      this.laidOut++;
    }
    return lines;
  }

  height(i) {
    return this.lines(i).length;
  }

  isLaidOut(i) {
    return this.cache[i] !== undefined;
  }

  get complete() {
    return this.laidOut === this.units.length;
  }

  // Real height if laid out, otherwise an estimate; never lays anything out.
  approxHeight(i) {
    if (this.cache[i] !== undefined) return this.cache[i].length;
    this.estimates[i] ??= this.units[i].estimate(this.inner) + (this.units[i].blank ? 1 : 0);
    return this.estimates[i];
  }

  approxLinesBefore(i) {
    let n = 0;
    for (let j = 0; j < i; j++) n += this.approxHeight(j);
    return n;
  }

  // Lays out everything; for printing.
  all() {
    return this.units.flatMap((_, i) => this.lines(i));
  }
}
