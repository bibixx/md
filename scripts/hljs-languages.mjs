// Writes src/hljs-languages.json: every highlight.js language with its aliases and the languages
// it embeds (HTML highlights <script> as JavaScript, for example), so md can load languages on
// demand. Run `bun run gen:languages` after upgrading highlight.js; a test fails if it's stale.
import fs from 'node:fs';
import path from 'node:path';
import hljs from 'highlight.js';

// languages a definition hands parts of its text to, found anywhere in its (cyclic) mode tree
function embedded(definition) {
  const found = new Set();
  const seen = new Set();
  const walk = (node) => {
    if (!node || typeof node !== 'object' || seen.has(node)) return;
    seen.add(node);
    if (node.subLanguage) for (const name of [node.subLanguage].flat()) found.add(name);
    for (const value of Object.values(node)) walk(value);
  };
  walk(definition);
  return [...found].filter((name) => hljs.getLanguage(name)).sort();
}

const index = { names: hljs.listLanguages().sort(), aliases: {}, embeds: {} };
for (const name of index.names) {
  const language = hljs.getLanguage(name);
  for (const alias of language.aliases ?? []) index.aliases[alias.toLowerCase()] = name;
  const embeds = embedded(language).filter((other) => other !== name);
  if (embeds.length) index.embeds[name] = embeds;
}

const out = path.join(import.meta.dirname, '..', 'src', 'hljs-languages.json');
fs.writeFileSync(out, JSON.stringify(index, null, 2) + '\n');
console.log(`${index.names.length} languages, ${Object.keys(index.aliases).length} aliases → ${path.relative(process.cwd(), out)}`);
