// Renders a marked token to an ANSI string, mirroring Claude Code's string renderer.
// Block tokens end with their own newlines; the layout module turns the string into wrapped lines.
import chalk from 'chalk';
import { NL, RULE, width, strip, pad, expandTabs } from './text.mjs';

const QUOTE_BAR = '▎'; // ▎
const MAX_LIST_INDENT = 32;
const BLOCK_TYPES = new Set(['code', 'blockquote', 'hr', 'table', 'list']);

// ---------- list markers: "-" for bullets; 1. → a. → i. → 1. for nesting ----------

function letters(n) {
  let s = '';
  while (n > 0) n--, (s = String.fromCharCode(97 + (n % 26)) + s), (n = Math.floor(n / 26));
  return s;
}

const ROMAN = [[1000, 'm'], [900, 'cm'], [500, 'd'], [400, 'cd'], [100, 'c'], [90, 'xc'], [50, 'l'], [40, 'xl'], [10, 'x'], [9, 'ix'], [5, 'v'], [4, 'iv'], [1, 'i']];
function roman(n) {
  let s = '';
  for (const [v, r] of ROMAN) while (n >= v) (s += r), (n -= v);
  return s;
}

export function listBounds(list) {
  const first = list.start === '' ? 1 : list.start;
  return { first, last: first + list.items.length - 1 };
}

export function listMarker(depth, ordered) {
  if (ordered === null) return '-';
  const { number, first, last } = ordered;
  switch (depth + 1) {
    case 2: return `${first >= 1 ? letters(number) : number}.`;
    case 3: return `${first >= 1 && last <= 3999 ? roman(number) : number}.`;
    default: return `${number}.`;
  }
}

// Keep "1." from being wrapped onto the start of a line, where it would read as a new list item
const glue = (s) => s.replace(/ (\d{1,9}[.)])(?!\w)/g, ' $1');

// ---------- blockquote ----------

function quote(tokens, depth, draw) {
  let rows = '';
  for (const t of tokens) {
    const r = t.type === 'blockquote' ? quote(t.tokens ?? [], depth + 1, draw) : draw(t, depth + 1);
    rows += r === '' || r.endsWith(NL) ? r : r + NL;
  }
  const bar = chalk.dim(QUOTE_BAR);
  return rows
    .split(NL)
    .map((line) => (strip(line).trim() !== '' ? `${bar} ${chalk.italic(line)}` : line))
    .join(NL);
}

// ---------- links ----------

const sameUrl = (href, label) => label === href || href === `http://${label}` || href === `https://${label}`;

function hyperlink(href, label, ctx) {
  const shown = label === undefined ? undefined : strip(label);
  const same = shown === undefined || sameUrl(href, shown);
  if (!ctx.hyperlinks) return label !== undefined && !same ? `${label} (${href})` : href;
  return `\x1b]8;;${href}\x07${ctx.theme.link(label ?? href)}\x1b]8;;\x07`;
}

// ---------- tokens ----------

export function inline(tokens, ctx, extra = {}) {
  return (tokens ?? []).map((t) => render(t, { ...ctx, listDepth: 0, orderedListNumber: null, ...extra })).join('');
}

export function render(token, ctx) {
  const { theme, highlight, listDepth = 0, orderedListNumber = null, parent = null, glueProse = false, listIndent = '' } = ctx;
  const t = token;

  switch (t.type) {
    case 'blockquote':
      return quote(t.tokens ?? [], ctx.quotesAround ?? 0, (child, around) =>
        render(child, { ...ctx, listDepth: 0, orderedListNumber: null, parent: null, glueProse: false, quotesAround: around })
      );

    case 'code': {
      const lang = t.lang ?? '';
      const text = expandTabs(t.text, ctx.tabWidth);
      if (!lang && t.codeBlockStyle !== 'indented') return text.replace(/\S(?:.*\S)?/g, theme.permission) + NL;
      const base = lang.match(/^[\w.+#-]+/)?.[0] ?? '';
      const language =
        highlight && lang && highlight.supportsLanguage(lang) ? lang
        : highlight && base && highlight.supportsLanguage(base) ? base
        : 'plaintext';
      const label = lang && !highlight?.supportsLanguage(lang) ? chalk.dim(lang) + NL : '';
      if (!highlight) return label + text + NL;
      return label + highlight.highlight(text, { language }) + NL;
    }

    case 'codespan':
      return theme.permission(t.text);

    case 'em':
      return chalk.italic(inline(t.tokens, ctx, { parent, glueProse }));

    case 'strong':
      return chalk.bold(inline(t.tokens, ctx, { parent, glueProse }));

    case 'del': {
      const s = inline(t.tokens, ctx, { parent, glueProse });
      return chalk.level > 0 ? chalk.strikethrough(s) : `~~${s}~~`;
    }

    case 'heading': {
      const style = t.depth === 1 ? chalk.bold.italic.underline : chalk.bold;
      return style(inline(t.tokens, ctx, { parent: null })) + NL + NL;
    }

    case 'hr':
      // Claude Code prints a literal "---"; md draws a grey line across the width (see RULE)
      return RULE + NL;

    case 'image': {
      if (!t.text && !t.title) return t.href;
      const title = t.title ? ` "${t.title}"` : '';
      return t.text ? `${t.text} (${t.href}${title})` : `(${t.href}${title})`;
    }

    case 'link': {
      const title = t.title ? ` ("${t.title}")` : '';
      if (/^mailto:/i.test(t.href)) {
        const address = t.href.replace(/^mailto:/i, '');
        return (t.text && t.text !== address ? `${t.text} (${address})` : address) + title;
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
            glueProse: false,
            listIndent,
          })
        )
        .join('');

    case 'list_item': {
      const marker = listMarker(
        listDepth,
        orderedListNumber !== null && parent?.type === 'list' ? { number: orderedListNumber, ...listBounds(parent) } : null
      );
      const hang = listIndent + ' '.repeat(width(marker) + 1);
      const childIndent = ' '.repeat(Math.min(hang.length, MAX_LIST_INDENT));
      const tokens = (t.tokens ?? []).filter((x) => x.type !== 'checkbox');
      const start = tokens.findIndex((x) => x.type !== 'space');
      const body = start === -1 ? [] : tokens.slice(start);
      const opensWithBlock = body[0] !== undefined && BLOCK_TYPES.has(body[0].type);
      let needsMarker = !opensWithBlock;

      const out = body
        .map((x) => {
          const s = render(x, { ...ctx, listDepth: listDepth + 1, orderedListNumber, parent: t, glueProse: false, listIndent: childIndent });
          if (x.type === 'code' && s === NL) return '';
          if (BLOCK_TYPES.has(x.type) || x.type === 'space')
            return x.type === 'blockquote' || x.type === 'hr' || x.type === 'table' ? s.replace(/^\n+/, '') : s;
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

    case 'paragraph':
      return inline(t.tokens, ctx, { parent: null }) + NL;

    case 'space':
    case 'br':
      return NL;

    case 'text': {
      // A single newline inside a paragraph is a soft break: render it as a space so files that
      // are hard-wrapped in the source reflow to the terminal width. (Claude Code keeps these
      // newlines, which suits its own output but not a hard-wrapped file.) Hard breaks are 'br' tokens.
      const soft = t.tokens ? t.text : t.text.replace(/[ \t]*\n[ \t]*/g, ' ');
      if (parent?.type === 'link') return soft;
      const text = t.escaped === false ? soft.replace(/&(?:nbsp|#0{0,4}160|#[xX]0{0,4}[aA]0);/g, ' ') : soft;
      if (parent?.type === 'list_item') {
        const body = t.tokens ? inline(t.tokens, ctx, { listDepth, orderedListNumber, parent: t, glueProse: true }) : glue(text);
        const task = parent.task && parent.tokens?.[0] === t ? `[${parent.checked ? 'x' : ' '}] ` : '';
        return `${task}${body}${NL}`;
      }
      return glueProse ? glue(text) : text;
    }

    case 'table':
      return pipeTable(t, ctx) + NL;

    case 'escape':
      return t.text;

    case 'html':
      // Claude Code prints HTML as written; md greys out comments
      return t.text.replace(/<!--[^]*?-->/g, (comment) => chalk.gray(comment));

    case 'def':
      return '';
  }
  return t.raw ?? '';
}

// Tables nested inside lists or quotes are drawn as plain pipe tables.
function pipeTable(t, ctx) {
  const cell = (tokens) => inline(tokens, ctx, { parent: null });
  const widths = t.header.map((h, i) =>
    Math.max(3, width(strip(cell(h.tokens))), ...t.rows.map((r) => width(strip(cell(r[i]?.tokens)))))
  );
  const row = (cells) =>
    ('| ' + cells.map((c, i) => pad(cell(c?.tokens), width(strip(cell(c?.tokens))), widths[i], t.align?.[i]) + ' | ').join('')).trimEnd();
  const out = [row(t.header), '|' + widths.map((w) => '-'.repeat(w + 2) + '|').join(''), ...t.rows.map(row)];
  return out.join(NL) + NL;
}
