# Fixtures

Markdown files for comparing `md` with how Claude Code renders the same content.

## How to compare

1. In a Claude Code session, ask it to repeat a fixture as its reply:

   > Reply with the exact contents of fixtures/03-lists.md as your message. Not in a code block, no commentary.

2. In another window of the same width, run `md fixtures/03-lists.md`.

Claude Code indents its replies by 2 columns (the `⏺` gutter), so a window 2 columns wider for `md`, or `"left": 2, "right": 0` in the config, lines them up.

## Open questions: where md might not match Claude Code

These haven't been compared with Claude Code on screen yet:

| What | Fixture | What md does now |
|------|---------|------------------|
| Loose list (blank lines between items) | `03` | No blank lines between the items |
| Light or dark colours | `10` | Picked from `COLORFGBG`; try `md --light` / `md --dark` |
| HTML entities (`&amp;`, `&copy;`) | `06` | Shown as written, not decoded; `&nbsp;` becomes a space |
| Indented (4-space) code block | `05` | No blank line between it and the next paragraph |
| Issue references (`#123`, `owner/repo#4`) | `06` | Plain text; Claude Code links them to the current repo's issues |
| Bare URLs and code spans that are URLs | `06` | Plain text when not clickable |
| Link with a title | `06` | Shows `("title")` after the link |

## Deliberate differences

| What | Fixture | Why |
|------|---------|-----|
| Single newlines inside a paragraph become spaces | `09` | Claude Code keeps them, which breaks hard-wrapped files |
| Wrapped tables fill the full width | `02` | Claude Code leaves 4 columns free and loses a few more to rounding; md's padding handles the edges |
| No space at the start of a wrapped line | `02`, `09` | Claude Code wraps table cells with trimming off, which leaves the space it broke at on the next line |
| Padding around the document | all | Set in the config file (see the main README) |
| Code, quotes and tables inside list items are indented under the item, and tables are boxes | `04` | Claude Code prints them at column 0, and tables as raw pipe text |
| Horizontal rules (`---`, `***`, `___`) are a grey line across the width | `07` | Claude Code prints a literal `---` |
| HTML comments (`<!-- … -->`) are grey | `06` | Claude Code prints them like any other HTML |
| Code blocks have a faint background | `05` | Claude Code has none; `codePadding` in the config sets an inset |
| Tabs in code become spaces (`tabWidth`, default 2) | `05` | Claude Code passes them through; the terminal skips over cells without painting them, which leaves holes in the background |

## Files

| File | Covers |
|------|--------|
| `01-tables-basic.md` | Natural-width tables, alignment, formatting in cells, empty cells |
| `02-tables-wrapping.md` | Wrapping cells, the vertical fallback, cut words, wide characters |
| `03-lists.md` | Nesting, ordered markers by depth, start numbers, tasks, loose lists |
| `04-lists-with-blocks.md` | Code, quotes and tables inside items; lazy continuation lines |
| `05-code.md` | Highlighting per language, no/unknown language, indented code, long lines, tabs |
| `06-inline.md` | Emphasis, code spans, every link form, images, escapes, entities, inline HTML |
| `07-headings-and-spacing.md` | Heading levels, setext headings, spacing between blocks, rules |
| `08-quotes.md` | Wrapping, multiple paragraphs, nesting, lists and code inside quotes |
| `09-line-breaks.md` | Soft breaks, hard breaks |
| `10-colours.md` | Theme colours: inline code, links, highlighting, quote bar |

For the viewer (scrolling, resizing): `cat fixtures/*.md | md`.
