import hljs from 'highlight.js';
import chalk from 'chalk';

const plain = (s) => s;

// Scope → style, same palette Claude Code applies to highlight.js output.
const styles = new Map(
  Object.entries({
    keyword: chalk.blue,
    built_in: chalk.cyan,
    type: chalk.cyan.dim,
    literal: chalk.blue,
    number: chalk.green,
    regexp: chalk.red,
    string: chalk.red,
    subst: plain,
    symbol: plain,
    class: chalk.blue,
    function: chalk.yellow,
    title: plain,
    'title.function': chalk.yellow,
    'title.class': chalk.blue,
    params: plain,
    comment: chalk.green,
    doctag: chalk.green,
    meta: chalk.grey,
    'meta.keyword': plain,
    'meta.string': plain,
    section: plain,
    tag: chalk.grey,
    name: chalk.blue,
    attr: chalk.cyan,
    attribute: plain,
    variable: plain,
    bullet: plain,
    code: plain,
    emphasis: chalk.italic,
    strong: chalk.bold,
    link: chalk.underline,
    quote: plain,
    addition: chalk.green,
    deletion: chalk.red,
  })
);

// "title.function.invoke" falls back to "title.function", then "title"
function styleFor(scope) {
  for (let s = scope; ; s = s.slice(0, s.lastIndexOf('.'))) {
    const style = styles.get(s);
    if (style) return style;
    if (!s.includes('.')) return undefined;
  }
}

const entities = { amp: '&', lt: '<', gt: '>', quot: '"', '#x27': "'", '#39': "'" };
const unescape = (s) => s.replace(/&(amp|lt|gt|quot|#x27|#39);/g, (_, e) => entities[e]);

// highlight.js emits <span class="hljs-title function_">; that's scope "title.function"
function scopeOf(className) {
  const [first, ...rest] = className.split(' ');
  return [first.replace(/^hljs-/, ''), ...rest.map((c) => c.replace(/_+$/, ''))].join('.');
}

function toAnsi(html) {
  const stack = [{ style: plain, text: '' }];
  for (const [, open, close, text] of html.matchAll(/<span class="([^"]*)">|(<\/span>)|([^<]+)/g)) {
    if (open !== undefined) stack.push({ style: styleFor(scopeOf(open)) ?? plain, text: '' });
    else if (close !== undefined) {
      const node = stack.pop();
      stack.at(-1).text += node.style(node.text);
    } else stack.at(-1).text += unescape(text);
  }
  return stack[0].text;
}

export const highlighter = {
  supportsLanguage: (lang) => hljs.getLanguage(lang) !== undefined,
  highlight(code, { language }) {
    // highlight.js logs a warning before throwing for an unknown language
    if (!hljs.getLanguage(language)) return code;
    try {
      return toAnsi(hljs.highlight(code, { language, ignoreIllegals: true }).value);
    } catch {
      return code;
    }
  },
};
