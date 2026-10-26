import path from 'node:path';
import hljs, { type Language } from 'highlight.js';

function embeddedLanguages(definition: Language): string[] {
  const found = new Set<string>();
  // highlight.js mode trees are cyclic
  const seen = new Set<object>();
  const walk = (node: unknown): void => {
    if (typeof node !== 'object' || node === null || seen.has(node)) return;
    seen.add(node);
    const { subLanguage } = node as { subLanguage?: string | string[] };
    if (subLanguage !== undefined) for (const name of [subLanguage].flat()) found.add(name);
    for (const value of Object.values(node)) walk(value);
  };
  walk(definition);
  return [...found].filter((name) => hljs.getLanguage(name) !== undefined).toSorted();
}

const index = { names: hljs.listLanguages().toSorted(), aliases: {} as Record<string, string>, embeds: {} as Record<string, string[]> };
for (const name of index.names) {
  const language = hljs.getLanguage(name);
  if (!language) continue;
  for (const alias of language.aliases ?? []) index.aliases[alias.toLowerCase()] = name;
  const embeds = embeddedLanguages(language).filter((other) => other !== name);
  if (embeds.length > 0) index.embeds[name] = embeds;
}

const out = path.join(import.meta.dirname, '..', 'src', 'hljs-languages.json');
await Bun.write(out, JSON.stringify(index, null, 2) + '\n');
await Bun.write(Bun.stdout, `${index.names.length} languages, ${Object.keys(index.aliases).length} aliases → ${path.relative(process.cwd(), out)}\n`);
