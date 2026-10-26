import chalk from 'chalk';
import type { MarkedToken, Token, Tokens } from 'marked';
import { NL, RULE_PLACEHOLDER, width, strip, pad, expandTabs } from './text.ts';
import type { RenderContext } from './types.ts';

const QUOTE_BAR = '▎';
const MAX_LIST_INDENT = 32;
const BLOCK_TYPES = new Set(['code', 'blockquote', 'hr', 'table', 'list']);

function letters(n: number): string {
  let s = '';
  while (n > 0) {
    n--;
    s = String.fromCodePoint(97 + (n % 26)) + s;
    n = Math.floor(n / 26);
  }
  return s;
}

const ROMAN: [number, string][] = [[1000, 'm'], [900, 'cm'], [500, 'd'], [400, 'cd'], [100, 'c'], [90, 'xc'], [50, 'l'], [40, 'xl'], [10, 'x'], [9, 'ix'], [5, 'v'], [4, 'iv'], [1, 'i']];
function roman(n: number): string {
  let s = '';
  for (const [v, r] of ROMAN) {
    while (n >= v) {
      s += r;
      n -= v;
    }
  }
  return s;
}

export interface ListBounds {
  first: number;
  last: number;
}

export function listBounds(list: Tokens.List): ListBounds {
  const first = list.start === '' ? 1 : list.start;
  return { first, last: first + list.items.length - 1 };
}

export function listMarker(depth: number, ordered: ({ number: number } & ListBounds) | null): string {
  if (ordered === null) return '-';
  const { number, first, last } = ordered;
  switch (depth + 1) {
    case 2: return `${first >= 1 ? letters(number) : number}.`;
    case 3: return `${first >= 1 && last <= 3999 ? roman(number) : number}.`;
    default: return `${number}.`;
  }
}

// A "1." wrapped onto the start of a line would read as a new list item.
const glueListNumbers = (s: string): string => s.replaceAll(/ (\d{1,9}[.)])(?!\w)/gu, ' $1');

function quote(tokens: Token[], depth: number, draw: (token: Token, depth: number) => string): string {
  let rows = '';
  for (const t of tokens) {
    const r = t.type === 'blockquote' ? quote(t.tokens ?? [], depth + 1, draw) : draw(t, depth + 1);
    rows += r === '' || r.endsWith(NL) ? r : r + NL;
  }
  const bar = chalk.dim(QUOTE_BAR);
  return rows
    .split(NL)
    .map((line) => (strip(line).trim() === '' ? line : `${bar} ${chalk.italic(line)}`))
    .join(NL);
}

const sameUrl = (href: string, label: string) => label === href || href === `http://${label}` || href === `https://${label}`;

function hyperlink(href: string, label: string | undefined, ctx: RenderContext): string {
  const shown = label === undefined ? undefined : strip(label);
  const same = shown === undefined || sameUrl(href, shown);
  if (!ctx.hyperlinks) return label === undefined || same ? href : `${label} (${href})`;
  return `\x1b]8;;${href}\x07${ctx.theme.link(label ?? href)}\x1b]8;;\x07`;
}

export const topLevel = (ctx: RenderContext): RenderContext => ({ ...ctx, listDepth: 0, orderedListNumber: null, parent: null, inListItemText: false });

export function inline(tokens: Token[] | undefined, ctx: RenderContext, extra: Partial<RenderContext> = {}): string {
  return (tokens ?? []).map((t) => render(t, { ...ctx, listDepth: 0, orderedListNumber: null, ...extra })).join('');
}

// marked's Token type also allows extension tokens of any `type`, which stops `switch (t.type)`
// from narrowing. md uses no extensions.
const BUILTIN_TYPES = new Set<string>(['blockquote', 'br', 'code', 'codespan', 'def', 'del', 'em', 'escape', 'heading', 'hr', 'html', 'image', 'link', 'list', 'list_item', 'paragraph', 'space', 'strong', 'table', 'text']);

export const isMarkedToken = (t: Token): t is MarkedToken => BUILTIN_TYPES.has(t.type);

const nonEmpty = (s: string | null | undefined): s is string => s !== null && s !== undefined && s !== '';

export function render(token: Token, ctx: RenderContext): string {
  if (!isMarkedToken(token)) return token.raw;
  const { theme, highlight, listDepth = 0, orderedListNumber = null, parent = null, inListItemText = false, listIndent = '' } = ctx;
  const t = token;

  switch (t.type) {
    case 'blockquote':
      return quote(t.tokens, ctx.quotesAround ?? 0, (child, around) =>
        render(child, { ...ctx, listDepth: 0, orderedListNumber: null, parent: null, inListItemText: false, quotesAround: around })
      );

    case 'code': {
      const lang = t.lang ?? '';
      const text = expandTabs(t.text, ctx.tabWidth);
      if (lang === '' && t.codeBlockStyle !== 'indented') return text.replaceAll(/\S(?:.*\S)?/gu, theme.permission) + NL;
      const base = /^[\w.+#-]+/u.exec(lang)?.[0] ?? '';
      const supported = (l: string) => l !== '' && highlight?.supportsLanguage(l) === true;
      const language = supported(lang) ? lang : supported(base) ? base : 'plaintext';
      const label = lang !== '' && !supported(lang) ? chalk.dim(lang) + NL : '';
      if (!highlight) return label + text + NL;
      return label + highlight.highlight(text, { language }) + NL;
    }

    case 'codespan':
      return theme.permission(t.text);

    case 'em':
      return chalk.italic(inline(t.tokens, ctx, { parent, inListItemText }));

    case 'strong':
      return chalk.bold(inline(t.tokens, ctx, { parent, inListItemText }));

    case 'del': {
      const s = inline(t.tokens, ctx, { parent, inListItemText });
      return chalk.level > 0 ? chalk.strikethrough(s) : `~~${s}~~`;
    }

    case 'heading': {
      const style = t.depth === 1 ? chalk.bold.italic.underline : chalk.bold;
      return style(inline(t.tokens, ctx, { parent: null })) + NL + NL;
    }

    case 'hr':
      // Claude Code prints a literal "---".
      return RULE_PLACEHOLDER + NL;

    case 'image': {
      if (t.text === '' && !nonEmpty(t.title)) return t.href;
      const title = nonEmpty(t.title) ? ` "${t.title}"` : '';
      return t.text === '' ? `(${t.href}${title})` : `${t.text} (${t.href}${title})`;
    }

    case 'link': {
      const title = nonEmpty(t.title) ? ` ("${t.title}")` : '';
      if (/^mailto:/iu.test(t.href)) {
        const address = t.href.replace(/^mailto:/iu, '');
        return (t.text !== '' && t.text !== address ? `${t.text} (${address})` : address) + title;
      }
      const label = inline(t.tokens, ctx, { parent: t });
      const hasLabel = strip(label) !== '' && strip(label) !== t.href;
      return hyperlink(t.href, hasLabel ? label : undefined, ctx) + title;
    }

    case 'list':
      return t.items
        .map((item, i) =>
          render(item, {
            ...ctx,
            listDepth,
            orderedListNumber: t.ordered ? listBounds(t).first + i : null,
            parent: t,
            inListItemText: false,
            listIndent,
          })
        )
        .join('');

    case 'list_item':
      return renderListItem(t, ctx);

    case 'paragraph':
      return inline(t.tokens, ctx, { parent: null }) + NL;

    case 'space':
    case 'br':
      return NL;

    case 'text': {
      // Claude Code keeps single newlines; as spaces, hard-wrapped files reflow to the width.
      const soft = t.tokens ? t.text : t.text.replaceAll(/[ \t]*\n[ \t]*/gu, ' ');
      if (parent?.type === 'link') return soft;
      const text = t.escaped === false ? soft.replaceAll(/&(?:nbsp|#0{0,4}160|#[xX]0{0,4}[aA]0);/gu, ' ') : soft;
      if (parent?.type === 'list_item') {
        const body = t.tokens ? inline(t.tokens, ctx, { listDepth, orderedListNumber, parent: t, inListItemText: true }) : glueListNumbers(text);
        const task = parent.task && parent.tokens[0] === t ? `[${parent.checked === true ? 'x' : ' '}] ` : '';
        return `${task}${body}${NL}`;
      }
      return inListItemText ? glueListNumbers(text) : text;
    }

    case 'table':
      return pipeTable(t, ctx) + NL;

    case 'escape':
      return t.text;

    case 'html':
      // Claude Code prints HTML comments like any other HTML.
      return t.text.replaceAll(/<!--[^]*?-->/gu, (comment) => chalk.gray(comment));

    case 'def':
      return '';
  }
  const unhandled: never = t;
  return unhandled;
}

function renderListItem(t: Tokens.ListItem, ctx: RenderContext): string {
  const { listDepth = 0, orderedListNumber = null, parent = null, listIndent = '' } = ctx;
  const marker = listMarker(
    listDepth,
    orderedListNumber !== null && parent?.type === 'list' ? { number: orderedListNumber, ...listBounds(parent) } : null
  );
  const hang = listIndent + ' '.repeat(width(marker) + 1);
  const childIndent = ' '.repeat(Math.min(hang.length, MAX_LIST_INDENT));
  const tokens = t.tokens.filter((x) => x.type !== 'checkbox');
  const start = tokens.findIndex((x) => x.type !== 'space');
  const body = start === -1 ? [] : tokens.slice(start);
  const opensWithBlock = body[0] !== undefined && BLOCK_TYPES.has(body[0].type);
  let needsMarker = !opensWithBlock;

  const out = body
    .map((x) => {
      const s = render(x, { ...ctx, listDepth: listDepth + 1, orderedListNumber, parent: t, inListItemText: false, listIndent: childIndent });
      if (x.type === 'code' && s === NL) return '';
      if (BLOCK_TYPES.has(x.type) || x.type === 'space')
        return x.type === 'blockquote' || x.type === 'hr' || x.type === 'table' ? s.replace(/^\n+/u, '') : s;
      const first = needsMarker ? `${listIndent}${marker} ` : hang;
      needsMarker = false;
      const lines = s
        .split(NL)
        .map((line, i) => (i === 0 ? first + line : line === '' ? line : hang + line))
        .join(NL);
      return x.type === 'html' && !lines.endsWith(NL) ? lines + NL : lines;
    })
    .join('');
  return needsMarker || opensWithBlock ? `${listIndent}${marker}${NL}${out}` : out;
}

// Only reached for tables inside quotes; layout.ts draws every other table as a box.
function pipeTable(t: Tokens.Table, ctx: RenderContext): string {
  const cell = (tokens: Token[] | undefined) => inline(tokens, ctx, { parent: null });
  const widths = t.header.map((h, i) =>
    Math.max(3, width(strip(cell(h.tokens))), ...t.rows.map((r) => width(strip(cell(r[i]?.tokens)))))
  );
  const row = (cells: Tokens.TableCell[]) =>
    ('| ' + cells.map((c, i) => pad(cell(c.tokens), width(strip(cell(c.tokens))), widths[i] ?? 3, t.align[i]) + ' | ').join('')).trimEnd();
  const out = [row(t.header), '|' + widths.map((w) => '-'.repeat(w + 2) + '|').join(''), ...t.rows.map(row)];
  return out.join(NL) + NL;
}
