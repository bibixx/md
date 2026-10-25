# md

A terminal markdown renderer that looks like Claude Code's replies: box-drawn tables that fit the window, syntax-highlighted code, clickable links. Long documents open in a full-screen viewer with search, which stays fast on large files.

```sh
md README.md          # full-screen viewer if it doesn't fit on screen, otherwise prints
md -p README.md       # always print
cat notes.md | md     # read from stdin
md -w 80 README.md    # render at a fixed width
```

## Install

Requires [Bun](https://bun.sh) 1.4 or newer.

```sh
git clone https://github.com/bibixx/md.git
cd md
bun install
bun link              # adds `md` to ~/.bun/bin, pointing at this checkout
```

`~/.bun/bin` needs to be on your `PATH`. Bun's install script adds it; a Homebrew install doesn't.

## The viewer

When the document is taller than the window, `md` opens it full screen. It re-wraps when you resize the window.

| Keys | |
|------|---|
| `j` `k` `↑` `↓`, scroll wheel | Scroll by line (the wheel moves three) |
| `space` `b`, `PgDn` `PgUp` | Scroll by screen |
| `d` `u` | Scroll by half a screen |
| `g` `G`, `Home` `End` | Top / bottom |
| `/` | Search |
| `n` `N` | Next / previous match |
| `esc` | Clear the search, or quit |
| `?` | Help |
| `q` | Quit |

Search matches the text as it's shown, with colours removed. It's literal, not a regex, and ignores case unless the query has a capital letter. As in `less`, a match split across a wrapped line isn't found.

While the viewer is open it captures the mouse for the scroll wheel, so selecting text needs your terminal's override key, for example Option+drag in iTerm2.

## Options

```
-p, --print        print instead of opening the viewer
-w, --width N      render at N columns (default: terminal width, or 100 when piped)
    --light        light theme colours (default: detected from COLORFGBG)
    --dark         dark theme colours
    --no-color     plain text
```

## Config

`~/.config/md/config.json`, or `$XDG_CONFIG_HOME/md/config.json`:

```json
{
  "padding": { "top": 1, "bottom": 1, "left": 2, "right": 2 },
  "codePadding": { "left": 1, "right": 1 },
  "tabWidth": 2
}
```

- **`padding`:** blank lines above and below the document, and spaces at its left and right edges.
- **`codePadding`:** blank rows and columns inside a code block's background.
- **`tabWidth`:** columns between tab stops in code. Tabs are expanded to spaces.

Both padding settings also accept `vertical` and `horizontal` shorthands; a specific side overrides a shorthand. The values shown are the defaults.

## How it compares with Claude Code

`md` is modelled on how Claude Code renders markdown:
- **Tables:** box borders, column fitting, and a `Header: value` layout for tables too tall or wide to fit.
- **Lists:** `-` bullets; numbered lists go `1.` → `a.` → `i.` as they nest.
- **Headings, code, links and quotes:** the same styles and colours.
- **Spacing:** the same blank lines between blocks.

Where `md` deliberately differs, it's to suit files rather than chat replies:
- **Line breaks:** single newlines inside a paragraph become spaces, so hard-wrapped files reflow to the window width.
- **Tables:** wrapped tables fill the full width.
- **Lists:** code, quotes and tables inside list items are indented under the item.
- **Rules and comments:** horizontal rules are drawn as a grey line, and HTML comments are grey.
- **Code blocks:** they get a faint background.

The full list, and the behaviour still to be compared side by side, is in [`fixtures/README.md`](fixtures/README.md).

`md` is not affiliated with or endorsed by Anthropic.

## Performance

The viewer lays out only what's on screen. Parsing and styling happen once, when the file opens. Line wrapping happens for each visible piece, so a resize only re-wraps one screenful. Code is highlighted the first time it comes into view. The rest of the document is laid out in the background, and until that finishes the footer shows approximate line numbers (`~`). On a 720 KB file, the first screen appears about 150 ms after starting, and a resize takes about 3 ms.

## Development

```sh
bun test                          # unit tests
bun bin/md.mjs fixtures/05-code.md
```

`fixtures/` has markdown files covering each feature, for checking output by eye and comparing it with Claude Code. [`AGENTS.md`](AGENTS.md) describes the architecture and the rules the tests enforce.

## License

[MIT](LICENSE)
