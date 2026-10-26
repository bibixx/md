import { defineRule, type Context, type ESTree } from '@oxlint/plugins';

export interface Escape {
  start: number;
  text: string;
  fixed: string;
}

const HEX = /^[\da-f]+$/iu;

export function uppercaseHexEscapes(raw: string): Escape[] {
  const found: Escape[] = [];
  for (let i = 0; i < raw.length; i++) {
    if (raw[i] !== '\\') continue;
    const kind = raw[i + 1];
    let digits: string;
    let end: number;
    if (kind === 'x') {
      end = i + 4;
      digits = raw.slice(i + 2, end);
    } else if (kind === 'u' && raw[i + 2] === '{') {
      end = raw.indexOf('}', i) + 1;
      digits = end > 0 ? raw.slice(i + 3, end - 1) : '';
    } else if (kind === 'u') {
      end = i + 6;
      digits = raw.slice(i + 2, end);
    } else {
      i++; // some other escape, like \\ or \n: skip the escaped character
      continue;
    }
    if (!HEX.test(digits)) {
      i++;
      continue;
    }
    const text = raw.slice(i, end);
    if (/[A-F]/u.test(digits)) found.push({ start: i, text, fixed: text.toLowerCase() });
    i = end - 1;
  }
  return found;
}

function check(context: Context, node: ESTree.Node, raw: string | null): void {
  if (raw === null || !raw.includes('\\')) return;
  const { sourceCode } = context;
  // a template element's range can include its delimiters, so find the raw text within it
  const rawStart = node.range[0] + sourceCode.text.slice(node.range[0], node.range[1]).indexOf(raw);
  for (const escape of uppercaseHexEscapes(raw)) {
    const from = rawStart + escape.start;
    const to = from + escape.text.length;
    context.report({
      message: `Use lowercase hex digits in escapes: ${escape.text} → ${escape.fixed}`,
      loc: { start: sourceCode.getLocFromIndex(from), end: sourceCode.getLocFromIndex(to) },
      fix: (fixer) => fixer.replaceTextRange([from, to], escape.fixed),
    });
  }
}

export const lowercaseHexEscapes = defineRule({
  meta: {
    type: 'layout',
    fixable: 'code',
    docs: { description: 'Require lowercase hex digits in \\x, \\u and \\u{} escapes.' },
  },
  create(context) {
    return {
      Literal(node) {
        if (typeof node.raw === 'string') check(context, node, node.raw);
      },
      TemplateElement(node) {
        check(context, node, node.value.raw);
      },
    };
  },
});
