import type { Padding, Unit } from './types.ts';

const pagePadding = (n: number): Unit => ({ blankLineAbove: false, isPagePadding: true, render: () => Array.from({ length: n }, () => ''), estimate: () => n });

export class Document {
  readonly units: Unit[];
  readonly left: number;
  readonly right: number;
  readonly margin: string;
  cols: number | undefined = undefined;
  innerWidth = 0;
  laidOut = 0;
  private cache: (string[] | undefined)[] = [];
  private estimates: (number | undefined)[] = [];

  constructor(units: Unit[], { top = 0, bottom = 0, left = 0, right = 0 }: Partial<Padding> = {}) {
    this.units = [...(top > 0 ? [pagePadding(top)] : []), ...units, ...(bottom > 0 ? [pagePadding(bottom)] : [])];
    this.left = left;
    this.right = right;
    this.margin = ' '.repeat(left);
  }

  get length(): number {
    return this.units.length;
  }

  /** Returns whether the width changed, which drops everything laid out so far. */
  setWidth(cols: number): boolean {
    if (cols === this.cols) return false;
    this.cols = cols;
    this.innerWidth = Math.max(20, cols - this.left - this.right);
    this.cache = [];
    this.estimates = [];
    this.laidOut = 0;
    return true;
  }

  lines(i: number): string[] {
    let lines = this.cache[i];
    if (lines === undefined) {
      const unit = this.unit(i);
      const body = unit.render(this.innerWidth);
      lines = unit.isPagePadding === true ? body : body.map((line) => (line ? this.margin + line : line));
      if (unit.blankLineAbove) lines.unshift('');
      this.cache[i] = lines;
      this.laidOut++;
    }
    return lines;
  }

  height(i: number): number {
    return this.lines(i).length;
  }

  isLaidOut(i: number): boolean {
    return this.cache[i] !== undefined;
  }

  get complete(): boolean {
    return this.laidOut === this.units.length;
  }

  /** Never lays anything out: the real height if it's cached, otherwise the unit's estimate. */
  approxHeight(i: number): number {
    const lines = this.cache[i];
    if (lines !== undefined) return lines.length;
    const unit = this.unit(i);
    return (this.estimates[i] ??= unit.estimate(this.innerWidth) + (unit.blankLineAbove ? 1 : 0));
  }

  approxLinesBefore(i: number): number {
    let n = 0;
    for (let j = 0; j < i; j++) n += this.approxHeight(j);
    return n;
  }

  allLines(): string[] {
    return this.units.flatMap((_, i) => this.lines(i));
  }

  private unit(i: number): Unit {
    const unit = this.units[i];
    if (!unit) throw new RangeError(`no unit ${i} (the document has ${this.units.length})`);
    return unit;
  }
}
