# AGENTS.md

Guidance for coding agents working in this repository.

`md` renders markdown in the terminal the way Claude Code renders its replies, plus a full-screen viewer. Plain Node ESM, no build step, no linter.

## Commands

```sh
npm test                                              # all unit tests (node --test test/*.test.mjs)
node --test test/table.test.mjs                       # one file
node --test --test-name-pattern="header: value" test/table.test.mjs   # one test by name (regex)
node bin/md.mjs fixtures/03-lists.md                  # viewer (when output is taller than the screen)
node bin/md.mjs -p -w 60 fixtures/02-tables-wrapping.md   # print at a fixed width
```

After `npm link`, `md` on PATH points at the checkout, so edits take effect immediately. To exercise the viewer without a real terminal, run it under `script -q log bash -c "stty cols 80 rows 20; node bin/md.mjs FILE"` and pipe keys in.

## Goal and where it deviates

Output should look like Claude Code's. Anything that intentionally differs from Claude Code is listed under "Deliberate differences" in `fixtures/README.md`. Behaviour not yet compared on screen is listed under "Open questions" there. Keep both tables current when behaviour changes.

`marked` is pinned to 15 on purpose. Version 15 has no `checkbox` tokens and gives loose list items `text` tokens, which the list rendering and spacing rely on; marked ≥16 changes both.

## Architecture

The pipeline goes from source to tokens, then styled strings, then width-independent units, then wrapped lines on demand.

- **`src/tokens.mjs`:** `render(token, ctx)` turns one marked token into an ANSI string. Block tokens end with their own newlines.
- **`src/layout.mjs`:** `segments(src, ctx)` does everything that doesn't depend on width, once. It parses, styles, and runs the spacing state machine (`prev`, `proseEndedBlank`) to decide where blank lines go. It returns units `{ blank, render(cols), estimate(cols) }`. Units are:
  - a line of prose
  - a whole code block
  - a top-level list item
  - a table
  - a line of a quote

  `layout(src, ctx, cols)` renders every unit; printing and most tests use it.
- **`src/document.mjs`:** holds the units, caches each unit's lines for the current width (`setWidth` drops the cache), and applies page padding.
- **`src/viewport.mjs`:** scrolling over a position `{ unit, offset }`. `down`, `up`, `lastTop`, `screen`, `find` and `position` lay out only the units they touch; the footer shows `~` estimates until the background layout finishes.
- **`src/pager.mjs`:** the viewer. It handles the alternate screen, mouse wheel, input parsing (`parseInput`), help, and `/` search (logic in `src/search.mjs`). It also fills in the rest of the layout in 8 ms `setImmediate` slices.
- **`src/table.mjs`:** box tables: column fitting and the vertical `Header: value` fallback for tables that can't fit. Unlike Claude Code, `fill()` widens wrapped tables to the full width.
- **`src/text.mjs`:** width-dependent primitives:
  - `wrapText` / `wrapCell` (see the invariants below)
  - the `RULE` placeholder that `wrapText` expands into a full-width horizontal rule
  - `expandTabs`
  - `codeBlock` (background and inset)
- **`src/highlight.mjs`:** converts highlight.js HTML output to ANSI using a scope→colour map, with dotted scopes falling back to their parent.
- **`bin/md.mjs`:** CLI flags, config (`src/config.mjs`, read from `~/.config/md/config.json`), and the "does it overflow the screen?" check, which lays out only until it overflows.

### Invariants that tests enforce

- **Independent units:** a unit's `render(cols)` must depend only on `cols`. Anything else belongs in `segments()`. `viewport.test.mjs` checks that any scrolled screen equals the same slice of `layout()`.
- **Safe line splitting:** splitting styled text on `\n` is safe because chalk re-opens styles on every line. Prose and quote units rely on this.
- **Lazy code blocks:** until a code block is first shown, its raw text stands in for it in `prose`, so highlighting must never change line breaks. `lazy-highlight.test.mjs` checks that the coloured and plain output line up line for line across all fixtures.
- **Wrapping:** wrapping keeps a line's leading indentation and trims the space at the break. wrap-ansi's `trim: false` would count that space against the width.

### Test notes

- **Plain rendering:** `test/helpers.mjs` `renderPlain` renders with `chalk.level = 0`. Without colour, strikethrough falls back to literal `~~` and code backgrounds aren't padded, both on purpose.
- **Config tests:** `CONFIG_PATH` is resolved when the module loads, so config tests import `config.mjs?case=N` afresh per case.
- **Performance test:** `large-file.test.mjs` is a 500 ms budget on a ~720 KB document. `node:test`'s `timeout` can't interrupt synchronous code, so it also asserts the elapsed time and that under 10% of units were laid out.
