# AGENTS.md

Guidance for coding agents working in this repository.

`md` renders markdown in the terminal the way Claude Code renders its replies, plus a full-screen viewer. TypeScript, run directly by Bun with no build step. Before finishing a change, run all three: `bun test`, `bun run typecheck` (strict `tsc`; Bun itself doesn't type-check) and `bun run lint` (strict oxlint with type-aware rules). Fix what the linter reports rather than disabling rules or adding `oxlint-disable` comments; if a rule really doesn't fit, ask before switching it off. `.oxlintrc.json` says why each disabled rule is off.

## Commands

```sh
bun test                                              # all unit tests
bun run typecheck                                     # tsc, strict; Bun itself doesn't type-check
bun run lint                                          # oxlint, strict and type-aware, plus md's own rules
bun test test/table.test.ts                          # one file
bun test -t "header: value"                           # tests whose name matches (regex)
bun bin/md.ts fixtures/03-lists.md                   # viewer (always, in a terminal)
bun bin/md.ts -p -w 60 fixtures/02-tables-wrapping.md    # print at a fixed width
docs/screenshot.sh                                    # regenerate docs/screenshot.png (VHS + ImageMagick)
```

After `bun link`, `md` in `~/.bun/bin` points at the checkout, so edits take effect immediately. The viewer's behaviour is covered by `test/viewer.test.ts`. To watch it in a real terminal session without a terminal window, run it under `script -q log bash -c "stty cols 80 rows 20; bun bin/md.ts FILE"` and pipe keys in.

Tests use `bun:test` (`test`, `expect`, `spyOn`). `test/snapshots.test.ts` renders every fixture (plain at 40 and 80 columns, colour at 80) and compares the output with `test/__snapshots__/`. After an intended change to the output, run `bun test --update-snapshots` and read the snapshot diff before committing.

**Bun first:** use Bun's APIs (`Bun.file`, `Bun.write`, `Bun.stdin`, `Bun.Glob`, `Bun.env`, `Bun.argv`, `Bun.spawn`, `import.meta.require`, `bun:test`) instead of Node's. The linter bans the Node versions; the only Node APIs left are the ones Bun has no equivalent for (`openSync` for `/dev/tty`, `mkdtempSync`, `node:tty`, `node:os`, `node:path`).

## Goal and where it deviates

Output should look like Claude Code's. Anything that intentionally differs from Claude Code is listed under "Deliberate differences" in `fixtures/README.md`. Behaviour not yet compared on screen is listed under "Open questions" there. Keep both tables current when behaviour changes.

`marked` is pinned to 15 on purpose. Version 15 has no `checkbox` tokens and gives loose list items `text` tokens, which the list rendering and spacing rely on; marked ≥16 changes both.

## Architecture

The pipeline goes from source to tokens, then styled strings, then width-independent units, then wrapped lines on demand.

- **`src/types.ts`:** the shapes shared across modules: `RenderContext`, `Unit`, `Position`, `Theme`, `Highlighter`, `Padding`.
- **`src/tokens.ts`:** `render(token, ctx)` turns one marked token into an ANSI string. Block tokens end with their own newlines. marked's `Token` type also allows extension tokens of any `type`, which stops `switch (t.type)` from narrowing, so `isMarkedToken()` checks for marked's built-in types at runtime instead of casting. md uses no extensions; anything else is printed as written.
- **`src/layout.ts`:** `segments(src, ctx)` does everything that doesn't depend on width, once. It parses, styles, and runs the spacing state machine (`lastBox`, `proseEndedBlank`) to decide where blank lines go. It returns units `{ blankLineAbove, render(cols), estimate(cols) }`. Units are:
  - a line of prose
  - a whole code block
  - a top-level list item
  - a table
  - a line of a quote

  `layout(src, ctx, cols)` renders every unit; printing and most tests use it.
- **`src/lists.ts`:** list layout: markers, hanging indents, nested lists, and the code, quotes and tables inside items.
- **`src/document.ts`:** holds the units, caches each unit's lines for the current width (`setWidth` drops the cache), and applies page padding.
- **`src/viewport.ts`:** scrolling over a position `{ unit, offset }`. `down`, `up`, `lastScreenTop`, `screen`, `find` and `position` lay out only the units they touch; the footer shows `~` estimates until the background layout finishes.
- **`src/pager.ts`:** the viewer, a `Viewer` class. It handles the alternate screen, mouse wheel, help, and `/` search (logic in `src/search.ts`), with one handler per key action in `handle()`. It also fills in the rest of the layout in 8 ms `setImmediate` slices. It takes a `Terminal` (input, output, exit), so `test/viewer.test.ts` drives it through a fake one; `page()` wires up the real terminal and process signals.
- **`src/keys.ts`:** `parseInput` splits a chunk of terminal input into `Action`s.
- **`src/table.ts`:** box tables: column fitting and the vertical `Header: value` fallback for tables that can't fit. Unlike Claude Code, `spreadSpareColumns()` widens wrapped tables to the full width.
- **`src/text.ts`:** width-dependent primitives, built on Bun's native `Bun.stringWidth`, `Bun.stripANSI` and `Bun.wrapAnsi`:
  - `wrapText` / `wrapCell` (see the invariants below)
  - the `RULE_PLACEHOLDER` line that `wrapText` expands into a full-width horizontal rule
  - `expandTabs`
  - `codeBlock` (background and inset)
- **`src/highlight.ts`:** converts highlight.js HTML output to ANSI using a scope→colour map, with dotted scopes falling back to their parent. It registers languages on `highlight.js/lib/core` on demand, using `src/hljs-languages.json` (names, aliases, and the languages each one embeds, like JavaScript inside HTML). That file is generated by `bun run gen:languages`; regenerate it after upgrading highlight.js, and a test fails if it's stale.
- **`bin/md.ts`:** CLI flags, config (`src/config.ts`: `loadConfig(file = configPath())`, from `$XDG_CONFIG_HOME/md/config.json`), and choosing between the viewer (stdout is a terminal) and printing (`-p`, or piped).
- **`lint/`:** md's own oxlint rules, loaded through `jsPlugins` in `.oxlintrc.json`. `md/lowercase-hex-escapes` requires lowercase hex in `\x`, `\u` and `\u{}` escapes, because `unicorn/escape-case` can only require uppercase.

### Invariants that tests enforce

- **Independent units:** a unit's `render(cols)` must depend only on `cols`. Anything else belongs in `segments()`. `viewport.test.ts` checks that any scrolled screen equals the same slice of `layout()`.
- **Safe line splitting:** splitting styled text on `\n` is safe because chalk re-opens styles on every line. Prose and quote units rely on this.
- **Lazy code blocks:** until a code block is first shown, its raw text stands in for it in `prose`, so highlighting must never change line breaks. `lazy-highlight.test.ts` checks that the coloured and plain output line up line for line across all fixtures.
- **Wrapping:** wrapping keeps a line's leading indentation and trims the space at the break. wrap-ansi's `trim: false` would count that space against the width.

### Test notes

- **Highlighting tests run in fresh processes:** `bun test` runs every file in one process, and importing the full `highlight.js` package registers all languages on the same instance md loads into. So the on-demand-versus-everything comparison spawns separate `bun -e` processes.

- **Plain rendering:** `test/helpers.ts` `renderPlain` renders with `chalk.level = 0`. Without colour, strikethrough falls back to literal `~~` and code backgrounds aren't padded, both on purpose.
- **Config tests:** `loadConfig()` takes the file's path, so tests pass their own temporary file rather than changing `XDG_CONFIG_HOME`.
- **Lint rule tests:** oxlint's `RuleTester` only runs on Node and Deno, so `lint-lowercase-hex-escapes.test.ts` runs the real `oxlint` over `test/lint-samples/` (excluded from linting), checking the reported problems and the `--fix` result against a `.fixed.ts` file. Build escapes in that test from a backslash constant, or the project's own lint flags them.
- **Performance test:** `large-file.test.ts` is a 500 ms budget on a ~720 KB document. The test runner's `timeout` can't interrupt synchronous code, so it also asserts the elapsed time and that under 10% of units were laid out.

## Comments

These rules cover explanatory prose. Directives are code: never delete, move or reword shebangs, `@ts-expect-error` or `oxlint-disable` comments to satisfy them.

Write no comments by default. Add one only when a reader can't get the fact from the repo. Ask: could someone reading the repo get this fact?

| Answer | Action |
|---|---|
| Yes, at a glance | Delete the comment. |
| Yes, by tracing a few files, and the code could link them directly | Fix the code: extract a function, name the value, tighten the type. |
| Yes, by tracing, but nothing connects them (no type, import or call) | Comment, and name both ends. |
| No, it came from outside the repo | Comment, and state the fact in full: a library or terminal quirk, a spec, how Claude Code behaves, a measured number. |

Wanting to write a comment usually points at a code problem: explaining a block of control flow means extract a named function; explaining what a value holds means rename it; a section banner means split the file; a comment that exists because a function is long means split the function.

- **Length:** at most 2 lines. Shrink it to the one constraint the reader needs, or delete it. Don't restate what the code shows.
- **Stand-alone:** a comment must make sense with only the checkout, with no chat or PR context.
- **JSDoc:** only on exported types and functions whose name doesn't say it all. Not on module-local helpers, or on things exported only so a test can reach them.
- **Never:** change narration ("we now", "no longer", "previously", "renamed from"), the author's reasoning or rejected approaches (those go in the commit message), restating the line below, section banners, file-header preambles, commented-out code.
- **Constraint, not citation:** when a real constraint comes with a citation, keep the constraint and drop the citation.
- **Existing comments:** keep them, and TODOs, unless your change resolves them. "No comments" means don't add any; it doesn't mean deleting existing reasons.
- **Required:** a reason on every `as` cast that isn't obviously safe, on a deliberately empty `catch`, and on every lint opt-out (`.oxlintrc.json` has one next to each disabled rule).
