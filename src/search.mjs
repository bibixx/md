// Search in the viewer: matching against what's on screen (colours removed), highlighting
// matches inside styled lines, and editing the "/" prompt.

// The escape sequences md's lines contain: SGR styles and OSC 8 hyperlinks
const CODES = /\x1b\[[\d;]*m|\x1b\]8;;[^\x07]*\x07/g;
const CODE_AT = /\x1b\[[\d;]*m|\x1b\]8;;[^\x07]*\x07/y;

export const plain = (line) => line.replace(CODES, '');

// Literal text; case-insensitive unless the query has a capital letter (smart case).
export function matcher(query) {
  if (!query) return null;
  const source = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const flags = /\p{Lu}/u.test(query) ? 'u' : 'iu';
  return { query, test: new RegExp(source, flags), all: new RegExp(source, `g${flags}`) };
}

// Wrap each match in reverse video, keeping the line's own escape codes where they are.
export function highlight(line, m) {
  const ranges = [...plain(line).matchAll(m.all)].filter((r) => r[0].length > 0).map((r) => [r.index, r.index + r[0].length]);
  if (ranges.length === 0) return line;
  let out = '';
  let at = 0; // position in the plain text
  let next = 0;
  for (let i = 0; i < line.length; ) {
    CODE_AT.lastIndex = i;
    const code = CODE_AT.exec(line);
    if (code) {
      out += code[0];
      i += code[0].length;
      continue;
    }
    if (next < ranges.length && at === ranges[next][0]) out += '\x1b[7m';
    out += line[i++];
    at++;
    if (next < ranges.length && at === ranges[next][1]) (out += '\x1b[27m'), next++;
  }
  return out;
}

// One chunk of typing at the prompt → the new text, and done: 'submit' (enter),
// 'cancel' (esc), 'exit' (ctrl+c) or null while still typing.
export function editPrompt(text, chunk) {
  // escape sequences (arrows, mouse) are skipped; [^] with the u flag keeps emoji whole
  for (const [key] of chunk.matchAll(/\x1b\[<[\d;]*[Mm]|\x1b\[[\d;]*[A-Za-z~]|\x1b|[^]/gu)) {
    if (key === '\r' || key === '\n') return { text, done: 'submit' };
    if (key === '\x1b') return { text, done: 'cancel' };
    if (key === '\x03') return { text, done: 'exit' };
    if (key === '\x7f' || key === '\b') text = [...text].slice(0, -1).join('');
    else if (key === '\x15') text = ''; // ctrl+u
    else if (!key.startsWith('\x1b') && key >= ' ') text += key;
  }
  return { text, done: null };
}
