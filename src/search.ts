const STYLE_AND_LINK_CODES = /\x1b\[[\d;]*m|\x1b\]8;;[^\x07]*\x07/gu;
const STYLE_OR_LINK_CODE_AT = /\x1b\[[\d;]*m|\x1b\]8;;[^\x07]*\x07/yu;

const REVERSE_VIDEO = '\x1b[7m';
const REVERSE_VIDEO_OFF = '\x1b[27m';
const ENTER = '\r';
const ESC = '\x1b';
const BACKSPACE = '\x7f';
const CTRL_C = '\x03';
const CTRL_U = '\x15';

export const plain = (line: string): string => line.replaceAll(STYLE_AND_LINK_CODES, '');

export interface Matcher {
  query: string;
  pattern: RegExp;
  globalPattern: RegExp;
}

export function matcher(query: string): Matcher | null {
  if (query === '') return null;
  const source = query.replaceAll(/[.*+?^${}()|[\]\\]/gu, '\\$&');
  const smartCase = /\p{Lu}/u.test(query) ? 'u' : 'iu';
  return { query, pattern: new RegExp(source, smartCase), globalPattern: new RegExp(source, `g${smartCase}`) };
}

export function highlightMatches(line: string, m: Matcher): string {
  const ranges = [...plain(line).matchAll(m.globalPattern)].filter((r) => r[0].length > 0).map((r) => [r.index, r.index + r[0].length] as const);
  if (ranges.length === 0) return line;
  let out = '';
  let plainIndex = 0;
  let next = 0;
  for (let i = 0; i < line.length; ) {
    STYLE_OR_LINK_CODE_AT.lastIndex = i;
    const code = STYLE_OR_LINK_CODE_AT.exec(line);
    if (code) {
      out += code[0];
      i += code[0].length;
      continue;
    }
    if (plainIndex === ranges[next]?.[0]) out += REVERSE_VIDEO;
    out += line[i++];
    plainIndex++;
    if (plainIndex === ranges[next]?.[1]) {
      out += REVERSE_VIDEO_OFF;
      next++;
    }
  }
  return out;
}

const graphemes = new Intl.Segmenter();
function dropLastCharacter(text: string): string {
  const last = [...graphemes.segment(text)].at(-1);
  return last === undefined ? text : text.slice(0, last.index);
}

export type PromptResult = { text: string; done: 'submit' | 'cancel' | 'exit' | null };

export function editPrompt(text: string, chunk: string): PromptResult {
  // [^] with the u flag matches a whole code point, so emoji aren't split into surrogate halves
  for (const [key] of chunk.matchAll(/\x1b\[<[\d;]*[Mm]|\x1b\[[\d;]*[A-Za-z~]|\x1b|[^]/gu)) {
    if (key === ENTER || key === '\n') return { text, done: 'submit' };
    if (key === ESC) return { text, done: 'cancel' };
    if (key === CTRL_C) return { text, done: 'exit' };
    if (key === BACKSPACE || key === '\b') text = dropLastCharacter(text);
    else if (key === CTRL_U) text = '';
    else if (!key.startsWith(ESC) && key >= ' ') text += key;
  }
  return { text, done: null };
}
